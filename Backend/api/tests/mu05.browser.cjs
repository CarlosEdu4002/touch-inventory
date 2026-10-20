const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");

const base = process.env.MU05_UI_BASE;
if (!process.env.MU05_TEST_PASSWORD) throw new Error("Informe a senha fictícia da fixture por variável de ambiente");
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) {
    throw new Error("MU-05 navegador exige servidor local descartável");
}
const urlA = `${base}/ativo.html?unidade=1&ativo=4`;
const urlB = `${base}/ativo.html?unidade=2&ativo=3`;
async function login(page, nome = "admin_mu05") {
    await page.locator("#areaLogin:not(.oculto)").waitFor();
    await page.locator("#login").fill(nome);
    await page.locator("#senha").fill(process.env.MU05_TEST_PASSWORD);
    await page.locator("#formLogin button[type=submit]").click();
    await page.waitForURL("**/unidades.html?retorno=*");
}
async function conferirLargura(page) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
}
(async () => {
    const navegador = await chromium.launch({ channel: "msedge", headless: true });
    const output = path.resolve(__dirname, "../output/mu05");
    await fs.mkdir(output, { recursive: true });
    try {
        for (const [nome, viewport] of [["desktop", { width: 1365, height: 900 }], ["celular", { width: 390, height: 844 }]]) {
            const contexto = await navegador.newContext({ viewport });
            const page = await contexto.newPage();
            const erros = []; page.on("pageerror", erro => erros.push(erro.message));
            await page.goto(urlA);
            await page.waitForURL("**/login.html?retorno=*");
            await login(page);
            await page.getByText("Esta etiqueta pertence à unidade Unidade A").waitFor();
            assert.equal(await page.locator(".cartao").count(), 1);
            await conferirLargura(page);
            await page.screenshot({ path: path.join(output, `${nome}-selecao.png`), fullPage: true });
            await page.locator(".cartao .entrar").click();
            await page.waitForURL(urlA);
            await page.getByText("PTN-001").first().waitFor();
            await conferirLargura(page);
            await page.screenshot({ path: path.join(output, `${nome}-detalhe.png`), fullPage: true });
            await page.goto(`${base}/unidades.html`);
            await page.locator(".cartao").filter({ hasText: "Unidade B" }).locator(".entrar").click();
            await page.waitForURL("**/index.html");
            await page.goto(urlA);
            await page.waitForURL("**/unidades.html?retorno=*");
            await page.getByText("Esta etiqueta pertence à unidade Unidade A").waitFor();
            assert.equal(await page.locator(".cartao").count(), 1);
            await page.locator(".cartao .entrar").click();
            await page.waitForURL(urlA);
            await page.goto(`${base}/ativo.html?tipo=1&id=PTN-001`);
            await page.getByText("Etiqueta inválida. Grave uma nova URL").waitFor();
            await page.goto(`${base}/exibeAtivos.html?tipo=1`);
            await page.locator("#tabela").waitFor();
            const leitura = await page.evaluate(async () => resolverLeitura("/ativo.html?unidade=1&ativo=4"));
            assert.equal(leitura.ativo.id, 4);
            assert.equal(await page.evaluate(() => { try { interpretarLeitura("/ativo.html?tipo=1&id=PTN-001"); return false; } catch { return true; } }), true);
            assert.equal(await page.evaluate(async () => { try { await resolverLeitura("/ativo.html?unidade=2&ativo=3"); return false; } catch { return true; } }), true);
            assert.deepEqual(erros, []);
            await contexto.close();
            console.log(`PASSOU: ${nome} — login, retorno, troca de unidade, detalhe e etiqueta antiga rejeitada`);
        }
        const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
        const page = await contexto.newPage();
        await page.goto(urlB);
        await page.waitForURL("**/login.html?retorno=*");
        await login(page, "usuario_mu05");
        await page.getByText("Esta etiqueta aponta para uma unidade indisponível").waitFor();
        assert.equal(await page.locator(".cartao").count(), 0);
        assert.equal(await page.locator("#selecaoGeral").isVisible(), true);
        await conferirLargura(page);
        console.log("PASSOU: usuário sem acesso não visualiza a unidade da etiqueta");
        await contexto.close();
    } finally { await navegador.close(); }
})().catch(erro => { console.error(erro); process.exitCode = 1; });
