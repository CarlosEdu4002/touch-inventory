// =====================
// Dependências e configurações
// =====================

const categoriasModel = require("../models/categorias.model");
const { normalizarIcone } = require("../utils/icone");

// =====================
// Validações e regras de negócio
// =====================

// Função: Aplica as regras de acesso e devolve a lista de categorias disponível ao usuário.
async function listarCategorias(usuario) {
    return categoriasModel.listar(usuario);
}

// Função: Valida a consulta e devolve o registro correspondente de categorias.
async function buscarCategoria(id, usuario) {
    const categoria = await categoriasModel.buscarPorId(id, usuario);

    if (!categoria) {
        const erro = new Error("Categoria não encontrada");
        erro.status = 404;
        throw erro;
    }

    return categoria;
}

// Função: Valida os dados e permissões antes de criar o registro de categorias.
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
    return categoriasModel.criar(
        nome,
        normalizarIcone(body.icone),
        setorId,
        usuario
    );
}

// Função: Valida dados e permissões antes de atualizar o registro de categorias.
async function atualizarCategoria(id, body, usuario) {
    const nome = body.nome?.trim();

    if (!nome) {
        const erro = new Error("Nome da categoria é obrigatório");
        erro.status = 400;
        throw erro;
    }

    const atual = await buscarCategoria(id, usuario);
    const icone = body.icone === undefined
        ? atual.icone
        : normalizarIcone(body.icone);
    const categoria = await categoriasModel.atualizar(
        id,
        nome,
        icone,
        usuario
    );

    if (!categoria) {
        const erro = new Error("Categoria não encontrada");
        erro.status = 404;
        throw erro;
    }

    return categoria;
}

// Função: Confere existência e permissão antes de remover o registro de categorias.
async function removerCategoria(id, usuario) {
    const categoria = await categoriasModel.remover(id, usuario);

    if (!categoria) {
        const erro = new Error("Categoria não encontrada");
        erro.status = 404;
        throw erro;
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    listarCategorias,
    buscarCategoria,
    criarCategoria,
    atualizarCategoria,
    removerCategoria
};
