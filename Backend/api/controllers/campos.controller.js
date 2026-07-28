const camposService = require("../services/campos.service");

function responderErro(res, erro, mensagemPadrao) {
    console.error(erro);

    if (erro.code === "23505") {
        return res.status(400).json({
            erro: "Já existe um campo com esse nome nesse tipo de ativo"
        });
    }

    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagemPadrao
    });
}

async function listarPorTipo(req, res) {
    try {
        const campos = await camposService.listarCampos(
            req.params.tipoId,
            req.usuario
        );

        return res.json(campos);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao listar campos");
    }
}

async function buscar(req, res) {
    try {
        const campo = await camposService.buscarCampo(req.params.id);
        return res.json(campo);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao buscar campo");
    }
}

async function criar(req, res) {
    try {
        const campo = await camposService.criarCampo(
            req.body,
            req.usuario
        );
        return res.status(201).json(campo);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao criar campo");
    }
}

async function atualizar(req, res) {
    try {
        const campo = await camposService.atualizarCampo(
            req.params.id,
            req.body,
            req.usuario
        );

        return res.json(campo);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao atualizar campo");
    }
}

async function remover(req, res) {
    try {
        await camposService.removerCampo(
            req.params.id,
            req.usuario
        );

        return res.json({
            mensagem: "Campo removido com sucesso"
        });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao remover campo");
    }
}

module.exports = {
    listarPorTipo,
    buscar,
    criar,
    atualizar,
    remover
};
