const assert = require("node:assert/strict");
if (process.env.MU02_DB_DESCARTAVEL !== "1" || process.env.DB_NAME !== "mu02_test" ||
    process.env.INVENTARIO_TEST_SCHEMA) {
    throw new Error("MU-02 exige PostgreSQL exclusivo e descartável mu02_test, sem bypass de multiunidades");
}
const pool = require("../database/connection");
const initDatabase = require("../database/init");
const unidades = require("../services/unidades.service");

async function valor(sql, parametros = []) {
    return (await pool.query(sql, parametros)).rows[0];
}
async function estado() {
    const cadastros = await valor("SELECT count(*)::int AS n FROM public.unidades");
    const esquemas = await pool.query(
        "SELECT nspname FROM pg_namespace WHERE nspname ~ '^unidade_[1-9][0-9]*$' ORDER BY nspname"
    );
    return { cadastros: cadastros.n, esquemas: esquemas.rows.map((r) => r.nspname) };
}
async function injetarFalha(nome, combina, depois) {
    const antes = await estado();
    const conectar = pool.connect;
    let disparou = false;
    pool.connect = async function () {
        const cliente = await conectar();
        const consultar = cliente.query.bind(cliente);
        cliente.query = async (sql, parametros) => {
            if (!disparou && combina(String(sql))) {
                disparou = true;
                if (depois) await consultar(sql, parametros);
                throw new Error("Falha induzida em " + nome);
            }
            return consultar(sql, parametros);
        };
        const liberar = cliente.release.bind(cliente);
        cliente.release = () => {
            cliente.query = consultar;
            return liberar();
        };
        return cliente;
    };
    try {
        await assert.rejects(unidades.criar({ nome: "Falha " + nome }), /Falha induzida/);
    } finally {
        pool.connect = conectar;
    }
    assert.equal(disparou, true, "Falha não foi disparada: " + nome);
    assert.deepEqual(await estado(), antes, "Operação parcial em " + nome);
}
async function inserirAtivo(schema, sufixo) {
    assert.match(schema, /^unidade_[1-9][0-9]*$/);
    const contexto = require("../database/contexto-unidade");
    return contexto.executar(schema, async () => {
        const setor = await valor("INSERT INTO setores(nome) VALUES($1) RETURNING id", ["Setor " + sufixo]);
        const categoria = await valor("INSERT INTO categorias(nome,setor_id) VALUES($1,$2) RETURNING id", ["Categoria " + sufixo, setor.id]);
        const tipo = await valor("INSERT INTO tipos_ativo(nome,categoria_id) VALUES($1,$2) RETURNING id", ["Tipo " + sufixo, categoria.id]);
        return valor("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,$3) RETURNING id",
            [tipo.id, setor.id, "MU02-" + sufixo]);
    });
}
async function principal() {
    await initDatabase();
    assert.deepEqual(await estado(), { cadastros: 0, esquemas: [] });
    const primeira = await unidades.criar({ nome: "Unidade A" });
    assert.equal(primeira.id, 1);
    const antesDuplicado = await estado();
    await assert.rejects(unidades.criar({ nome: "Unidade A" }), (e) => e.status === 409);
    assert.deepEqual(await estado(), antesDuplicado);
    const segunda = await unidades.criar({ nome: "Unidade B" });
    assert.ok(segunda.id > 2, "Falha de nome não deve reutilizar o ID consumido");
    const schemaB = "unidade_" + segunda.id;
    assert.ok((await estado()).esquemas.includes(schemaB));
    const etapas = [
        ["id", (sql) => sql.includes("nextval('public.unidades_id_seq')"), true],
        ["cadastro", (sql) => sql.includes("INSERT INTO public.unidades"), true],
        ["schema", (sql) => sql.startsWith("CREATE SCHEMA "), true],
        ["estrutura", (sql) => sql.includes("CREATE TABLE IF NOT EXISTS categorias") &&
            sql.includes("CREATE TABLE IF NOT EXISTS setores"), true],
        ["imagens", (sql) => sql.includes("CREATE TABLE IF NOT EXISTS limpezas_imagens"), true],
        ["lixeira", (sql) => sql.includes("CREATE TABLE IF NOT EXISTS log_exclusoes_ativos"), true],
        ["checklists", (sql) => sql.includes("CREATE TABLE IF NOT EXISTS checklist_modelos"), true],
        ["id_ativo_global", (sql) => sql.startsWith('ALTER TABLE "unidade_') &&
            sql.includes("public.ativos_id_seq"), true],
        ["antes_commit", (sql) => sql === "COMMIT", false]
    ];
    for (const [nome, combina, depois] of etapas) await injetarFalha(nome, combina, depois);
    const concorrentes = await Promise.allSettled([
        unidades.criar({ nome: "Mesmo nome concorrente" }),
        unidades.criar({ nome: "Mesmo nome concorrente" })
    ]);
    assert.equal(concorrentes.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(concorrentes.filter((x) => x.status === "rejected" && x.reason.status === 409).length, 1);
    const distintos = await Promise.all([
        unidades.criar({ nome: "Unidade C" }),
        unidades.criar({ nome: "Unidade D" })
    ]);
    assert.notEqual(distintos[0].id, distintos[1].id);
    const esquemaC = "unidade_" + distintos[0].id;
    const ativos = await Promise.all([
        inserirAtivo(schemaB, "B"),
        inserirAtivo(esquemaC, "C")
    ]);
    assert.notEqual(ativos[0].id, ativos[1].id, "IDs dos ativos devem usar a sequência global");
    const padrao = await require("../database/contexto-unidade").executar(schemaB, () => valor(
        "SELECT column_default AS d FROM information_schema.columns WHERE table_schema=$1 AND table_name='ativos' AND column_name='id'",
        [schemaB]
    ));
    assert.match(padrao.d, /public\.ativos_id_seq/);
    const atual = await estado();
    assert.equal(atual.esquemas.length, atual.cadastros - 1);
    await pool.query("CREATE SCHEMA unidade_500");
    await pool.query("SELECT setval('public.unidades_id_seq', 499, true)");
    console.log(JSON.stringify({ fase: "antes_reinicio", falhasInduzidas: etapas.length,
        duplicadoSemOrfao: true, concorrencia: true, idsAtivosGlobais: ativos.map((a) => a.id),
        cadastros: atual.cadastros, orfaoAntigoSimulado: "unidade_500" }));
}
async function depoisDoReinicio() {
    const anterior = await valor("SELECT last_value AS n FROM public.unidades_id_seq");
    assert.equal(Number(anterior.n), 499);
    await initDatabase();
    const seq = await valor("SELECT last_value AS n FROM public.unidades_id_seq");
    assert.ok(Number(seq.n) >= 500);
    const orfao = await valor("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname='unidade_500'");
    assert.equal(orfao.n, 1, "Esquema órfão antigo não pode ser apagado automaticamente");
    const criada = await unidades.criar({ nome: "Unidade após reinício" });
    assert.equal(criada.id, 501);
    assert.ok((await estado()).esquemas.includes("unidade_501"));
    const antesReaplicar = await valor("SELECT last_value AS n FROM public.unidades_id_seq");
    await initDatabase();
    const depoisReaplicar = await valor("SELECT last_value AS n FROM public.unidades_id_seq");
    assert.equal(String(depoisReaplicar.n), String(antesReaplicar.n));
    console.log(JSON.stringify({ fase: "apos_reinicio", sequenciaAntes: anterior.n,
        sequenciaAjustada: seq.n, unidadeCriada: criada.id, orfaoPreservado: true,
        reaplicacaoSemRecuo: true }));
}
(process.env.MU02_FASE === "apos_reinicio" ? depoisDoReinicio() : principal())
    .catch((erro) => { console.error(erro); process.exitCode = 1; })
    .finally(async () => { await pool.end(); });
