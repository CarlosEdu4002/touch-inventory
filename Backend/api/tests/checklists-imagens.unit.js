"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const model = require("../models/checklists.model");
const imagens = require("../services/imagens.service");
const service = require("../services/checklists.service");

test("checklist aceita até seis imagens e não grava base64 no pedido", async () => {
    const buscarAtivo = model.buscarAtivo;
    const registrar = model.registrar;
    const preparar = imagens.preparar;
    let dadosRecebidos;
    let indice = 0;
    model.buscarAtivo = async () => ({
        id: 1, ocorrencia_id: 2, modelo_id: 3, permite_checklist: false,
        perguntas: [{ id: "p1", texto: "Condição" }]
    });
    imagens.preparar = async () => `anexo-${++indice}.png`;
    model.registrar = async (_, dados) => { dadosRecebidos = dados; return { id: 4 }; };
    try {
        const imagem = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
        const body = { ocorrencia_id: 2, modelo_id: 3,
            respostas: [{ pergunta_id: "p1", resposta: "conforme" }],
            imagens: [imagem, imagem] };
        await service.executar("1", "AT-1", body, { perfil: "admin" });
        assert.equal(dadosRecebidos.arquivos.length, 2);
        assert.equal(dadosRecebidos.body.imagens, undefined);
        assert.doesNotMatch(JSON.stringify(dadosRecebidos.body), /base64/);
        await assert.rejects(service.executar("1", "AT-1", { ...body, imagens:Array(7).fill(imagem) },
            { perfil:"admin" }), { status:400 });
    } finally {
        model.buscarAtivo = buscarAtivo;
        model.registrar = registrar;
        imagens.preparar = preparar;
    }
});
