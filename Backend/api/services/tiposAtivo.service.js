const tiposAtivoModel = require("../models/tiposAtivo.model");

function criarErro(mensagem, status) {
    const erro = new Error(mensagem);
    erro.status = status;

    return erro;
}

function validarId(valor, campo) {
    const id = Number(valor);

    if (!Number.isInteger(id) || id <= 0) {
        throw criarErro(`${campo} inválido`, 400);
    }

    return id;
}

async function validarCategoria(categoriaId) {
    const existe = await tiposAtivoModel.categoriaExiste(categoriaId);

    if (!existe) {
        throw criarErro("Categoria não encontrada", 404);
    }
}

async function listarTipos(usuario) {
    return tiposAtivoModel.listar(usuario);
}

async function validarCategoriaGerenciavel(categoriaId, usuario) {
    await validarCategoria(categoriaId);
    const permitido = await tiposAtivoModel.categoriaGerenciavel(
        categoriaId,
        usuario
    );

    if (!permitido) {
        throw criarErro("Categoria não pertence ao seu setor", 403);
    }
}

async function validarTipoGerenciavel(id, usuario) {
    const permitido = await tiposAtivoModel.usuarioPodeGerenciar(
        id,
        usuario
    );

    if (!permitido) {
        throw criarErro(
            "Tipo de ativo não encontrado ou sem permissão",
            404
        );
    }
}

async function listarTiposPorCategoria(categoriaIdInformado, usuario) {
    const categoriaId = validarId(
        categoriaIdInformado,
        "ID da categoria"
    );

    await validarCategoria(categoriaId);

    return tiposAtivoModel.listarPorCategoria(categoriaId, usuario);
}

async function buscarTipo(idInformado, usuario) {
    const id = validarId(idInformado, "ID do tipo de ativo");

    const tipo = await tiposAtivoModel.buscarPorId(id, usuario);

    if (!tipo) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }

    return tipo;
}

async function criarTipo(body, usuario) {
    const categoriaId = validarId(
        body.categoria_id,
        "ID da categoria"
    );

    const nome = body.nome?.trim();

    if (!nome) {
        throw criarErro(
            "Nome do tipo de ativo é obrigatório",
            400
        );
    }

    await validarCategoriaGerenciavel(categoriaId, usuario);

    return tiposAtivoModel.criar(categoriaId, nome);
}

async function atualizarTipo(idInformado, body, usuario) {
    const id = validarId(idInformado, "ID do tipo de ativo");

    const categoriaId = validarId(
        body.categoria_id,
        "ID da categoria"
    );

    const nome = body.nome?.trim();

    if (!nome) {
        throw criarErro(
            "Nome do tipo de ativo é obrigatório",
            400
        );
    }

    await validarTipoGerenciavel(id, usuario);
    await validarCategoriaGerenciavel(categoriaId, usuario);

    const tipo = await tiposAtivoModel.atualizar(
        id,
        categoriaId,
        nome
    );

    if (!tipo) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }

    return tipo;
}

async function removerTipo(idInformado, usuario) {
    const id = validarId(idInformado, "ID do tipo de ativo");

    await validarTipoGerenciavel(id, usuario);
    const tipo = await tiposAtivoModel.remover(id);

    if (!tipo) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }
}

module.exports = {
    listarTipos,
    listarTiposPorCategoria,
    buscarTipo,
    criarTipo,
    atualizarTipo,
    removerTipo
};
