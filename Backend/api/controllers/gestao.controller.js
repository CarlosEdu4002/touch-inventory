const gestaoModel = require("../models/gestao.model");
const gestaoService = require("../services/gestao.service");

function responder(res, erro, padrao) {
    console.error(erro);
    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : padrao
    });
}

async function dashboard(req, res) {
    try {
        return res.json(await gestaoModel.dashboard(req.usuario));
    } catch (erro) {
        return responder(res, erro, "Erro ao carregar dashboard");
    }
}

async function listarStatus(req, res) {
    try {
        return res.json(
            await gestaoModel.listarStatus(req.usuario.perfil !== "admin")
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao listar status");
    }
}

async function salvarStatus(req, res) {
    try {
        return res.json(
            await gestaoService.salvarStatus(
                req.params.codigo,
                req.body
            )
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao salvar status");
    }
}

async function listarUsuarios(req, res) {
    try {
        return res.json(await gestaoModel.listarUsuarios());
    } catch (erro) {
        return responder(res, erro, "Erro ao listar usuários");
    }
}

async function criarUsuario(req, res) {
    try {
        return res.status(201).json(
            await gestaoService.criarUsuario(req.body)
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao criar usuário");
    }
}

async function atualizarUsuario(req, res) {
    try {
        return res.json(
            await gestaoService.atualizarUsuario(
                req.params.id,
                req.body,
                req.usuario
            )
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao atualizar usuário");
    }
}

async function encerrarSessoes(req, res) {
    try {
        await gestaoModel.encerrarSessoes(Number(req.params.id));
        return res.json({ mensagem: "Sessões encerradas" });
    } catch (erro) {
        return responder(res, erro, "Erro ao encerrar sessões");
    }
}

module.exports = {
    dashboard,
    listarStatus,
    salvarStatus,
    listarUsuarios,
    criarUsuario,
    atualizarUsuario,
    encerrarSessoes
};
