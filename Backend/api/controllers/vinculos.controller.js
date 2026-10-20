const service = require("../services/vinculos.service");

function responder(res, erro, padrao) {
    console.error(padrao, erro);
    return res.status(erro.status || 500).json({ erro: erro.message || padrao });
}

async function listar(req, res) {
    try { return res.json(await service.listar(req.query, req.usuario)); }
    catch (erro) { return responder(res, erro, "Erro ao listar grupos"); }
}

async function detalhar(req, res) {
    try { return res.json(await service.detalhar(req.params.tipo, req.params.patrimonio, req.usuario)); }
    catch (erro) { return responder(res, erro, "Erro ao carregar vínculos"); }
}
async function candidatos(req, res) {
    try { return res.json(await service.candidatos(req.query, req.usuario)); }
    catch (erro) { return responder(res, erro, "Erro ao buscar ativos"); }
}
async function criar(req, res) {
    try { return res.status(201).json(await service.criar(req.body, req.usuario)); }
    catch (erro) { return responder(res, erro, "Erro ao criar grupo"); }
}
async function atualizar(req, res) {
    try { return res.json(await service.atualizar(req.params.id, req.body, req.usuario)); }
    catch (erro) { return responder(res, erro, "Erro ao atualizar grupo"); }
}
async function desvincular(req, res) {
    try {
        await service.desvincular(req.params.id, req.params.ativoId, req.usuario,req.body);
        return res.json({ mensagem: "Ativo desvinculado com sucesso" });
    } catch (erro) { return responder(res, erro, "Erro ao desvincular ativo"); }
}

module.exports = { listar, detalhar, candidatos, criar, atualizar, desvincular };
