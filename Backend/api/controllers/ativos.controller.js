const ativosService = require("../services/ativos.service");

// =====================
// Tratamento de erros
// =====================

function responderErro(res, erro, mensagemPadrao) {
    console.error(erro);

    if (erro.code === "23505") {
        return res.status(400).json({
            erro: "Patrimônio já existe"
        });
    }

    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagemPadrao
    });
}

// =====================
// Controllers
// =====================

async function listar(req, res) {
    try {
        const ativos = await ativosService.listarAtivos(
            req.params.tipo,
            req.usuario
        );

        return res.json(ativos);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao listar ativos"
        );
    }
}

async function buscar(req, res) {
    try {
        const ativo = await ativosService.buscarAtivo(
            req.params.tipo,
            req.params.id,
            req.usuario
        );

        return res.json(ativo);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao buscar ativo"
        );
    }
}

async function criar(req, res) {
    try {
        await ativosService.criarAtivo(
            req.params.tipo,
            req.body,
            req.usuario
        );

        return res.status(201).json({
            mensagem: "Ativo cadastrado com sucesso"
        });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao cadastrar ativo"
        );
    }
}

async function atualizar(req, res) {
    try {
        await ativosService.atualizarAtivo(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );

        return res.json({
            mensagem: "Ativo atualizado com sucesso"
        });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao atualizar ativo"
        );
    }
}

async function remover(req, res) {
    try {
        await ativosService.removerAtivo(
            req.params.tipo,
            req.params.id,
            req.usuario
        );

        return res.json({
            mensagem: "Ativo removido com sucesso"
        });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao remover ativo"
        );
    }
}

async function historico(req, res) {
    try {
        return res.json(
            await ativosService.listarHistorico(
                req.params.tipo,
                req.params.id,
                req.usuario
            )
        );
    } catch (erro) {
        return responderErro(res, erro, "Erro ao carregar histórico");
    }
}

async function transferir(req, res) {
    try {
        await ativosService.transferirAtivo(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );
        return res.json({ mensagem: "Ativo transferido com sucesso" });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao transferir ativo");
    }
}

module.exports = {
    listar,
    buscar,
    criar,
    atualizar,
    remover,
    historico,
    transferir
};
