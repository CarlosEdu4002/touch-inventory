const assert = require("node:assert/strict");
const pool = require("../database/connection");
const initDatabase = require("../database/init");
const contexto = require("../database/contexto-unidade");
const { app } = require("../server");

if (process.env.MU05_DB_DESCARTAVEL !== "1" || process.env.DB_NAME !== "mu05_test" ||
    process.env.INVENTARIO_TEST_SCHEMA || !process.env.MU05_TEST_PASSWORD || process.env.MU05_TEST_PASSWORD.length < 8) {
    throw new Error("MU-05 exige banco exclusivo mu05_test, sem bypass de multiunidades");
}

async function principal() {
    await initDatabase();
    const servidor = await new Promise(resolve => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${servidor.address().port}`;
    async function chamar(path, { cookie, contexto: chave, method = "GET", body } = {}) {
        const resposta = await fetch(base + path, {
            method,
            headers: {
                ...(cookie ? { Cookie: cookie } : {}),
                ...(chave ? { "X-Inventario-Contexto": chave } : {}),
                ...(body ? { "Content-Type": "application/json" } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: resposta.status, dados: await resposta.json().catch(() => ({})),
            cookie: resposta.headers.get("set-cookie")?.split(";")[0] };
    }
    async function chave(cookie) {
        const r = await chamar("/api/auth/me", { cookie });
        assert.equal(r.status, 200);
        const u = r.dados.usuario;
        return { usuario: u, valor: [u.unidade_id, u.setor_id || 0, u.contexto_versao].join(":") };
    }
    async function ativo(schema, patrimonio) {
        return contexto.executar(schema, async () => {
            const setor = (await pool.query("INSERT INTO setores(nome) VALUES('Setor MU05') RETURNING id")).rows[0];
            const categoria = (await pool.query("INSERT INTO categorias(nome,setor_id) VALUES('Categoria MU05',$1) RETURNING id", [setor.id])).rows[0];
            const tipo = (await pool.query("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Desktop MU05',$1) RETURNING id", [categoria.id])).rows[0];
            const equipamento = (await pool.query("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,$3) RETURNING id", [tipo.id, setor.id, patrimonio])).rows[0];
            return { ...equipamento, setor: setor.id, tipo: tipo.id };
        });
    }
    try {
        assert.equal((await chamar("/api/auth/configurar", { method: "POST", body: { nome: "Admin MU05", login: "admin_mu05", senha: process.env.MU05_TEST_PASSWORD } })).status, 201);
        const login = await chamar("/api/auth/login", { method: "POST", body: { login: "admin_mu05", senha: process.env.MU05_TEST_PASSWORD } });
        assert.equal(login.status, 200);
        const admin = login.cookie;
        const a = await chamar("/api/unidades", { cookie: admin, method: "POST", body: { nome: "Unidade A" } });
        const b = await chamar("/api/unidades", { cookie: admin, method: "POST", body: { nome: "Unidade B" } });
        assert.equal(a.status, 201); assert.equal(b.status, 201);
        const cadastroA = await ativo("public", "PTN-001");
        const cadastroB = await ativo(`unidade_${b.dados.id}`, "PTN-001");
        assert.notEqual(cadastroA.id, cadastroB.id);
        const urlA = `/ativo.html?unidade=${a.dados.id}&ativo=${cadastroA.id}`;
        const urlB = `/ativo.html?unidade=${b.dados.id}&ativo=${cadastroB.id}`;
        assert.notEqual(urlA, urlB);
        assert.equal((await chamar(`/api/ativos/${cadastroA.id}/detalhes?unidade=${a.dados.id}`, { cookie: admin })).status, 409);
        assert.equal((await chamar(`/api/unidades/${a.dados.id}/selecionar`, { cookie: admin, method: "POST", body: {} })).status, 200);
        let atual = await chave(admin);
        assert.equal((await chamar(`/api/ativos/${cadastroA.id}/detalhes?unidade=${a.dados.id}`, { cookie: admin, contexto: atual.valor })).dados.ativo.id, cadastroA.id);
        assert.equal((await chamar(`/api/ativos/${cadastroB.id}/detalhes?unidade=${b.dados.id}`, { cookie: admin, contexto: atual.valor })).status, 404);
        assert.equal((await chamar(`/api/ativos/${cadastroB.id}/detalhes?unidade=${a.dados.id}`, { cookie: admin, contexto: atual.valor })).status, 404);
        assert.equal((await chamar(`/api/ativos/${cadastroA.id}/detalhes`, { cookie: admin, contexto: atual.valor })).status, 400);
        assert.equal((await chamar("/api/publico/ativos/Desktop%20MU05/PTN-001", { cookie: admin, contexto: atual.valor })).status, 404);
        assert.equal((await chamar(`/api/nfc/tags/AABBCCDD`, { cookie: admin, contexto: atual.valor, method: "POST", body: { ativo_id: cadastroA.id } })).dados.unidade_id, a.dados.id);
        assert.equal((await chamar(`/api/nfc/tags/AABBCCDD`, { cookie: admin, contexto: atual.valor })).dados.ativo_id, cadastroA.id);
        assert.equal((await chamar(`/api/nfc/tags/11223344`, { cookie: admin, contexto: atual.valor, method: "POST", body: { tipo: "Desktop MU05", patrimonio: "PTN-001" } })).status, 400);
        assert.equal((await chamar(`/api/unidades/${b.dados.id}/selecionar`, { cookie: admin, method: "POST", body: {} })).status, 200);
        atual = await chave(admin);
        assert.equal((await chamar(`/api/ativos/${cadastroB.id}/detalhes?unidade=${b.dados.id}`, { cookie: admin, contexto: atual.valor })).dados.ativo.id, cadastroB.id);
        assert.equal((await chamar(`/api/ativos/${cadastroA.id}/detalhes?unidade=${a.dados.id}`, { cookie: admin, contexto: atual.valor })).status, 404);
        assert.equal((await chamar(`/api/nfc/tags/11223344`, { cookie: admin, contexto: atual.valor, method: "POST", body: { ativo_id: cadastroA.id } })).status, 404);
        assert.equal((await chamar(`/api/nfc/tags/AABBCCDD`, { cookie: admin, contexto: atual.valor })).status, 404);
        const senhaHash = await require("../utils/senha").criarHashSenha(process.env.MU05_TEST_PASSWORD);
        const usuario = (await pool.query("INSERT INTO public.usuarios(login,nome,senha_hash,perfil) VALUES('usuario_mu05','Usuário MU05',$1,'setor') RETURNING id", [senhaHash])).rows[0];
        await pool.query("INSERT INTO public.usuario_unidades(usuario_id,unidade_id,setor_id) VALUES($1,$2,$3)", [usuario.id, a.dados.id, cadastroA.setor]);
        const loginSetor = await chamar("/api/auth/login", { method: "POST", body: { login: "usuario_mu05", senha: process.env.MU05_TEST_PASSWORD } });
        assert.equal(loginSetor.status, 200);
        const restrito = loginSetor.cookie;
        assert.deepEqual((await chamar("/api/unidades", { cookie: restrito })).dados.map(x => x.id), [a.dados.id]);
        assert.equal((await chamar(`/api/unidades/${b.dados.id}/selecionar`, { cookie: restrito, method: "POST", body: {} })).status, 403);
        assert.equal((await chamar(`/api/unidades/${a.dados.id}/selecionar`, { cookie: restrito, method: "POST", body: {} })).status, 200);
        const contextoSetor = (await chave(restrito)).valor;
        assert.equal((await chamar(`/api/ativos/${cadastroB.id}/detalhes?unidade=${b.dados.id}`, { cookie: restrito, contexto: contextoSetor })).status, 404);
        await contexto.executar("public", () => pool.query("UPDATE ativos SET excluido_em=NOW() WHERE id=$1", [cadastroA.id]));
        assert.equal((await chamar(`/api/ativos/${cadastroA.id}/detalhes?unidade=${a.dados.id}`, { cookie: admin, contexto: (await chave(admin)).valor })).status, 404);
        // A limpeza definitiva libera o patrimônio; o ID antigo continua sem resolução.
        await contexto.executar("public", () => pool.query("DELETE FROM ativos WHERE id=$1", [cadastroA.id]));
        const substituto = await contexto.executar("public", async () => (await pool.query("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,'PTN-001') RETURNING id", [cadastroA.tipo, cadastroA.setor])).rows[0]);
        assert.equal((await chamar(`/api/ativos/${cadastroA.id}/detalhes?unidade=${a.dados.id}`, { cookie: admin, contexto: (await chave(admin)).valor })).status, 404);
        assert.equal((await chamar(`/api/ativos/${substituto.id}/detalhes?unidade=${a.dados.id}`, { cookie: restrito, contexto: contextoSetor })).dados.ativo.id, substituto.id);
        console.log(JSON.stringify({ passou: true, urlA, urlB, idSubstituto: substituto.id,
            cenario: "mesmo patrimônio em A/B, contexto, acesso, NFC, excluído e reutilização" }));
    } finally {
        await new Promise(resolve => servidor.close(resolve));
        await pool.end();
    }
}
principal().catch(error => { console.error(error); process.exitCode = 1; });
