const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
if (process.env.RV_DB_DESCARTAVEL !== "1" || process.env.DB_NAME !== "rv_test" ||
    process.env.DB_HOST !== "127.0.0.1" || process.env.DB_PORT !== "55449" ||
    process.env.INVENTARIO_TEST_SCHEMA) {
    throw new Error("Fixture RV exige rv_test no PostgreSQL descartavel local, sem bypass");
}
const pool = require("../database/connection");
const initDatabase = require("../database/init");
const unidade = require("../services/unidades.service");
const contexto = require("../database/contexto-unidade");
const { criarSessao } = require("./unidade.fixture.cjs");
const { app } = require("../server");

async function main() {
    await initDatabase();
    const ocupacao = await pool.query(`
        SELECT (SELECT COUNT(*) FROM public.usuarios) AS usuarios,
               (SELECT COUNT(*) FROM public.unidades) AS unidades,
               (SELECT COUNT(*) FROM public.ativos) AS ativos,
               (SELECT COUNT(*) FROM public.setores) AS setores
    `);
    assert(Object.values(ocupacao.rows[0]).every(total => Number(total) === 0),
        "Fixture RV exige banco sem contas, unidades, ativos ou setores anteriores");
    const a = await unidade.criar({ nome: "Unidade A RV" });
    const b = await unidade.criar({ nome: "Unidade B RV" });
    const nonce = crypto.randomBytes(8).toString("hex");
    const usuario = (await pool.query(
        "INSERT INTO public.usuarios(login,nome,senha_hash,perfil) VALUES($1,$2,$3,'admin') RETURNING id,perfil",
        ["admin_rv_" + nonce, "Admin RV", "fixture-" + nonce])).rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    await criarSessao(pool, token, usuario, a.id);
    const segundo = (await pool.query(
        "INSERT INTO public.usuarios(login,nome,senha_hash,perfil) VALUES($1,$2,$3,'admin') RETURNING id,perfil",
        ["admin_rv_2_" + nonce, "Segundo admin RV", "fixture-" + nonce])).rows[0];
    const segundoToken = crypto.randomBytes(32).toString("hex");
    await criarSessao(pool, segundoToken, segundo, a.id);
    const dados = await contexto.executar("public", async () => {
        const setorA = (await pool.query("INSERT INTO setores(nome) VALUES('Setor A RV') RETURNING id")).rows[0];
        const setorB = (await pool.query("INSERT INTO setores(nome) VALUES('Setor B RV') RETURNING id")).rows[0];
        const setorC = (await pool.query("INSERT INTO setores(nome) VALUES('Setor C RV') RETURNING id")).rows[0];
        const categoria = (await pool.query(
            "INSERT INTO categorias(nome,setor_id) VALUES('Categoria RV',$1) RETURNING id", [setorA.id])).rows[0];
        const almoxarifado = (await pool.query(
            "INSERT INTO categorias(nome,setor_id) VALUES('Almoxarifado',$1) RETURNING id", [setorA.id])).rows[0];
        const tipos = {};
        for (const [chave, nome, vinculo] of [
            ["desktop", "Desktop RV", true], ["chave", "Chaves", false],
            ["ferramenta", "Ferramentas", false]
        ]) {
            tipos[chave] = (await pool.query(
                "INSERT INTO tipos_ativo(nome,categoria_id,permite_emprestimo,permite_vinculo) VALUES($1,$2,TRUE,$3) RETURNING id",
                [nome, chave === "ferramenta" ? almoxarifado.id : categoria.id, vinculo])).rows[0].id;
        }
        const ativos = {};
        for (const [chave, patrimonio, tipo, status] of [
            ["excluir", "RV-EXCLUIR", "desktop", "em_uso"],
            ["transferir", "RV-TRANSFERIR", "desktop", "em_uso"],
            ["grupo1", "RV-GRUPO-1", "desktop", "em_uso"],
            ["grupo2", "RV-GRUPO-2", "desktop", "em_uso"],
            ["grupo3", "RV-GRUPO-3", "desktop", "em_uso"],
            ["emprestimo", "RV-EMPRESTIMO", "desktop", "em_uso"],
            ["chave", "RV-CHAVE", "chave", "disponivel"],
            ["ferramenta", "RV-FERRAMENTA", "ferramenta", "disponivel"]
        ]) {
            ativos[chave] = (await pool.query(
                "INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio,status) VALUES($1,$2,$3,$4) RETURNING id",
                [tipos[tipo], setorA.id, patrimonio, status])).rows[0].id;
        }
        return { setores: { a: setorA.id, b: setorB.id, c: setorC.id }, tipos, ativos };
    });
    const tokensSetor = {};
    for (const [chave, setorId] of [["a", dados.setores.a], ["b", dados.setores.b]]) {
        const conta = (await pool.query(
            "INSERT INTO public.usuarios(login,nome,senha_hash,perfil,setor_id) VALUES($1,$2,$3,'setor',$4) RETURNING id,perfil,setor_id",
            [`setor_${chave}_${nonce}`, `Setor ${chave} RV`, `fixture-${nonce}`, setorId])).rows[0];
        tokensSetor[chave] = crypto.randomBytes(32).toString("hex");
        await criarSessao(pool, tokensSetor[chave], conta, a.id);
    }
    const tokenUnidadeB = crypto.randomBytes(32).toString("hex");
    await criarSessao(pool, tokenUnidadeB, usuario, b.id);
    const output = path.resolve(__dirname, "../output/rv");
    await fs.mkdir(output, { recursive: true });
    const fixture = { token, segundoToken, tokenUnidadeB, tokensSetor, unidadeA: a.id, unidadeB: b.id, ...dados };
    await fs.writeFile(path.join(output, "fixture.json"), JSON.stringify(fixture), { mode: 0o600 });
    const servidor = await new Promise(resolve => {
        const s = app.listen(55450, "127.0.0.1", () => resolve(s));
    });
    console.log("RV_UI_PRONTA http://127.0.0.1:55450");
    await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
    await new Promise(resolve => servidor.close(resolve));
    await pool.end();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
