const mapasService = require("../services/mapas.service");

function responderErro(res, falha, mensagem) {
    console.error(falha);
    return res.status(falha.status || 500).json({ erro: falha.status ? falha.message : mensagem });
}

async function listar(req, res) {
    try { return res.json(await mapasService.listar(req.usuario)); }
    catch (falha) { return responderErro(res, falha, "Erro ao listar plantas"); }
}

async function detalhar(req, res) {
    try { return res.json(await mapasService.detalhar(req.params.id, req.usuario)); }
    catch (falha) { return responderErro(res, falha, "Erro ao carregar planta"); }
}

async function criar(req, res) {
    try { return res.status(201).json(await mapasService.criar(req.body, req.usuario)); }
    catch (falha) { return responderErro(res, falha, "Erro ao cadastrar planta"); }
}

async function atualizar(req, res) {
    try { return res.json(await mapasService.atualizar(req.params.id, req.body)); }
    catch (falha) { return responderErro(res, falha, "Erro ao atualizar planta"); }
}

async function remover(req, res) {
    try { await mapasService.remover(req.params.id); return res.json({ mensagem: "Planta removida" }); }
    catch (falha) { return responderErro(res, falha, "Erro ao remover planta"); }
}

async function criarAmbiente(req, res) {
    try { return res.status(201).json(await mapasService.salvarAmbiente(null, req.body)); }
    catch (falha) { return responderErro(res, falha, "Erro ao cadastrar ambiente"); }
}

async function atualizarAmbiente(req, res) {
    try { return res.json(await mapasService.salvarAmbiente(req.params.id, req.body)); }
    catch (falha) { return responderErro(res, falha, "Erro ao atualizar ambiente"); }
}

async function removerAmbiente(req, res) {
    try { await mapasService.removerAmbiente(req.params.id); return res.json({ mensagem: "Ambiente removido" }); }
    catch (falha) { return responderErro(res, falha, "Erro ao remover ambiente"); }
}

async function moverAtivo(req, res) {
    try { return res.json(await mapasService.moverAtivo(req.params.id, req.body, req.usuario)); }
    catch (falha) { return responderErro(res, falha, "Erro ao posicionar ativo"); }
}

module.exports = { listar, detalhar, criar, atualizar, remover, criarAmbiente, atualizarAmbiente, removerAmbiente, moverAtivo };
