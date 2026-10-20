const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const ativos = require("./formularios.fixture.cjs").servico("ativos");
const mapas = require("./formularios.fixture.cjs").servico("mapas");
const hist = require("../models/historico.model");
const imagens = require("../services/imagens.service");
const vinculos = require("../models/vinculos.model");
const dir = path.resolve(__dirname, "../../../uploads/ativos");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkXkAAAAASUVORK5CYII=";

module.exports = async function executar(pool) {
    async function row(sql, params = []) { return (await pool.query(sql, params)).rows[0]; }
    async function falhar(alvo) { await pool.query("INSERT INTO falhas_teste(alvo) VALUES($1)", [alvo]); }
    async function liberar() { await pool.query("DELETE FROM falhas_teste"); }
    async function ativo(patrimonio) { return row("SELECT * FROM ativos WHERE patrimonio=$1 AND excluido_em IS NULL", [patrimonio]); }
    async function eventos(patrimonio) { return (await pool.query("SELECT * FROM historico_ativos WHERE patrimonio=$1 ORDER BY id", [patrimonio])).rows; }
    async function existe(nome) { await fs.access(path.join(dir, nome)); }
    async function inexistente(nome) { await assert.rejects(fs.access(path.join(dir, nome)), { code: "ENOENT" }); }
    const sa = await row("INSERT INTO setores(nome) VALUES('CONS-A') RETURNING id");
    const sb = await row("INSERT INTO setores(nome) VALUES('CONS-B') RETURNING id");
    const categoria = await row("INSERT INTO categorias(nome,setor_id) VALUES('CONS-CATEGORIA',$1) RETURNING id", [sa.id]);
    const tipo = await row("INSERT INTO tipos_ativo(nome,categoria_id,permite_vinculo) VALUES('CONS-TIPO',$1,TRUE) RETURNING id", [categoria.id]);
    await pool.query("INSERT INTO campos(tipo_ativo_id,nome,label,tipo) VALUES($1,'v','Valor de teste','numero')", [tipo.id]);
    const u = await row("INSERT INTO usuarios(login,nome,senha_hash,perfil) VALUES('cons_admin','CONS Admin','sem-login','admin') RETURNING id,nome,perfil,setor_id");
    const t = String(tipo.id);
    const body = (patrimonio, v = 0, extra = {}) => ({ patrimonio, setor_id: sa.id, v, ...extra });
    await pool.query(`
        CREATE TABLE falhas_teste(alvo TEXT PRIMARY KEY);
        CREATE FUNCTION falha_hist_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF EXISTS(SELECT 1 FROM falhas_teste WHERE alvo='historico' OR (alvo='segundo_membro' AND NEW.patrimonio='CONS-G2'))
            THEN RAISE EXCEPTION 'falha de histórico induzida'; END IF; RETURN NEW;
        END $$;
        CREATE TRIGGER falha_hist BEFORE INSERT ON historico_ativos FOR EACH ROW EXECUTE FUNCTION falha_hist_teste();
        CREATE FUNCTION falha_alteracao_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF EXISTS(SELECT 1 FROM falhas_teste WHERE alvo=TG_ARGV[0])
            THEN RAISE EXCEPTION 'falha de alteração induzida'; END IF; RETURN NEW;
        END $$;
        CREATE TRIGGER falha_ativo BEFORE INSERT OR UPDATE ON ativos FOR EACH ROW EXECUTE FUNCTION falha_alteracao_teste('alteracao');
        CREATE TRIGGER falha_posicao BEFORE INSERT OR UPDATE ON posicoes_ativos FOR EACH ROW EXECUTE FUNCTION falha_alteracao_teste('posicao');
        CREATE CONSTRAINT TRIGGER falha_commit_ativo AFTER INSERT OR UPDATE ON ativos DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION falha_alteracao_teste('commit');
        CREATE CONSTRAINT TRIGGER falha_commit_posicao AFTER INSERT OR UPDATE ON posicoes_ativos DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION falha_alteracao_teste('commit');
    `);
    await assert.rejects(hist.registrar({}), /exige a conexão/);
    await falhar("historico");
    await assert.rejects(ativos.criarAtivo(t, body("CONS-CREATE", 0, { imagem: png }), u), /histórico induzida/);
    assert.equal(await ativo("CONS-CREATE"), undefined); assert.equal((await eventos("CONS-CREATE")).length, 0);
    assert.equal((await row("SELECT COUNT(*)::int n FROM limpezas_imagens")).n, 0);
    await liberar(); await ativos.criarAtivo(t, body("CONS-CREATE", 0, { imagem: png }), u);
    assert.equal((await eventos("CONS-CREATE")).length, 1);
    const original = await ativo("CONS-CREATE"); await existe(original.imagem);
    for (const erro of ["historico", "alteracao", "commit"]) {
        await falhar(erro);
        const antesArquivos = (await fs.readdir(dir)).sort();
        await assert.rejects(ativos.atualizarAtivo(t, "CONS-CREATE", body("CONS-CREATE", 1, { imagem: png }), u), /induzida/);
        assert.deepEqual((await fs.readdir(dir)).sort(), antesArquivos);
        assert.deepEqual((await ativo("CONS-CREATE")).dados, original.dados);
        assert.equal((await ativo("CONS-CREATE")).imagem, original.imagem);
        assert.equal((await eventos("CONS-CREATE")).length, 1);
        await existe(original.imagem); await liberar();
    }
    await assert.rejects(ativos.atualizarAtivo(t, "CONS-CREATE", body("CONS-CREATE", 1, { imagem: "data:image/png;base64,YWJj" }), u), { status: 400 });
    console.log("PASSOU: criação/edição e imagem fazem rollback em falha de histórico, alteração e COMMIT; retentativa não duplica.");

    // Uma conexão mantém o primeiro histórico aberto; a segunda deve esperar pelo ativo.
    async function concorrencia(patrimonio, acao, primeiro, segundo) {
        const registrar = hist.registrar; const pids = new Set();
        let avisar, soltar;
        const chegou = new Promise(resolve => { avisar = resolve; });
        const barreira = new Promise(resolve => { soltar = resolve; });
        let interceptado = false;
        hist.registrar = async (evento, cliente) => {
            assert.notEqual(cliente, pool); assert.ok(cliente?.processID);
            if (evento.patrimonio === patrimonio && evento.acao === acao) {
                pids.add(cliente.processID);
                await registrar(evento, cliente);
                if (!interceptado) { interceptado = true; avisar(); await barreira; }
            } else await registrar(evento, cliente);
        };
        const a = primeiro(); let b;
        try {
            await chegou; b = segundo();
            let bloqueou = false;
            for (let i = 0; i < 250; i++) {
                const espera = await row("SELECT COUNT(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND (query LIKE '%FOR UPDATE OF a%' OR query LIKE '%pg_advisory_xact_lock%')");
                if (espera.n) { bloqueou = true; break; }
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(bloqueou, true, "A segunda conexão deve aguardar o primeiro COMMIT");
        } finally {
            soltar(); await Promise.allSettled([a, b]); hist.registrar = registrar;
        }
        await a; await assert.rejects(b,{status:409}); assert.equal(pids.size,1);
    }
    await concorrencia("CONS-CREATE", "edicao",
        () => ativos.atualizarAtivo(t, "CONS-CREATE", body("CONS-CREATE", 1), u),
        () => ativos.atualizarAtivo(t, "CONS-CREATE", body("CONS-CREATE", 2), u));
    const edicoes = (await eventos("CONS-CREATE")).filter(e => e.acao === "edicao");
    assert.deepEqual(edicoes.map(e => [e.dados_anteriores.v, e.dados_novos.v]), [[0, 1]]);
    console.log("PASSOU: edições concorrentes preservam o estado anterior real, com conexões independentes.");

    const remover = imagens.removerArquivo;
    imagens.removerArquivo = async nome => { if (nome === original.imagem) { const e = new Error("falha de disco induzida"); e.code = "EACCES"; throw e; } return remover(nome); };
    try { await ativos.atualizarAtivo(t, "CONS-CREATE", body("CONS-CREATE", 3, { imagem: png }), u); }
    finally { imagens.removerArquivo = remover; }
    const novo = await ativo("CONS-CREATE"); assert.notEqual(novo.imagem, original.imagem);
    await existe(novo.imagem); await existe(original.imagem);
    const pendente = await row("SELECT * FROM limpezas_imagens WHERE arquivo=$1", [original.imagem]);
    assert.equal(pendente.tentativas, 1); assert.equal(pendente.ultimo_erro, "EACCES");
    assert.equal((await imagens.processar([original.imagem])).removidas, 0, "Respeita o prazo da retentativa");
    await pool.query("UPDATE limpezas_imagens SET proxima_tentativa=NOW() WHERE arquivo=$1", [original.imagem]);
    await imagens.processar([original.imagem]); await inexistente(original.imagem); await existe(novo.imagem);
    await imagens.agendar(novo.imagem, pool);
    assert.equal((await imagens.processar([novo.imagem])).referenciadas, 1); await existe(novo.imagem);
    await assert.rejects(imagens.agendar("../fora.png", pool), /Nome interno/);
    const semReferencia = await imagens.preparar(png);
    await pool.query("UPDATE limpezas_imagens SET proxima_tentativa=NOW() WHERE arquivo=$1", [semReferencia]);
    // Outro processo recupera o registro persistido sem depender de estado em memória.
    await new Promise((resolve, reject) => {
        const filho = spawn(process.execPath, [path.resolve(__dirname, "../scripts/limpar-imagens.js")], { env: process.env, stdio: "inherit" });
        filho.on("error", reject); filho.on("exit", code => code === 0 ? resolve() : reject(new Error("Falha na recuperação por outro processo")));
    });
    await inexistente(semReferencia); await existe(novo.imagem);
    console.log("PASSOU: limpeza falha sem invalidar edição, retenta com registro durável e preserva arquivos referenciados.");

    await falhar("historico");
    await assert.rejects(ativos.removerAtivo(t, "CONS-CREATE", u), /histórico induzida/);
    await existe(novo.imagem); assert.ok(await ativo("CONS-CREATE")); await liberar();
    // Exclusão agora é um UPDATE recuperável, coberto pelo trigger de COMMIT.
    await falhar("commit");
    await assert.rejects(ativos.removerAtivo(t, "CONS-CREATE", u), /induzida/);
    await existe(novo.imagem); assert.ok(await ativo("CONS-CREATE")); await liberar();
    await ativos.removerAtivo(t, "CONS-CREATE", u);
    assert.equal(await ativo("CONS-CREATE"), undefined); await existe(novo.imagem);
    assert.equal((await eventos("CONS-CREATE")).filter(e => e.acao === "exclusao").length, 1);
    await assert.rejects(ativos.removerAtivo(t, "CONS-CREATE", u), { status: 404 });
    assert.equal((await eventos("CONS-CREATE")).filter(e => e.acao === "exclusao").length, 1);
    await imagens.processar([novo.imagem]); await existe(novo.imagem);
    await pool.query("UPDATE ativos SET excluido_em=NOW()-INTERVAL '31 days',recuperavel_ate=NOW()-INTERVAL '1 day' WHERE id=$1",[novo.id]);
    await require("../services/lixeira.service").limparExpirados(); await inexistente(novo.imagem);
    console.log("PASSOU: exclusão recuperável faz rollback e preserva imagem; limpeza ocorre somente após o prazo.");

    await ativos.criarAtivo(t, body("CONS-IMAGE-RACE", 0, { imagem: png }), u);
    const imagemInicial = (await ativo("CONS-IMAGE-RACE")).imagem;
    await concorrencia("CONS-IMAGE-RACE", "edicao",
        () => ativos.atualizarAtivo(t, "CONS-IMAGE-RACE", body("CONS-IMAGE-RACE", 1, { imagem: png }), u),
        () => ativos.atualizarAtivo(t, "CONS-IMAGE-RACE", body("CONS-IMAGE-RACE", 2, { imagem: png }), u));
    const trocas = (await eventos("CONS-IMAGE-RACE")).filter(e => e.acao === "edicao");
    assert.equal(trocas.length,1);
    const compartilhada = (await ativo("CONS-IMAGE-RACE")).imagem;
    await existe(compartilhada); await inexistente(imagemInicial); await existe(trocas[0].dados_novos.imagem);
    // O esquema permite referências compartilhadas: a última referência decide a limpeza.
    await ativos.criarAtivo(t, body("CONS-SHARED"), u);
    await pool.query("UPDATE ativos SET imagem=$1 WHERE patrimonio='CONS-SHARED'", [compartilhada]);
    await ativos.removerAtivo(t, "CONS-IMAGE-RACE", u); await existe(compartilhada);
    await ativos.removerAtivo(t, "CONS-SHARED", u); await existe(compartilhada);
    await pool.query("UPDATE ativos SET excluido_em=NOW()-INTERVAL '31 days',recuperavel_ate=NOW()-INTERVAL '1 day' WHERE patrimonio=ANY($1::text[])",[["CONS-IMAGE-RACE","CONS-SHARED"]]);
    await require("../services/lixeira.service").limparExpirados(); await inexistente(compartilhada);
    console.log("PASSOU: trocas concorrentes e lixeira preservam referências até a última exclusão definitiva vencida.");

    const planta = await mapas.criar({ nome: "CONS-PLANTA", imagem: png, largura: 1, altura: 1 }, u);
    const poligono = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const ambienteA = await mapas.salvarAmbiente(null, { nome: "CONS-AMBIENTE-A", planta_id: planta.id, setor_id: sa.id, poligono, padrao: true });
    const ambienteB = await mapas.salvarAmbiente(null, { nome: "CONS-AMBIENTE-B", planta_id: planta.id, setor_id: sb.id, poligono, padrao: true });
    await ativos.criarAtivo(t, body("CONS-MAP"), u);
    const m = await ativo("CONS-MAP");
    async function posicao(id) { return row("SELECT ambiente_id,x::float x,y::float y FROM posicoes_ativos WHERE ativo_id=$1", [id]); }
    const posicaoOriginal = await posicao(m.id);
    await falhar("historico");
    await assert.rejects(ativos.transferirAtivo(t, "CONS-MAP", { setor_id: sb.id }, u), /induzida/);
    assert.equal((await ativo("CONS-MAP")).setor_id, sa.id); assert.deepEqual(await posicao(m.id), posicaoOriginal);
    assert.equal((await eventos("CONS-MAP")).length, 1); await liberar();
    await ativos.transferirAtivo(t, "CONS-MAP", { setor_id: sb.id }, u);
    assert.equal((await posicao(m.id)).ambiente_id, ambienteB.id);
    await ativos.transferirAtivo(t, "CONS-MAP", { setor_id: sa.id }, u);
    const quantidade = (await eventos("CONS-MAP")).length;
    for (const erro of ["historico", "posicao", "commit"]) {
        await falhar(erro);
        await assert.rejects(mapas.moverAtivo(m.id, { ambiente_id: ambienteA.id, x: 0.2, y: 0.3 }, u), /induzida/);
        assert.deepEqual(await posicao(m.id), posicaoOriginal);
        assert.equal((await eventos("CONS-MAP")).length, quantidade); await liberar();
    }
    await concorrencia("CONS-MAP", "posicionamento_mapa",
        () => mapas.moverAtivo(m.id, { ambiente_id: ambienteA.id, x: 0.2, y: 0.3 }, u),
        () => mapas.moverAtivo(m.id, { ambiente_id: ambienteA.id, x: 0.4, y: 0.6 }, u));
    const movimentos = (await eventos("CONS-MAP")).filter(e => e.acao === "posicionamento_mapa");
    assert.deepEqual(movimentos.map(e => [e.dados_anteriores.x, e.dados_novos.x]), [[0.5, 0.2]]);
    console.log("PASSOU: transferência individual e mapa são atômicos, inclusive snapshots de posições concorrentes.");

    await ativos.criarAtivo(t, body("CONS-G1"), u); await ativos.criarAtivo(t, body("CONS-G2"), u);
    const g1 = await ativo("CONS-G1"), g2 = await ativo("CONS-G2");
    await vinculos.salvar(null, "CONS-GRUPO", [g1.id, g2.id], u, sa.id,undefined,{[g1.id]:g1.revisao,[g2.id]:g2.revisao});
    await falhar("segundo_membro");
    await assert.rejects(ativos.transferirAtivo(t, "CONS-G1", { setor_id: sb.id }, u), /induzida/);
    assert.equal((await ativo("CONS-G1")).setor_id, sa.id); assert.equal((await ativo("CONS-G2")).setor_id, sa.id);
    assert.equal((await eventos("CONS-G1")).length, 2); assert.equal((await eventos("CONS-G2")).length, 2);
    await liberar(); await ativos.transferirAtivo(t, "CONS-G1", { setor_id: sb.id }, u);
    assert.equal((await eventos("CONS-G1")).length, 3); assert.equal((await eventos("CONS-G2")).length, 3);
    await falhar("segundo_membro");
    await assert.rejects(mapas.moverAtivo(g1.id, { ambiente_id: ambienteB.id, x: 0.1, y: 0.1 }, u), /induzida/);
    assert.equal((await posicao(g1.id)).x, 0.5); assert.equal((await posicao(g2.id)).x, 0.5);
    await liberar(); await mapas.moverAtivo(g1.id, { ambiente_id: ambienteB.id, x: 0.1, y: 0.1 }, u);
    for (const p of ["CONS-G1", "CONS-G2"]) {
        const es = await eventos(p); assert.equal(es.length, 4); assert.equal(es[3].dados_anteriores.x, 0.5);
    }
    await mapas.remover(planta.id);
    // Retira somente os triggers de falhas deste esquema de teste antes das regressões antigas.
    await pool.query(`DROP TRIGGER falha_hist ON historico_ativos; DROP TRIGGER falha_ativo ON ativos;
        DROP TRIGGER falha_posicao ON posicoes_ativos; DROP TRIGGER falha_commit_ativo ON ativos;
        DROP TRIGGER falha_commit_posicao ON posicoes_ativos;`);
    console.log("PASSOU: operações de grupo preservam transações e geram um evento por membro, sem sucesso parcial.");
};
