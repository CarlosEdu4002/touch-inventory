// =====================
// Dependências e configurações
// =====================

const nfcService = require("../services/nfc.service");

// =====================
// Controladores das requisições
// =====================

// Função: Converte falhas de vínculos NFC em uma resposta HTTP apropriada, preservando mensagens conhecidas e ocultando erros internos.
function responderErro(res, erro) {
    console.error(erro);
    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : "Erro ao acessar tag NFC"
    });
}

// Função: Atende a rota de consulta de vínculos NFC e devolve o registro encontrado ou o erro apropriado.
async function buscar(req, res) {
    try {
        return res.json(await nfcService.buscar(req.params.uid, req.usuario));
    } catch (erro) {
        return responderErro(res, erro);
    }
}

// Função: Recebe UID e identificação do ativo, solicita o vínculo da tag e devolve a associação criada.
async function vincular(req, res) {
    try {
        return res.json(
            await nfcService.vincular(req.params.uid, req.body, req.usuario)
        );
    } catch (erro) {
        return responderErro(res, erro);
    }
}

// =====================
// Exportações
// =====================

module.exports = { buscar, vincular };
