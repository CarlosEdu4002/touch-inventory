const { AsyncLocalStorage } = require("node:async_hooks");
const storage = new AsyncLocalStorage();
function executar(schema, trabalho, chave = null) {
    if (schema !== "public" && !/^unidade_[1-9][0-9]*$/.test(schema || "")) {
        throw new Error("Unidade inválida");
    }
    return storage.run({ schema, chave }, trabalho);
}
function atual() { return storage.getStore()?.schema; }
function urlArquivo(caminho) {
    const chave = storage.getStore()?.chave;
    return chave ? caminho + "?contexto=" + encodeURIComponent(chave) : caminho;
}
module.exports = { executar, atual, urlArquivo };
