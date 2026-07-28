const categoriasModel = require("../models/categorias.model");

async function listarCategorias(usuario) {
    return categoriasModel.listar(usuario);
}

async function buscarCategoria(id, usuario) {
    const categoria = await categoriasModel.buscarPorId(id, usuario);

    if (!categoria) {
        const erro = new Error("Categoria não encontrada");
        erro.status = 404;
        throw erro;
    }

    return categoria;
}

async function criarCategoria(body, usuario) {
    const nome = body.nome?.trim();

    if (!nome) {
        const erro = new Error("Nome da categoria é obrigatório");
        erro.status = 400;
        throw erro;
    }

    const setorId = usuario.perfil === "admin"
        ? null
        : usuario.setor_id;
    return categoriasModel.criar(nome, setorId);
}

async function atualizarCategoria(id, body, usuario) {
    const nome = body.nome?.trim();

    if (!nome) {
        const erro = new Error("Nome da categoria é obrigatório");
        erro.status = 400;
        throw erro;
    }

    const categoria = await categoriasModel.atualizar(id, nome, usuario);

    if (!categoria) {
        const erro = new Error("Categoria não encontrada");
        erro.status = 404;
        throw erro;
    }

    return categoria;
}

async function removerCategoria(id, usuario) {
    const categoria = await categoriasModel.remover(id, usuario);

    if (!categoria) {
        const erro = new Error("Categoria não encontrada");
        erro.status = 404;
        throw erro;
    }
}

module.exports = {
    listarCategorias,
    buscarCategoria,
    criarCategoria,
    atualizarCategoria,
    removerCategoria
};
