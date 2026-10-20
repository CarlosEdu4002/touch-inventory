// =====================
// Dependências e configurações
// =====================

const tiposAtivoService = require(
    "../services/tiposAtivo.service"
);

// =====================
// Controladores das requisições
// =====================

// Função: Converte falhas de tipos de ativo em uma resposta HTTP apropriada, preservando mensagens conhecidas e ocultando erros internos.
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

// Função: Atende a rota de listagem de tipos de ativo e devolve os registros permitidos ao cliente.
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

// Função: Recebe o filtro da rota, solicita a listagem de tipos de ativo e envia o resultado ao cliente.
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

// Função: Atende a rota de consulta de tipos de ativo e devolve o registro encontrado ou o erro apropriado.
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

// Função: Recebe os dados da rota, solicita a criação de tipos de ativo e devolve o resultado ao cliente.
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

// Função: Recebe as alterações da rota, solicita a atualização de tipos de ativo e responde ao cliente.
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

// Função: Atende a solicitação de remoção de tipos de ativo e devolve confirmação ou erro ao cliente.
async function remover(req, res) {
    try {
        await tiposAtivoService.removerTipo(
            req.params.id,
            req.usuario,req.body
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

// =====================
// Exportações
// =====================

module.exports = {
    listar,
    listarPorCategoria,
    buscar,
    criar,
    atualizar,
    remover
};
