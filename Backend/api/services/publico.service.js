// =====================
// Dependências e configurações
// =====================

const lixeiraModel = require("../models/lixeira.model");
const camposModel = require("../models/campos.model");
const gestaoModel = require("../models/gestao.model");

// =====================
// Validações e regras de negócio
// =====================

// A consulta de detalhes usa somente o ID permanente no esquema da unidade selecionada.
async function buscarAtivo(ativoId, usuario) {
    if (!usuario) {
        const erro = new Error("Autenticação necessária");
        erro.status = 401;
        throw erro;
    }
    const ativo = await lixeiraModel.buscar(ativoId, usuario);
    if (!ativo || ativo.excluido_em) {
        const erro = new Error("Ativo não encontrado");
        erro.status = 404;
        throw erro;
    }
    const [campos, status] = await Promise.all([
        camposModel.listarPorTipo(ativo.tipo_ativo_id),
        gestaoModel.listarStatus(false)
    ]);
    const statusAtual = status.find(
        (item) => item.codigo === ativo.status
    );
    return {
        tipo: {
            id: ativo.tipo_ativo_id,
            nome: ativo.tipo_nome,
            categoria_nome: ativo.categoria_nome
        },
        ativo: {
            ...Object.fromEntries(campos.filter((campo) => campo.visivel !== false)
                .map((campo) => [campo.nome, ativo.dados?.[campo.nome]])),
            patrimonio: ativo.patrimonio,
            id: ativo.id,
            setor: ativo.setor_nome,
            status: statusAtual?.nome || ativo.status,
            imagem_url: ativo.imagem
                ? require("../database/contexto-unidade").urlArquivo(`/uploads/ativos/${encodeURIComponent(ativo.imagem)}`)
                : null
        },
        campos: campos
            .filter((campo) => campo.visivel !== false)
            .map((campo) => ({
                nome: campo.nome,
                label: campo.label,
                tipo: campo.tipo,
                opcoes: campo.opcoes
            }))
    };
}

// =====================
// Exportações
// =====================

module.exports = { buscarAtivo };
