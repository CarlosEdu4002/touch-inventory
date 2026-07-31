const ativosModel = require("../models/ativos.model");
const camposModel = require("../models/campos.model");
const gestaoModel = require("../models/gestao.model");

async function buscarAtivo(tipo, patrimonio) {
    const ativo = await ativosModel.buscarPublico(tipo, patrimonio);
    if (!ativo) {
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
            patrimonio: ativo.patrimonio,
            setor: ativo.setor_nome,
            status: statusAtual?.nome || ativo.status,
            ...(ativo.dados || {}),
            imagem_url: ativo.imagem
                ? `/uploads/ativos/${encodeURIComponent(ativo.imagem)}`
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

module.exports = { buscarAtivo };
