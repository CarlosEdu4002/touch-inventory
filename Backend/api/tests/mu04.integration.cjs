const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
if (process.env.MU04_DB_DESCARTAVEL !== "1" || process.env.DB_NAME !== "mu04_test" ||
    process.env.INVENTARIO_TEST_SCHEMA) {
    throw new Error("MU-04 exige PostgreSQL exclusivo e descartável mu04_test, sem bypass de multiunidades");
}
const pool = require("../database/connection");
const initDatabase = require("../database/init");
const contexto = require("../database/contexto-unidade");
const pasta = path.resolve(__dirname, "../database");
const ler = (nome) => fs.readFileSync(path.join(pasta, nome), "utf8");
const schemas = ["public", ...Array.from({ length: 8 }, (_, i) => "unidade_" + (i + 2))];
async function linha(sql, parametros = []) { return (await pool.query(sql, parametros)).rows[0]; }
async function popular(schema, numero) {
    return contexto.executar(schema, async () => {
        const setor = await linha("INSERT INTO setores(nome) VALUES($1) RETURNING id", ["Setor " + numero]);
        const categoria = await linha("INSERT INTO categorias(nome,setor_id) VALUES($1,$2) RETURNING id", ["Categoria " + numero, setor.id]);
        const tipo = await linha("INSERT INTO tipos_ativo(nome,categoria_id,permite_checklist,checklist_itens) VALUES($1,$2,TRUE,'[\"Conferir\"]'::jsonb) RETURNING id",
            ["Tipo " + numero, categoria.id]);
        const ativo = await linha("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio,checklist_proxima_data) VALUES($1,$2,$3,CURRENT_DATE + 1) RETURNING id",
            [tipo.id, setor.id, "MU04-" + numero]);
        await pool.query("INSERT INTO historico_ativos(ativo_id,patrimonio,tipo_ativo_id,usuario_nome,acao) VALUES($1,$2,$3,'Teste','criacao')",
            [ativo.id, "MU04-" + numero, tipo.id]);
        const grupo = await linha("INSERT INTO grupos_ativos(nome) VALUES($1) RETURNING id", ["Grupo " + numero]);
        await pool.query("INSERT INTO grupos_ativos_membros(grupo_id,ativo_id) VALUES($1,$2)", [grupo.id, ativo.id]);
    });
}
async function assinatura(schema) {
    return contexto.executar(schema, async () => ({
        ativos: (await pool.query("SELECT id,patrimonio,revisao FROM ativos ORDER BY id")).rows,
        historico: (await linha("SELECT count(*)::int AS n FROM historico_ativos")).n,
        modelos: (await linha("SELECT count(*)::int AS n FROM checklist_modelos")).n,
        ocorrencias: (await linha("SELECT count(*)::int AS n FROM checklist_ocorrencias")).n,
        grupos: (await linha("SELECT count(*)::int AS n FROM grupos_ativos_membros")).n
    }));
}
async function assinaturas() {
    const resultado = {};
    for (const schema of schemas) resultado[schema] = await assinatura(schema);
    return resultado;
}
async function prepararVersaoAnterior() {
    await pool.query(ler("schema.sql"));
    for (const nome of ["20261005_limpezas_imagens.sql", "20261006_lixeira_ativos.sql", "20261007_checklists_revisoes.sql"]) {
        await pool.query(ler("migrations/" + nome));
    }
    await pool.query("INSERT INTO public.usuarios(login,nome,senha_hash,perfil) VALUES('admin_mu04','Admin MU04','hash-de-teste','admin')");
    await pool.query(ler("migrations/20261009_unidades.sql"));
    await pool.query(ler("migrations/20261010_contexto_requisicao.sql"));
    for (let i = 2; i <= 9; i++) {
        const schema = "unidade_" + i;
        await pool.query("INSERT INTO public.unidades(id,nome,schema_nome) VALUES($1,$2,$3)", [i, "Unidade " + i, schema]);
        await pool.query('CREATE SCHEMA "' + schema + '"');
        const cliente = await pool.connect();
        try {
            await cliente.query('SET search_path TO "' + schema + '"');
            await cliente.query(ler("schema.unidade.sql"));
            for (const nome of ["20261005_limpezas_imagens.sql", "20261006_lixeira_ativos.sql", "20261007_checklists_revisoes.sql"]) {
                await cliente.query(ler("migrations/" + nome));
            }
            await cliente.query('ALTER TABLE "' + schema + '".ativos ALTER COLUMN id SET DEFAULT nextval(\'public.ativos_id_seq\'::regclass)');
        } finally {
            await cliente.query("RESET search_path");
            cliente.release();
        }
    }
    for (let i = 0; i < schemas.length; i++) await popular(schemas[i], i + 1);
    await pool.query("CREATE SCHEMA unidade_99");
    assert.equal((await linha("SELECT to_regclass('public.migracoes_aplicadas') AS registro")).registro, null);
    const dados = await assinaturas();
    assert.ok(Object.values(dados).every((d) => d.ativos.length === 1 && d.historico === 1 && d.modelos >= 1 && d.ocorrencias === 1 && d.grupos === 1));
    console.log(JSON.stringify({ fase: "versao_anterior", unidades: schemas.length, ativos: 9,
        historicos: 9, esquemasOrfaosPreservados: 1, registroVersionado: false }));
}
async function falhaIntermediaria() {
    const original = pool.connect;
    let atingiu = false;
    pool.connect = async () => {
        const cliente = await original();
        const consultar = cliente.query.bind(cliente);
        let schema = "public";
        cliente.query = async (sql, parametros) => {
            if (String(sql) === 'SET LOCAL search_path TO "unidade_5"') schema = "unidade_5";
            if (schema === "unidade_5" && !atingiu && String(sql).includes("CREATE TABLE IF NOT EXISTS log_exclusoes_ativos")) {
                await consultar(sql, parametros);
                atingiu = true;
                throw new Error("Falha induzida MU-04");
            }
            return consultar(sql, parametros);
        };
        const liberar = cliente.release.bind(cliente);
        cliente.release = () => { cliente.query = consultar; return liberar(); };
        return cliente;
    };
    const erroOriginal = console.error;
    try {
        console.error = () => {};
        await assert.rejects(initDatabase(), /Falha induzida MU-04/);
    } finally {
        console.error = erroOriginal;
        pool.connect = original;
    }
    assert.equal(atingiu, true);
    assert.equal((await linha("SELECT to_regclass('public.migracoes_aplicadas') AS registro")).registro, null,
        "Falha não pode gravar versões parciais");
}
async function migrarEValidar() {
    const antes = await assinaturas();
    await falhaIntermediaria();
    assert.deepEqual(await assinaturas(), antes);
    await Promise.all([initDatabase(), initDatabase()]);
    assert.deepEqual(await assinaturas(), antes);
    const total = await linha("SELECT count(*)::int AS n FROM public.migracoes_aplicadas");
    assert.equal(total.n, 3 + schemas.length * 5);
    const orfao = await linha("SELECT count(*)::int AS n FROM public.migracoes_aplicadas WHERE schema_nome='unidade_99'");
    assert.equal(orfao.n, 0);
    for (const schema of schemas) {
        const versoes = await linha("SELECT count(*)::int AS n FROM public.migracoes_aplicadas WHERE escopo='unidade' AND schema_nome=$1", [schema]);
        assert.equal(versoes.n, 5);
        const estrutura = await linha("SELECT to_regclass(format('%I.checklist_agenda_alteracoes',$1::text)) IS NOT NULL AS tabela, " +
            "EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname='incrementar_revisao') AS funcao, " +
            "EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace " +
            "WHERE n.nspname=$1 AND c.relname='ativos' AND t.tgname='agendar_checklist' AND NOT t.tgisinternal) AS gatilho", [schema]);
        assert.deepEqual(estrutura, { tabela: true, funcao: true, gatilho: true });
    }
    await initDatabase();
    assert.equal((await linha("SELECT count(*)::int AS n FROM public.migracoes_aplicadas")).n, total.n);
    assert.deepEqual(await assinaturas(), antes);
    const nova = await require("../services/unidades.service").criar({ nome: "Unidade 10" });
    assert.equal(nova.id, 100, "O esquema órfão 99 deve reservar seu número");
    assert.equal((await linha("SELECT count(*)::int AS n FROM public.migracoes_aplicadas WHERE escopo='unidade' AND schema_nome='unidade_100'")).n, 5);
    await initDatabase();
    const original = await linha("SELECT checksum FROM public.migracoes_aplicadas WHERE escopo='unidade' AND schema_nome='unidade_3' AND versao='20261007_checklists_revisoes'");
    await pool.query("UPDATE public.migracoes_aplicadas SET checksum=repeat('0',64) WHERE escopo='unidade' AND schema_nome='unidade_3' AND versao='20261007_checklists_revisoes'");
    const erroOriginal = console.error;
    try {
        console.error = () => {};
        await assert.rejects(initDatabase(), /Migração já aplicada foi alterada/);
    } finally { console.error = erroOriginal; }
    await pool.query("UPDATE public.migracoes_aplicadas SET checksum=$1 WHERE escopo='unidade' AND schema_nome='unidade_3' AND versao='20261007_checklists_revisoes'", [original.checksum]);
    await initDatabase();
    await pool.query('DROP TABLE "unidade_9".limpezas_imagens');
    const logOriginal = console.error;
    try {
        console.error = () => {};
        await assert.rejects(initDatabase(), /Estrutura patrimonial incompatível/);
    } finally { console.error = logOriginal; }
    console.log(JSON.stringify({ fase: "migrada", unidades: schemas.length, versoes: total.n,
        falhaComRollback: true, inicializacoesConcorrentes: true, reaplicacaoSemMudanca: true,
        checksumAlteradoBloqueouPartida: true, estruturaIncompativelBloqueouPartida: true, novaUnidadeVersionada: true, dadosPreservados: true }));
}
(process.env.MU04_FASE === "migrar" ? migrarEValidar() : prepararVersaoAnterior())
    .catch((erro) => { console.error(erro); process.exitCode = 1; })
    .finally(async () => { await pool.end(); });
