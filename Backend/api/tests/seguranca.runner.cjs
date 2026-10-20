// A suíte usa sempre um banco PostgreSQL exclusivo e descartável, sem bypass de unidade.
const { Pool } = require("pg");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

async function main() {
    if (process.env.TEST_PG_ISOLADO !== "1" || process.env.TEST_SCHEMA_ISOLADO || process.env.INVENTARIO_TEST_SCHEMA) {
        throw new Error("Defina TEST_PG_ISOLADO=1 e use PostgreSQL exclusivo sem bypass de multiunidades.");
    }
    const config = {
        host: "127.0.0.1", port: Number(process.env.TEST_PG_PORT || 55439),
        user: process.env.TEST_PG_USER || "inventario_test",
        password: process.env.TEST_PG_PASSWORD || "", database: "postgres"
    };
    const nome = `inventario_security_test_${crypto.randomBytes(8).toString("hex")}`;
    const admin = new Pool(config);
    let pool, servidor;
    let encerrando=false;
    let criado = false;
    try {
        await admin.query(`CREATE DATABASE ${nome}`);
        criado = true;
        Object.assign(process.env, {
            DB_HOST: config.host, DB_PORT: String(config.port), DB_USER: config.user,
            DB_PASSWORD: config.password, DB_NAME: nome, NODE_ENV: "test"
        });
        pool = require("../database/connection");
        pool.on("error",erro=>{if(!encerrando || erro.code!=="57P01") throw erro;});
        await require("../database/init")();
        await require("./unidade.fixture.cjs").prepararPrimeiraUnidade(pool);
        const { app } = require("../server");
        servidor = await new Promise(resolve => {
            const s = app.listen(process.env.TEST_UI_SERVER==="1" ? 3000 : 0, process.env.TEST_UI_SERVER==="1" ? "0.0.0.0" : "127.0.0.1", () => resolve(s));
        });
        if (process.argv.includes("--melhorias67") || process.argv.includes("--suite")) await require("./melhorias67.integration.cjs")(pool);
        if (process.argv.includes("--lixeira") || process.argv.includes("--suite")) {
            await require("./lixeira.integration.cjs")(pool, `http://127.0.0.1:${servidor.address().port}`);
        }
        if (process.argv.includes("--campos") || process.argv.includes("--suite")) {
            await require("./campos.integration.cjs")(pool, `http://127.0.0.1:${servidor.address().port}`);
        }
        if (process.argv.includes("--consistencia") || process.argv.includes("--suite")) {
            await require("./consistencia.integration.cjs")(pool);
        }
        if (!process.argv.includes("--melhorias67") && !process.argv.includes("--consistencia") && !process.argv.includes("--campos") && !process.argv.includes("--lixeira")) {
            await require("./seguranca.integration.cjs")(pool, `http://127.0.0.1:${servidor.address().port}`);
        }
        if (process.argv.includes("--suite")) {
            const comandos = [
                ["tests/mu03.workers.cjs"],
                ["tests/emprestimos.integration.js"], ["tests/mapas.integration.js"],
                ["tests/checklists-vinculos.integration.js"],
                ["--test", "tests/checklists-imagens.unit.js", "tests/checklists-imagens.integration.js"],
                ["--test", "tests/campos.unit.cjs", "tests/mapas-pdf.unit.js", "tests/exportacoes.unit.js", "tests/exportacoes.integration.js"]
            ];
            for (const args of comandos) await new Promise((resolve, reject) => {
                const filho = spawn(process.execPath, args, { cwd: path.resolve(__dirname, ".."), env: process.env, stdio: "inherit" });
                filho.on("error", reject);
                filho.on("exit", code => code === 0 ? resolve() : reject(new Error(`Falha em ${args.join(" ")}: ${code}`)));
            });
        }
        if (process.argv.includes("--suite")) {
            await require("./mu06.integration.cjs")(pool, `http://127.0.0.1:${servidor.address().port}`);
        }
        console.log("PASSOU: regressões de segurança e verificações solicitadas.");
        if (process.env.TEST_UI_SERVER==="1") {
            const fixture=await require("./lixeira.browser-fixture.cjs")(pool);
            await require("node:fs/promises").writeFile("/tmp/lixeira-ui.json",JSON.stringify(fixture),{mode:0o600});
            console.log("UI_PRONTA: servidor isolado para validação de navegador.");
            await new Promise(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});
        }
    } finally {
        encerrando=true;
        if (servidor) await new Promise(resolve => servidor.close(resolve));
        if (pool) await pool.end();
        if (criado) await admin.query(`DROP DATABASE ${nome} WITH (FORCE)`);
        await admin.end();
    }
}
main().catch(erro => { console.error(erro); process.exitCode = 1; });
