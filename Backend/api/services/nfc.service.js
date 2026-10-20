// =====================
// Dependências e configurações
// =====================

const nfcModel = require("../models/nfc.model");

// =====================
// Validações e regras de negócio
// =====================

// Função: Normaliza o UID para hexadecimal em maiúsculas e rejeita formatos NFC inválidos.
function validarUid(valor) {
    const uid = String(valor || "").trim().toUpperCase();
    if (!/^[0-9A-F]{8,32}$/.test(uid)) {
        const erro = new Error("UID NFC inválido");
        erro.status = 400;
        throw erro;
    }
    return uid;
}

// Função: Valida a consulta e devolve o registro correspondente de vínculos NFC.
async function buscar(uid, usuario) {
    const vinculo = await nfcModel.buscarPorUid(validarUid(uid), usuario);
    if (!vinculo) {
        const erro = new Error("Tag NFC ainda não vinculada");
        erro.status = 404;
        throw erro;
    }
    return { ...vinculo, unidade_id: usuario.unidade_id };
}

// Função: Valida o ID permanente antes de associar a tag NFC ao ativo da unidade selecionada.
async function vincular(uid, body, usuario) {
    const ativoId = Number(body?.ativo_id);
    if (!Number.isSafeInteger(ativoId) || ativoId <= 0 || ativoId > 2147483647) {
        const erro = new Error("ID do ativo inválido");
        erro.status = 400;
        throw erro;
    }
    const vinculo = await nfcModel.vincular(
        validarUid(uid),
        ativoId,
        usuario
    );
    if (!vinculo) {
        const erro = new Error("Ativo não encontrado para vincular a tag");
        erro.status = 404;
        throw erro;
    }
    return { ...vinculo, unidade_id: usuario.unidade_id };
}

// =====================
// Exportações
// =====================

module.exports = { buscar, vincular };
