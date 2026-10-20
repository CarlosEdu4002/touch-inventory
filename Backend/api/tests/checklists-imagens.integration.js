"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("../database/connection");
const initDatabase = require("../database/init");
const service = require("../services/checklists.service");
const model = require("../models/checklists.model");
const exportacoes = require("../services/exportacoes.service");
const imagens = require("../services/imagens.service");
const lixeira = require("../services/lixeira.service");
const unidadeFixture = require("./unidade.fixture.cjs");

test("anexo de checklist persiste, respeita escopo e aparece no PDF", async () => {
    await initDatabase();
    await unidadeFixture.prepararPrimeiraUnidade(pool);
    const sufixo = crypto.randomUUID().slice(0, 8);
    const ids = {};
    let arquivo;
    try {
        ids.setor = (await pool.query("INSERT INTO setores(nome) VALUES($1) RETURNING id", [`Teste anexos ${sufixo}`])).rows[0].id;
        ids.categoria = (await pool.query("INSERT INTO categorias(nome,setor_id) VALUES($1,$2) RETURNING id",
            [`Categoria anexos ${sufixo}`, ids.setor])).rows[0].id;
        ids.tipo = (await pool.query(`INSERT INTO tipos_ativo
            (nome,categoria_id,permite_checklist,checklist_recorrencia,checklist_intervalo_meses,checklist_itens)
            VALUES($1,$2,TRUE,'mensal',1,$3::jsonb) RETURNING id`,
        [`Tipo anexos ${sufixo}`, ids.categoria, JSON.stringify(["Bateria em condições"])] )).rows[0].id;
        const patrimonio = `ANEXO-${sufixo}`;
        ids.ativo = (await pool.query(`INSERT INTO ativos
            (tipo_ativo_id,setor_id,patrimonio,status,checklist_proxima_data)
            VALUES($1,$2,$3,'em_uso',CURRENT_DATE) RETURNING id`,
        [ids.tipo, ids.setor, patrimonio])).rows[0].id;
        const usuario = { id:null, nome:"Teste de anexos", login:"teste", perfil:"admin", setor_id:null };
        const detalhe = await service.detalhar(String(ids.tipo), patrimonio, usuario);
        assert.ok(detalhe.ocorrencia_id);
        const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
        const execucao = await service.executar(String(ids.tipo), patrimonio, {
            ocorrencia_id:detalhe.ocorrencia_id, modelo_id:detalhe.modelo_id,
            respostas:detalhe.perguntas.map((pergunta) => ({ pergunta_id:pergunta.id, resposta:"conforme" })),
            observacao:"Imagem de teste", imagens:[png]
        }, usuario);
        assert.equal(execucao.imagens.length, 1);
        arquivo = execucao.imagens[0];
        assert.equal(await model.imagemPermitida(execucao.id, arquivo, usuario), true);
        assert.equal(await model.imagemPermitida(execucao.id, arquivo,
            { perfil:"setor", setor_id:ids.setor + 10000 }), false);
        const registro = (await pool.query("SELECT pedido, imagens FROM execucoes_checklist WHERE id=$1", [execucao.id])).rows[0];
        assert.equal(registro.imagens[0], arquivo);
        assert.equal(registro.pedido.imagens, undefined);
        const atualizado = await service.detalhar(String(ids.tipo), patrimonio, usuario);
        assert.match(atualizado.historico[0].imagens[0], /\/uploads\/checklists\//);
        const pdf = await exportacoes.gerarRelatorio("checklist", "pdf",
            { tipo_checklist_id:String(ids.tipo), patrimonio }, usuario);
        assert.equal(pdf.total, 1);
        assert.match(pdf.conteudo.toString("latin1"), /\/Subtype \/Image/);
        await fs.access(path.resolve(__dirname, "../../../uploads/ativos", arquivo));
        await pool.query(`UPDATE ativos SET excluido_em=NOW()-INTERVAL '31 days',
            recuperavel_ate=NOW()-INTERVAL '1 day' WHERE id=$1`, [ids.ativo]);
        assert.equal((await lixeira.limparExpirados()).excluidos, 1);
        await assert.rejects(fs.access(path.resolve(__dirname, "../../../uploads/ativos", arquivo)),
            { code:"ENOENT" });
        ids.ativo = null;
        arquivo = null;
    } finally {
        if (ids.ativo) {
            await pool.query("DELETE FROM historico_ativos WHERE ativo_id=$1", [ids.ativo]);
            await pool.query("DELETE FROM execucoes_checklist WHERE ativo_id=$1", [ids.ativo]);
            await pool.query("DELETE FROM ativos WHERE id=$1", [ids.ativo]);
        }
        if (ids.tipo) await pool.query("DELETE FROM tipos_ativo WHERE id=$1", [ids.tipo]);
        if (ids.categoria) await pool.query("DELETE FROM categorias WHERE id=$1", [ids.categoria]);
        if (ids.setor) await pool.query("DELETE FROM setores WHERE id=$1", [ids.setor]);
        if (arquivo) await imagens.removerArquivo(arquivo);
        await pool.end();
    }
});
