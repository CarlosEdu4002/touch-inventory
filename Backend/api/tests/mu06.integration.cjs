const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const contexto = require("../database/contexto-unidade");
const initDatabase = require("../database/init");
const unidades = require("../services/unidades.service");
const fixture = require("./unidade.fixture.cjs");

module.exports = async function validarNoveUnidades(pool, base) {
    const existentes = (await pool.query("SELECT id,schema_nome FROM public.unidades ORDER BY id")).rows;
    assert.equal(existentes.length, 1);
    const plantas = [...existentes];
    for (let n = 2; n <= 9; n++) {
        const unidade = await unidades.criar({ nome: "Unidade MU06 " + n });
        plantas.push({ id: unidade.id, schema_nome: "unidade_" + unidade.id });
    }
    const nonce = crypto.randomBytes(8).toString("hex");
    const admin = (await pool.query(
        "INSERT INTO public.usuarios(login,nome,senha_hash,perfil) VALUES($1,'Admin MU06',$2,'admin') RETURNING id,perfil",
        ["admin_mu06_" + nonce, "fixture-" + nonce])).rows[0];
    const registros = await Promise.all(plantas.map(async planta => {
        const ativo = await contexto.executar(planta.schema_nome, async () => {
            const setor = (await pool.query("INSERT INTO setores(nome) VALUES('Setor MU06') RETURNING id")).rows[0];
            const categoria = (await pool.query("INSERT INTO categorias(nome,setor_id) VALUES('Categoria MU06',$1) RETURNING id", [setor.id])).rows[0];
            const tipo = (await pool.query("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Tipo MU06',$1) RETURNING id", [categoria.id])).rows[0];
            const r = (await pool.query("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,'MU06-COMUM') RETURNING id", [tipo.id, setor.id])).rows[0];
            await pool.query("INSERT INTO historico_ativos(ativo_id,patrimonio,tipo_ativo_id,usuario_nome,acao) VALUES($1,'MU06-COMUM',$2,'Admin MU06','criacao')", [r.id, tipo.id]);
            return { id: r.id, tipoId: tipo.id, setorId: setor.id };
        });
        const cookie = await fixture.criarSessao(pool, crypto.randomBytes(32).toString("hex"), admin, planta.id);
        return { unidadeId: planta.id, schema: planta.schema_nome, ativoId: ativo.id, tipoId: ativo.tipoId, setorId: ativo.setorId, cookie };
    }));
    assert.equal(new Set(registros.map(x => x.ativoId)).size, 9);

    async function chamar(r, url, method = "GET", body, chave) {
        const pedido = await fixture.prepararPedido(pool, url, r.cookie,
            chave ? { "X-Inventario-Contexto": chave } : {});
        const resposta = await fetch(base + pedido.url, {
            method, headers: { ...pedido.headers, ...(body ? { "Content-Type": "application/json" } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
    }
    const escritas = await Promise.all(registros.map(r => chamar(r, "/api/" + r.tipoId,
        "POST", { patrimonio: "MU06-HTTP", setor_id: r.setorId, tipo_revisao: 1 })));
    assert.ok(escritas.every(x => x.status === 201), "cadastro HTTP em cada unidade");
    const gravados = await Promise.all(registros.map(r => contexto.executar(r.schema,
        () => pool.query("SELECT count(*)::int AS total FROM ativos WHERE patrimonio='MU06-HTTP'"))));
    assert.ok(gravados.every(x => x.rows[0].total === 1), "escritas restritas a cada unidade");
    const leituras = await Promise.all(registros.flatMap(r => Array.from({ length: 8 },
        () => chamar(r, "/api/ativos/" + r.ativoId + "/detalhes?unidade=" + r.unidadeId))));
    assert.equal(leituras.length, 72);
    for (let i = 0; i < leituras.length; i++) {
        assert.equal(leituras[i].status, 200);
        assert.equal(leituras[i].dados.ativo.id, registros[Math.floor(i / 8)].ativoId);
    }
    const cruzadas = await Promise.all(registros.map((origem, i) => {
        const alvo = registros[(i + 1) % registros.length];
        return chamar(origem, "/api/ativos/" + alvo.ativoId + "/detalhes?unidade=" + origem.unidadeId);
    }));
    assert.equal(cruzadas.length, 9);
    assert.ok(cruzadas.every(r => r.status === 404));

    const assinaturas = async () => (await pool.query(
        "SELECT escopo,schema_nome,versao,checksum FROM public.migracoes_aplicadas ORDER BY escopo,schema_nome,versao")).rows;
    const antes = await assinaturas();
    await initDatabase();
    assert.deepEqual(await assinaturas(), antes);
    assert.equal(new Set(antes.filter(x => x.escopo === "unidade").map(x => x.schema_nome)).size, 9);

    const a = registros[0], b = registros[1], chaveAntiga = await fixture.contextoDaSessao(pool, a.cookie);
    assert.equal((await chamar(a, "/api/unidades/" + b.unidadeId + "/selecionar", "POST", {})).status, 200);
    assert.equal((await chamar(a, "/api/ativos/" + b.ativoId + "/detalhes?unidade=" + b.unidadeId,
        "GET", null, chaveAntiga)).status, 409);
    assert.equal((await chamar(a, "/api/unidades/" + a.unidadeId + "/selecionar", "POST", {})).status, 200);
    assert.equal((await chamar(a, "/api/ativos/" + a.ativoId + "/detalhes?unidade=" + a.unidadeId,
        "GET", null, chaveAntiga)).status, 409);

    const alvo = registros[4];
    await contexto.executar(alvo.schema, () => pool.query("DELETE FROM ativos WHERE id=$1", [alvo.ativoId]));
    assert.equal((await chamar(alvo, "/api/ativos/" + alvo.ativoId + "/detalhes?unidade=" + alvo.unidadeId)).status, 404);
    const historicos = await Promise.all(registros.map(r => contexto.executar(r.schema,
        () => pool.query("SELECT count(*)::int AS total FROM historico_ativos WHERE patrimonio='MU06-COMUM'"))));
    assert.ok(historicos.every(x => x.rows[0].total === 1));
    const historicosHttp = await Promise.all(registros.map(r => contexto.executar(r.schema,
        () => pool.query("SELECT count(*)::int AS total FROM historico_ativos WHERE patrimonio='MU06-HTTP'"))));
    assert.ok(historicosHttp.every(x => x.rows[0].total === 1));
    const restantes = await Promise.all(registros.slice(1).filter(x => x !== alvo).map(r =>
        chamar(r, "/api/ativos/" + r.ativoId + "/detalhes?unidade=" + r.unidadeId)));
    assert.ok(restantes.every(x => x.status === 200));
    console.log("PASSOU MU-06: nove unidades, concorrencia, historicos, limpeza, contexto, IDs globais e migracoes.");
};
