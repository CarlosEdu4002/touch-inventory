// =====================
// Dependências e configurações
// =====================

const categoriasService = require("../services/categorias.service");

// =====================
// Controladores das requisições
// =====================

// Função: Converte falhas de categorias em uma resposta HTTP apropriada, preservando mensagens conhecidas e ocultando erros internos.
function responderErro(res, erro, mensagemPadrao) {
    console.error(erro);

    if (erro.code === "23505") {
        return res.status(400).json({
            erro: "Categoria já existe"
        });
    }

    if (erro.code === "23503") {
        return res.status(400).json({
            erro: "A categoria possui tipos de ativos vinculados"
        });
    }

    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagemPadrao
    });
}

// Função: Atende a rota de listagem de categorias e devolve os registros permitidos ao cliente.
async function listar(req, res) {
    try {
        const categorias = await categoriasService.listarCategorias(
            req.usuario
        );
        return res.json(categorias);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao listar categorias");
    }
}

// Função: Atende a rota de consulta de categorias e devolve o registro encontrado ou o erro apropriado.
async function buscar(req, res) {
    try {
        const categoria = await categoriasService.buscarCategoria(
            req.params.id,
            req.usuario
        );

        return res.json(categoria);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao buscar categoria");
    }
}

// Função: Recebe os dados da rota, solicita a criação de categorias e devolve o resultado ao cliente.
async function criar(req, res) {
    try {
        const categoria = await categoriasService.criarCategoria(
            req.body,
            req.usuario
        );

        return res.status(201).json(categoria);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao criar categoria");
    }
}

// Função: Recebe as alterações da rota, solicita a atualização de categorias e responde ao cliente.
async function atualizar(req, res) {
    try {
        const categoria = await categoriasService.atualizarCategoria(
            req.params.id,
            req.body,
            req.usuario
        );

        return res.json(categoria);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao atualizar categoria");
    }
}

// Função: Atende a solicitação de remoção de categorias e devolve confirmação ou erro ao cliente.
async function remover(req, res) {
    try {
        await categoriasService.removerCategoria(
            req.params.id,
            req.usuario
        );

        return res.json({
            mensagem: "Categoria removida com sucesso"
        });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao remover categoria");
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    listar,
    buscar,
    criar,
    atualizar,
    remover
};
