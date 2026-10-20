const model = require("../models/vinculos.model");

function falha(mensagem, status = 400) {
    const erro = new Error(mensagem); erro.status = status; return erro;
}

async function detalhar(tipo, patrimonio, usuario) {
    const ativo = await model.buscarAtivo(tipo, patrimonio, usuario);
    if (!ativo) throw falha("Ativo não encontrado", 404);
    return {
        ativo,
        grupo: await model.buscarGrupoPorAtivo(ativo.ativo_id, usuario)
    };
}

async function candidatos(query, usuario) {
    return model.candidatos(String(query.q || "").trim(), usuario);
}

async function listar(query, usuario) {
    const informado = query.categoria_id;
    const categoriaId = informado === undefined || informado === ""
        ? null : Number(informado);
    if (categoriaId !== null && (!Number.isInteger(categoriaId) || categoriaId <= 0)) {
        throw falha("Categoria inválida");
    }
    return model.listarGrupos(usuario, categoriaId);
}

async function validarMembros(idsInformados, usuario, grupoId = null, cliente) {
    const ids = [...new Set((idsInformados || []).map(Number)
        .filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length < 2) throw falha("Selecione ao menos dois ativos");
    const ativos = await model.buscarAtivos(ids, usuario, cliente);
    if (ativos.length !== ids.length) throw falha("Um ou mais ativos não foram encontrados", 404);
    if (ativos.some((ativo) => !ativo.permite_vinculo)) {
        throw falha("Todos os tipos selecionados precisam permitir vínculos", 409);
    }
    if (ativos.some((ativo) => (ativo.status === "emprestado" || ativo.emprestimo_aberto))) {
        throw falha("Devolva os ativos emprestados antes de vinculá-los", 409);
    }
    const setores = new Set(ativos.map((ativo) => Number(ativo.setor_id)));
    if (setores.size !== 1) throw falha("Os ativos do grupo precisam pertencer ao mesmo setor", 409);
    const setoresProprietarios = new Set(ativos.map((ativo) => Number(ativo.categoria_setor_id)));
    if (setoresProprietarios.size !== 1) {
        throw falha("Os tipos vinculados precisam pertencer ao mesmo setor responsável", 409);
    }
    const ocupado = ativos.find((ativo) => ativo.grupo_id && Number(ativo.grupo_id) !== Number(grupoId));
    if (ocupado) throw falha(`${ocupado.patrimonio} já pertence a outro grupo`, 409);
    return { ids, setorId: ativos[0].setor_id };
}

async function criar(body, usuario) {
    const nome = String(body.nome || "").trim();
    if (!nome) throw falha("Informe o nome do grupo");
    const membros = await validarMembros(body.ativo_ids, usuario);
    const id = await model.salvar(null, nome, membros.ids, usuario, membros.setorId,undefined,body.revisoes);
    return { id, nome };
}

async function atualizar(idInformado, body, usuario) {
    const id = Number(idInformado);
    const nome = String(body.nome || "").trim();
    if (!Number.isInteger(id) || !nome) throw falha("Grupo inválido");
    const membrosAtuais = await model.listarMembros(id, usuario);
    if (!membrosAtuais.length) throw falha("Grupo não encontrado", 404);
    const membros = await validarMembros(body.ativo_ids, usuario, id);
    await model.salvar(id, nome, membros.ids, usuario, membros.setorId,body.revisao,body.revisoes);
    return { id, nome };
}

async function desvincular(grupoIdInformado, ativoIdInformado, usuario, body={}) {
    const grupoId = Number(grupoIdInformado);
    const ativoId = Number(ativoIdInformado);
    const membros = await model.listarMembros(grupoId, usuario);
    if (!membros.some((item) => Number(item.ativo_id) === ativoId)) {
        throw falha("Vínculo não encontrado", 404);
    }
    await model.desvincular(grupoId, ativoId,usuario,body.revisao);
}

module.exports = { validarMembros, listar, detalhar, candidatos, criar, atualizar, desvincular };
