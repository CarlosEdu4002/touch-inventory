require("dotenv").config({ quiet: true });
const { Pool } = require("pg");
const contexto = require("./contexto-unidade");
const schemaTeste = process.env.INVENTARIO_TEST_SCHEMA;
if (schemaTeste && (process.env.NODE_ENV !== "test" || !/^nfc_test_[a-f0-9]{16}$/.test(schemaTeste))) {
    throw new Error("Esquema isolado de teste inválido");
}
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: "-c timezone=" + (process.env.DB_TIMEZONE || "America/Cuiaba") + (schemaTeste ? " -c search_path=" + schemaTeste : "")
});
// O pg emite "error" quando uma conexão ociosa cai. Sem listener, o evento encerra o Node.
// O pool descarta essa conexão; a próxima tentativa do worker obterá outra.
pool.on("error", (erro) => {
    console.error("Conexão ociosa do PostgreSQL falhou:", erro.code || erro.name || "desconhecido");
});
const conectar = pool.connect.bind(pool);
async function prepararCliente() {
    const cliente = await conectar();
    const schema = schemaTeste || contexto.atual();
    if (!schema) return cliente;
    try {
        await cliente.query('SET search_path TO "' + schema + '"');
    } catch (erro) {
        cliente.release(erro);
        throw erro;
    }
    const soltar = cliente.release.bind(cliente);
    let liberado = false;
    cliente.release = function () {
        if (liberado) return;
        liberado = true;
        cliente.query("RESET search_path").then(
            () => soltar(),
            (erro) => soltar(erro)
        );
    };
    return cliente;
}
pool.connect = prepararCliente;
pool.query = async function (sql, params) {
    const cliente = await prepararCliente();
    try { return await cliente.query(sql, params); }
    finally { cliente.release(); }
};
module.exports = pool;
