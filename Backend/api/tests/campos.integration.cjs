const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const unidadeFixture = require("./unidade.fixture.cjs");

module.exports = async function executar(pool, base) {
    const row = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
    const setor = await row("INSERT INTO setores(nome) VALUES('Campos teste') RETURNING id");
    const outroSetor = await row("INSERT INTO setores(nome) VALUES('Campos destino') RETURNING id");
    const categoria = await row("INSERT INTO categorias(nome,setor_id) VALUES('Campos teste',$1) RETURNING id", [setor.id]);
    const tipo = await row("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Campos teste',$1) RETURNING id", [categoria.id]);
    const outro = await row("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Campos outro',$1) RETURNING id", [categoria.id]);
    const usuario = await row("INSERT INTO usuarios(login,nome,senha_hash,perfil) VALUES('campos_admin','Campos admin','sem-login','admin') RETURNING id");
    const token = crypto.randomBytes(32).toString("hex");
    const cookie = await unidadeFixture.criarSessao(pool,token,{...usuario,perfil:"admin"});
    const request = async (url, method, body) => {
        body=await require("./formularios.fixture.cjs").pedido(url,method,body);
        const pedido = await unidadeFixture.prepararPedido(pool,url,cookie,{"Content-Type":"application/json"});
        const r = await fetch(base + pedido.url, { method, headers: pedido.headers, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
    };
    for (const [nome, formato, obrigatorio, editavel, opcoes] of [
        ["texto", "texto", true, true, []], ["numero", "numero", true, true, []],
        ["data", "data", true, true, []], ["booleano", "booleano", true, true, []],
        ["opcao", "selecao", true, true, ["A", "B"]], ["fixo", "texto", true, false, []]
    ]) await pool.query("INSERT INTO campos(tipo_ativo_id,nome,label,tipo,obrigatorio,editavel,opcoes) VALUES($1,$2,$2,$3,$4,$5,$6)", [tipo.id, nome, formato, obrigatorio, editavel, JSON.stringify(opcoes)]);
    await pool.query("INSERT INTO campos(tipo_ativo_id,nome,label,tipo) VALUES($1,'outro','Outro','texto')", [outro.id]);
    const body = { patrimonio: "CAMPO-VALIDO", setor_id: String(setor.id), status: "em_uso", texto: "Teste", numero: "12.5", data: "2024-02-29", booleano: false, opcao: "A", fixo: "Original" };
    const url = `/api/${tipo.id}`;
    for (const alteracao of [{ texto: " " }, { numero: "abc" }, { data: "2026-02-29" }, { booleano: "false" },
        { opcao: "C" }, { outro: "tipo errado" }, { inventado: "x" }, { remover_imagem: "true" }]) {
        assert.equal((await request(url, "POST", { ...body, ...alteracao })).status, 400);
        assert.equal((await row("SELECT COUNT(*)::int n FROM ativos WHERE tipo_ativo_id=$1", [tipo.id])).n, 0);
        assert.equal((await row("SELECT COUNT(*)::int n FROM historico_ativos WHERE tipo_ativo_id=$1", [tipo.id])).n, 0);
    }
    assert.equal((await request(url, "POST", body)).status, 201);
    const antes = await row("SELECT * FROM ativos WHERE patrimonio=$1", [body.patrimonio]);
    for (const alteracao of [{ fixo: "Alterado" }, { fixo: null }, { numero: [] }, { texto: null }, { opcao: "C" }, { inventado: "x" },
        { patrimonio: "CAMPO-TROCADO" }, { setor_id: outroSetor.id }]) {
        assert.equal((await request(`${url}/${body.patrimonio}`, "PUT", { ...body, ...alteracao })).status, 400);
        assert.deepEqual(await row("SELECT * FROM ativos WHERE id=$1", [antes.id]), antes);
        assert.equal((await row("SELECT COUNT(*)::int n FROM historico_ativos WHERE ativo_id=$1", [antes.id])).n, 1);
    }
    await pool.query("UPDATE ativos SET dados=dados || '{\"legado\":\"preservar\"}'::jsonb WHERE id=$1", [antes.id]);
    assert.equal((await request(`${url}/${body.patrimonio}`, "PUT", { patrimonio: body.patrimonio, setor_id: setor.id, texto: "Novo" })).status, 200);
    assert.deepEqual((await row("SELECT dados FROM ativos WHERE id=$1", [antes.id])).dados, { ...antes.dados, texto: "Novo", legado: "preservar" });
    await pool.query("UPDATE campos SET opcoes='[\"B\"]'::jsonb WHERE tipo_ativo_id=$1 AND nome='opcao'", [tipo.id]);
    assert.equal((await request(`${url}/${body.patrimonio}`, "PUT", body)).status, 400);
    assert.equal((await request(`${url}/${body.patrimonio}`, "PUT", { ...body, opcao: "B" })).status, 200);
    await pool.query("UPDATE campos SET tipo='numero' WHERE tipo_ativo_id=$1 AND nome='fixo'", [tipo.id]);
    assert.equal((await request(`${url}/${body.patrimonio}`, "PUT", { ...body, opcao: "B" })).status, 200);
    const definicao = { tipo_ativo_id: tipo.id, nome: "novo", label: "Novo", tipo: "select", opcoes: ["A"] };
    for (const alteracao of [{ nome: "patrimonio" }, { nome: "constructor" }, { tipo: 123 }, { obrigatorio: "true" }, { opcoes: [] }, { opcoes: [{}] }]) {
        assert.equal((await request("/api/campos", "POST", { ...definicao, ...alteracao })).status, 400);
    }
    assert.equal((await request("/api/campos", "POST", definicao)).status, 201);
    console.log("PASSOU: validação pela API, definições, preservação de legado e ausência de gravação/histórico em pedidos inválidos.");
};
