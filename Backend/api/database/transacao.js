const pool = require("./connection");

// Uma conexão acompanha toda a operação. Nunca confirma transações de terceiros.
async function executar(operacao, clienteExistente, opcoes = {}) {
    if (clienteExistente) return operacao(clienteExistente);
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        if(opcoes.semEspera) {
            const trava=await cliente.query("SELECT pg_try_advisory_xact_lock(67072026) AS livre");
            if(!trava.rows[0].livre) {await cliente.query("COMMIT");return 0;}
        } else await require("../database/concorrencia").bloquear(cliente);
        const resultado = await operacao(cliente);
        await cliente.query("COMMIT");
        return resultado;
    } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => {});
        if (["40P01","40001","55P03"].includes(erro.code)) {erro.status=409;erro.message="Outra operação alterou estes dados. Consulte o estado atual antes de tentar novamente.";}
        throw erro;
    } finally { cliente.release(); }
}

module.exports = { executar };
