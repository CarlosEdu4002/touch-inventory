const assert = require("node:assert/strict");

function substituir(caminho, exports) {
    const id = require.resolve(caminho);
    const anterior = require.cache[id];
    require.cache[id] = { id, filename: id, loaded: true, exports };
    return () => {
        if (anterior) require.cache[id] = anterior;
        else delete require.cache[id];
    };
}
async function ate(condicao) {
    for (let i = 0; i < 100; i++) {
        if (condicao()) return;
        await new Promise((resolver) => setImmediate(resolver));
    }
    assert.fail("Worker não concluiu a tentativa esperada");
}
async function exercitarWorker(tipo) {
    const restaurar = [];
    const setIntervalOriginal = global.setInterval;
    const clearIntervalOriginal = global.clearInterval;
    const erroOriginal = console.error;
    const schemaTeste = process.env.INVENTARIO_TEST_SCHEMA;
    const logs = [];
    const rejeicoes = [];
    const rejeicao = (erro) => rejeicoes.push(erro);
    let agendado, listagens = 0, resolverListagem, schemaAtual;
    let falhaNoEsquema = true;
    const processados = [];
    process.on("unhandledRejection", rejeicao);
    try {
        delete process.env.INVENTARIO_TEST_SCHEMA;
        console.error = (...partes) => logs.push(partes.map(String).join(" "));
        global.setInterval = (fn, intervalo) => {
            assert.equal(intervalo, tipo === "imagens" ? 30000 : 60000);
            agendado = fn;
            return { unref() {} };
        };
        global.clearInterval = () => {};
        const unidades = {
            async schemasAtivos() {
                listagens++;
                if (listagens === 1) {
                    throw Object.assign(new Error("senha=NAO_REGISTRAR"), { code: "ECONNRESET" });
                }
                if (listagens === 4) return new Promise((resolver) => { resolverListagem = resolver; });
                return ["unidade_2", "unidade_3"];
            }
        };
        const contexto = {
            async executar(schema, operacao) {
                if (schema === "unidade_2" && falhaNoEsquema) {
                    falhaNoEsquema = false;
                    throw Object.assign(new Error("senha=NAO_REGISTRAR"), { code: "57P01" });
                }
                schemaAtual = schema;
                try { return await operacao(); }
                finally { schemaAtual = undefined; }
            }
        };
        restaurar.push(substituir("../models/unidades.model", unidades));
        restaurar.push(substituir("../database/contexto-unidade", contexto));
        restaurar.push(substituir("../database/transacao", {
            executar: async (operacao) => operacao({})
        }));
        if (tipo === "imagens") {
            restaurar.push(substituir("../database/connection", {
                query: async () => {
                    processados.push(schemaAtual);
                    return { rows: [] };
                }
            }));
        } else {
            restaurar.push(substituir("../models/lixeira.model", {
                expirados: async () => { processados.push(schemaAtual); return []; },
                listar() {}, listarLog() {}
            }));
            restaurar.push(substituir("../models/historico.model", { registrar() {} }));
            restaurar.push(substituir("../services/imagens.service", { agendar() {}, tentarLimpeza() {} }));
        }
        const caminhoServico = require.resolve("../services/" + tipo + ".service");
        delete require.cache[caminhoServico];
        const parar = require(caminhoServico).iniciarWorker();
        try {
            await ate(() => logs.some((linha) => linha.includes("ECONNRESET")));
            assert.equal(listagens, 1);
            agendado();
            await ate(() => processados.includes("unidade_3"));
            assert.deepEqual(processados, ["unidade_3"]);
            agendado();
            await ate(() => processados.length === 3);
            assert.deepEqual(processados, ["unidade_3", "unidade_2", "unidade_3"]);
            agendado();
            await ate(() => Boolean(resolverListagem));
            agendado();
            assert.equal(listagens, 4, "Tentativas sobrepostas");
            resolverListagem(["unidade_2", "unidade_3"]);
            await ate(() => processados.length === 5);
            assert.deepEqual(rejeicoes, []);
            assert.ok(logs.some((linha) => linha.includes("57P01")));
            assert.ok(logs.every((linha) => !linha.includes("NAO_REGISTRAR")));
        } finally {
            parar();
            delete require.cache[caminhoServico];
        }
        return { tipo, listagens, processados: processados.length };
    } finally {
        while (restaurar.length) restaurar.pop()();
        global.setInterval = setIntervalOriginal;
        global.clearInterval = clearIntervalOriginal;
        console.error = erroOriginal;
        process.removeListener("unhandledRejection", rejeicao);
        if (schemaTeste === undefined) delete process.env.INVENTARIO_TEST_SCHEMA;
        else process.env.INVENTARIO_TEST_SCHEMA = schemaTeste;
    }
}
async function testarPool() {
    const pool = require("../database/connection");
    const erroOriginal = console.error;
    const logs = [];
    try {
        console.error = (...partes) => logs.push(partes.map(String).join(" "));
        pool.emit("error", Object.assign(new Error("senha=NAO_REGISTRAR"), { code: "57P01" }));
        assert.ok(logs.some((linha) => linha.includes("57P01")));
        assert.ok(logs.every((linha) => !linha.includes("NAO_REGISTRAR")));
    } finally {
        console.error = erroOriginal;
        await pool.end();
    }
}
(async () => {
    const resultados = [];
    resultados.push(await exercitarWorker("imagens"));
    resultados.push(await exercitarWorker("lixeira"));
    await testarPool();
    console.log(JSON.stringify({ resultados, erroPoolOcioso: "tratado", rejeicoesNaoTratadas: 0 }));
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
