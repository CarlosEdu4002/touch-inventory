const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("./connection");

const pasta = __dirname;
function arquivo(nome) {
    return { nome, sql: fs.readFileSync(path.join(pasta, nome), "utf8") };
}
const global = [
    arquivo("schema.global.sql"),
    arquivo("migrations/20261009_unidades.sql"),
    arquivo("migrations/20261010_contexto_requisicao.sql")
];
const patrimonial = [
    arquivo("schema.unidade.sql"),
    arquivo("migrations/20261005_limpezas_imagens.sql"),
    arquivo("migrations/20261006_lixeira_ativos.sql"),
    arquivo("migrations/20261007_checklists_revisoes.sql"),
    arquivo("migrations/20261014_checklist_imagens.sql")
];
const versaoIds = { "schema.global.sql": "20261001_global", "schema.unidade.sql": "20261001_patrimonial" };
const padraoAtivoGlobal = {
    nome: "20261009_id_ativo_global",
    sql: "ALTER TABLE ativos ALTER COLUMN id SET DEFAULT nextval('public.ativos_id_seq'::regclass)"
};

// A migração legada de checklists tem BEGIN/COMMIT externos para execução avulsa.
// Dentro da transação de inicialização omitimos somente esses dois delimitadores.
function dentroDaTransacaoDoChamador(migracao) {
    if (migracao.nome !== "migrations/20261007_checklists_revisoes.sql") return migracao.sql;
    const linhas = migracao.sql.split(/\r?\n/);
    const executaveis = linhas.map((linha, indice) => ({ texto: linha.trim(), indice }))
        .filter((linha) => linha.texto && !linha.texto.startsWith("--"));
    const primeiro = executaveis[0], ultimo = executaveis.at(-1);
    if (primeiro?.texto !== "BEGIN;" || ultimo?.texto !== "COMMIT;") {
        throw new Error("Delimitadores externos da migração de checklists não encontrados");
    }
    return linhas.filter((_, indice) => indice !== primeiro.indice && indice !== ultimo.indice).join("\n");
}
function nomeSchema(schema) {
    if (schema !== "public" && !/^unidade_[1-9][0-9]*$/.test(schema)) {
        throw new Error("Esquema de unidade inválido: " + schema);
    }
    return schema;
}
async function prepararRegistro(cliente) {
    await cliente.query(
        "CREATE TABLE IF NOT EXISTS public.migracoes_aplicadas (" +
        "escopo VARCHAR(12) NOT NULL CHECK (escopo IN ('global','unidade'))," +
        "schema_nome VARCHAR(80) NOT NULL, versao VARCHAR(120) NOT NULL," +
        "checksum CHAR(64) NOT NULL, aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()," +
        "PRIMARY KEY (escopo,schema_nome,versao))"
    );
}
async function aplicar(cliente, escopo, schema, migracao) {
    const versao = versaoIds[migracao.nome] || path.basename(migracao.nome, ".sql");
    const sql = dentroDaTransacaoDoChamador(migracao);
    // O mesmo SQL deve ter checksum igual em checkouts Windows (CRLF) e Linux (LF).
    const checksum = crypto.createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
    const resultado = await cliente.query(
        "SELECT checksum FROM public.migracoes_aplicadas WHERE escopo=$1 AND schema_nome=$2 AND versao=$3",
        [escopo, schema, versao]
    );
    if (resultado.rows.length) {
        if (resultado.rows[0].checksum !== checksum) {
            throw new Error("Migração já aplicada foi alterada: " + escopo + "/" + schema + "/" + versao);
        }
        return;
    }
    await cliente.query(sql);
    await cliente.query(
        "INSERT INTO public.migracoes_aplicadas(escopo,schema_nome,versao,checksum) VALUES($1,$2,$3,$4)",
        [escopo, schema, versao, checksum]
    );
}
async function estruturaUnidade(cliente, schema) {
    nomeSchema(schema);
    const existe = await cliente.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]);
    if (!existe.rows.length) throw new Error("Esquema cadastrado não existe: " + schema);
    await cliente.query('SET LOCAL search_path TO "' + schema + '"');
    for (const migracao of patrimonial) await aplicar(cliente, "unidade", schema, migracao);
    await aplicar(cliente, "unidade", schema, { ...padraoAtivoGlobal,
        sql: 'ALTER TABLE "' + schema + '".ativos ALTER COLUMN id ' +
            "SET DEFAULT nextval('public.ativos_id_seq'::regclass)"
    });
    await cliente.query("SET LOCAL search_path TO public");
}
async function criarEstruturaUnidade(cliente, schema) {
    if (schema === "public") throw new Error("A unidade inicial usa a estrutura existente em public");
    nomeSchema(schema);
    await cliente.query('CREATE SCHEMA "' + schema + '"');
    await estruturaUnidade(cliente, schema);
}
async function verificarCompatibilidade(cliente, schema) {
    const r = await cliente.query(
        "SELECT to_regclass(format('%I.ativos',$1::text)) IS NOT NULL AS ativos," +
        "to_regclass(format('%I.historico_ativos',$1::text)) IS NOT NULL AS historico," +
        "to_regclass(format('%I.checklist_modelos',$1::text)) IS NOT NULL AS checklist," +
        "to_regclass(format('%I.limpezas_imagens',$1::text)) IS NOT NULL AS imagens," +
        "to_regclass(format('%I.log_exclusoes_ativos',$1::text)) IS NOT NULL AS lixeira," +
        "EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid " +
        "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 " +
        "AND c.relname='ativos' AND t.tgname='agendar_checklist' AND NOT t.tgisinternal) AS gatilho",
        [schema]
    );
    if (Object.values(r.rows[0]).some((ok) => !ok)) {
        throw new Error("Estrutura patrimonial incompatível: " + schema);
    }
}
async function initDatabase() {
    if (process.env.INVENTARIO_TEST_SCHEMA) {
        // Compatibilidade temporária com fixtures antigas; MU-06 substituirá esse modo.
        await pool.query(fs.readFileSync(path.join(pasta, "schema.sql"), "utf8"));
        for (const migracao of patrimonial.slice(1)) await pool.query(migracao.sql);
        console.log("✅ Banco inicializado em esquema isolado de teste.");
        return;
    }
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await cliente.query("SELECT pg_advisory_xact_lock(67072028)");
        await cliente.query("SET LOCAL search_path TO public");
        await prepararRegistro(cliente);
        await aplicar(cliente, "global", "public", global[0]);
        await estruturaUnidade(cliente, "public");
        for (const migracao of global.slice(1)) await aplicar(cliente, "global", "public", migracao);
        const unidades = await cliente.query("SELECT schema_nome FROM public.unidades ORDER BY id");
        const schemas = new Set(["public"]);
        for (const unidade of unidades.rows) {
            nomeSchema(unidade.schema_nome);
            schemas.add(unidade.schema_nome);
            if (unidade.schema_nome !== "public") await estruturaUnidade(cliente, unidade.schema_nome);
        }
        for (const schema of schemas) await verificarCompatibilidade(cliente, schema);
        await cliente.query(fs.readFileSync(path.join(pasta, "reconciliar-sequencias.sql"), "utf8"));
        await cliente.query("COMMIT");
        console.log("✅ Banco inicializado; " + schemas.size + " esquema(s) patrimonial(is) compatível(is).");
    } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => {});
        console.error("Erro ao inicializar o banco:", erro);
        throw erro;
    } finally {
        cliente.release();
    }
}

module.exports = initDatabase;
module.exports.criarEstruturaUnidade = criarEstruturaUnidade;
