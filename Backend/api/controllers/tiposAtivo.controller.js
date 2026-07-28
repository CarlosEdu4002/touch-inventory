const tiposAtivoService = require(
    "../services/tiposAtivo.service"
);

function responderErro(res, erro, mensagemPadrao) {
    console.error(erro);

    if (erro.code === "23505") {
        return res.status(400).json({
            erro: "Esse tipo de ativo já existe nessa categoria"
        });
    }

    if (erro.code === "23503") {
        return res.status(400).json({
            erro: "Esse tipo possui campos ou ativos vinculados"
        });
    }

    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagemPadrao
    });
}

async function listar(req, res) {
    try {
        const tipos = await tiposAtivoService.listarTipos(
            req.usuario
        );

        return res.json(tipos);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao listar tipos de ativos"
        );
    }
}

async function listarPorCategoria(req, res) {
    try {
        const tipos =
            await tiposAtivoService.listarTiposPorCategoria(
                req.params.categoriaId
                ,
                req.usuario
            );

        return res.json(tipos);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao listar tipos da categoria"
        );
    }
}

async function buscar(req, res) {
    try {
        const tipo = await tiposAtivoService.buscarTipo(
            req.params.id,
            req.usuario
        );

        return res.json(tipo);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao buscar tipo de ativo"
        );
    }
}

async function criar(req, res) {
    try {
        const tipo = await tiposAtivoService.criarTipo(
            req.body,
            req.usuario
        );

        return res.status(201).json(tipo);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao criar tipo de ativo"
        );
    }
}

async function atualizar(req, res) {
    try {
        const tipo = await tiposAtivoService.atualizarTipo(
            req.params.id,
            req.body,
            req.usuario
        );

        return res.json(tipo);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao atualizar tipo de ativo"
        );
    }
}

async function remover(req, res) {
    try {
        await tiposAtivoService.removerTipo(
            req.params.id,
            req.usuario
        );

        return res.json({
            mensagem: "Tipo de ativo removido com sucesso"
        });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao remover tipo de ativo"
        );
    }
}

module.exports = {
    listar,
    listarPorCategoria,
    buscar,
    criar,
    atualizar,
    remover
};
