// Protocolo conservador: todas as mutações transacionais obtêm a mesma trava
// antes de grupos, ativos, tipos e posições. Leituras não são serializadas.
async function bloquear(cliente) {
    await cliente.query("SET LOCAL lock_timeout = '10s'");
    await cliente.query("SELECT pg_advisory_xact_lock(67072026)");
}
function conferir(enviada, atual) {
    if (!Number.isSafeInteger(Number(enviada)) || Number(enviada) < 1 || Number(enviada) !== Number(atual)) {
        const erro = new Error("Os dados mudaram desde a abertura deste formulário. Seu preenchimento foi preservado. Consulte os dados atuais antes de tentar novamente.");
        erro.status = 409;
        throw erro;
    }
}
function tratar(erro) {
    if(["40P01","40001","55P03"].includes(erro.code)) {
        erro.status=409;erro.message="Outra operação está alterando estes dados. Seu preenchimento foi preservado. Consulte os dados atuais antes de tentar novamente.";
    }
    return erro;
}
module.exports = { bloquear, conferir, tratar };
