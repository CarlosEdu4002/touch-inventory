// =====================
// Dependências e configurações
// =====================

const tiposAtivoModel = require("../models/tiposAtivo.model");
const { normalizarIcone } = require("../utils/icone");

// =====================
// Validações e regras de negócio
// =====================

// Função: Cria um erro de tipos de ativo com mensagem e status HTTP para tratamento uniforme pelas camadas superiores.
function criarErro(mensagem, status) {
    const erro = new Error(mensagem);
    erro.status = status;

    return erro;
}

// Função: Converte e valida o identificador de tipos de ativo, rejeitando valores que não sejam inteiros positivos.
function validarId(valor, campo) {
    const id = Number(valor);

    if (!Number.isInteger(id) || id <= 0) {
        throw criarErro(`${campo} inválido`, 400);
    }

    return id;
}

function normalizarConfiguracao(body) {
    const permiteChecklist = body.permite_checklist === true;
    const intervalos = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
    const recorrenciaLegada = ({ 1: "mensal", 3: "trimestral", 6: "semestral", 12: "anual" })[
        Number(body.checklist_intervalo_meses)
    ];
    const recorrencia = String(body.checklist_recorrencia || recorrenciaLegada || "mensal");
    const intervalo = intervalos[recorrencia] || null;
    const alerta = Number(body.checklist_alerta_dias ?? 15);
    const itens = Array.isArray(body.checklist_itens)
        ? body.checklist_itens.map((item) => String(item).trim()).filter(Boolean)
        : [];
    const datasPersonalizadas = [...new Set(
        (Array.isArray(body.checklist_datas_personalizadas)
            ? body.checklist_datas_personalizadas : [])
            .map((data) => String(data).trim()).filter(Boolean)
    )].sort();

    if (permiteChecklist) {
        if (!["semanal", "mensal", "trimestral", "semestral", "anual", "personalizado"].includes(recorrencia)) {
            throw criarErro("Selecione uma recorrência válida", 400);
        }
        if (recorrencia === "personalizado") {
            if (!datasPersonalizadas.length) {
                throw criarErro("Informe ao menos uma data específica para o checklist", 400);
            }
            if (datasPersonalizadas.some((data) => {
                if (data.startsWith("0000") || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return true;
                const interpretada = new Date(`${data}T12:00:00Z`);
                return Number.isNaN(interpretada.getTime()) ||
                    interpretada.toISOString().slice(0, 10) !== data;
            })) {
                throw criarErro("Informe datas específicas válidas", 400);
            }
        }
        if (!Number.isInteger(alerta) || alerta < 0 || alerta > 365) {
            throw criarErro("A antecedência deve ficar entre 0 e 365 dias", 400);
        }
        if (!itens.length) {
            throw criarErro("Informe ao menos um item para o checklist", 400);
        }
    }

    return {
        revisao: body.revisao,
        permite_checklist: permiteChecklist,
        checklist_intervalo_meses: permiteChecklist ? intervalo : null,
        checklist_recorrencia: permiteChecklist ? recorrencia : "mensal",
        checklist_datas_personalizadas: permiteChecklist && recorrencia === "personalizado"
            ? datasPersonalizadas : [],
        checklist_alerta_dias: alerta,
        checklist_modo: body.checklist_modo === "calendario" ? "calendario" : "conclusao",
        checklist_itens: itens,
        permite_vinculo: body.permite_vinculo === true
    };
}

// Função: Confirma que a categoria existe antes de consultar ou associar tipos de ativo.
async function validarCategoria(categoriaId) {
    const existe = await tiposAtivoModel.categoriaExiste(categoriaId);

    if (!existe) {
        throw criarErro("Categoria não encontrada", 404);
    }
}

// Função: Aplica as regras de acesso e devolve a lista de tipos de ativo disponível ao usuário.
async function listarTipos(usuario) {
    return tiposAtivoModel.listar(usuario);
}

// Função: Confirma que a categoria pertence ao setor administrado pelo usuário.
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

// Função: Confirma que o usuário pode gerenciar o tipo indicado antes de alterá-lo ou removê-lo.
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

// Função: Aplica as regras de acesso e devolve a lista de tipos de ativo disponível ao usuário.
async function listarTiposPorCategoria(categoriaIdInformado, usuario) {
    const categoriaId = validarId(
        categoriaIdInformado,
        "ID da categoria"
    );

    await validarCategoria(categoriaId);

    return tiposAtivoModel.listarPorCategoria(categoriaId, usuario);
}

// Função: Valida a consulta e devolve o registro correspondente de tipos de ativo.
async function buscarTipo(idInformado, usuario) {
    const id = validarId(idInformado, "ID do tipo de ativo");

    const tipo = await tiposAtivoModel.buscarPorId(id, usuario);

    if (!tipo) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }

    return tipo;
}

// Função: Valida os dados e permissões antes de criar o registro de tipos de ativo.
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
    const configuracao = normalizarConfiguracao(body);

    return tiposAtivoModel.criar(
        categoriaId,
        nome,
        normalizarIcone(body.icone),
        body.permite_emprestimo === true,
        configuracao,
        usuario
    );
}

// Função: Valida dados e permissões antes de atualizar o registro de tipos de ativo.
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
    const atual = await buscarTipo(id, usuario);
    await validarCategoriaGerenciavel(categoriaId, usuario);
    const configuracao = normalizarConfiguracao(body);

    if (
        body.permite_emprestimo !== true &&
        await tiposAtivoModel.possuiEmprestimosAbertos(id)
    ) {
        throw criarErro(
            "Devolva os ativos emprestados antes de desativar empréstimos para este tipo",
            409
        );
    }

    if (!configuracao.permite_vinculo &&
        await tiposAtivoModel.possuiVinculosAtivos(id)) {
        throw criarErro(
            "Desvincule os ativos antes de desativar vínculos para este tipo",
            409
        );
    }

    const tipo = await tiposAtivoModel.atualizar(
        id,
        categoriaId,
        nome,
        body.icone === undefined
            ? atual.icone
            : normalizarIcone(body.icone),
        body.permite_emprestimo === true,
        configuracao,
        usuario
    );

    if (!tipo) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }

    return tipo;
}

// Função: Confere existência e permissão antes de remover o registro de tipos de ativo.
async function removerTipo(idInformado, usuario, body={}) {
    const id = validarId(idInformado, "ID do tipo de ativo");

    await validarTipoGerenciavel(id, usuario);
    const tipo = await tiposAtivoModel.remover(id,usuario,body.revisao);

    if (!tipo) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    listarTipos,
    listarTiposPorCategoria,
    buscarTipo,
    criarTipo,
    atualizarTipo,
    removerTipo
};
