const assert = require("node:assert/strict");
const { chromium } = require("playwright");

module.exports = async ({ base, ta, imagem, arquivoPdf, setorB }) => {
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
        const context = await browser.newContext(); const page = await context.newPage();
        const antigo = `/ativo.html?tipo=${ta.id}&id=SEC-A`;
        await page.goto(base + antigo);
        await page.waitForURL("**/login.html?retorno=**");
        assert.equal(new URL(page.url()).searchParams.get("retorno"), antigo);
        await page.locator("#login").fill("security_a");
        await page.locator("#senha").fill("TesteSeguro123!");
        await page.locator("#formLogin button[type=submit]").click();
        await page.waitForURL(base + antigo);
        await page.waitForFunction(() => document.querySelector("#conteudo").textContent.includes("SEC-A"));
        assert.ok(!(await page.locator("#conteudo").innerText()).includes("VALOR_PRIVADO_REGRESSAO"));
        await page.waitForFunction(() => document.querySelector(".imagem-ativo")?.naturalWidth > 0);
        // PDF.js recebe a URL protegida e envia o cookie da mesma aplicação.
        await page.addScriptTag({ url: base + "/vendor/pdfjs/pdf.min.js" });
        const paginas = await page.evaluate(async url => {
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
            const pdf = await pdfjsLib.getDocument({ url, isEvalSupported: false }).promise;
            const primeira = await pdf.getPage(1);
            const canvas = document.createElement("canvas"); const viewport = primeira.getViewport({ scale: 1 });
            canvas.width = viewport.width; canvas.height = viewport.height;
            await primeira.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
            await pdf.destroy(); return 1;
        }, base + `/uploads/plantas/${arquivoPdf}`);
        assert.equal(paginas, 1);
        const corpo = await page.evaluate(async url => (await fetch(url)).status, `/uploads/ativos/${imagem}`);
        assert.equal(corpo, 200);
        await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
        await page.reload(); await page.waitForURL("**/login.html?retorno=**");
        for (const retorno of ["//example.invalid/", "/\\example.invalid/", "/%2f%2fexample.invalid/", "https://example.invalid/", "/\n/example.invalid/"]) {
            await page.goto(base + "/login.html?retorno=" + encodeURIComponent(retorno));
            await page.locator("#login").fill("security_a"); await page.locator("#senha").fill("TesteSeguro123!");
            await page.locator("#formLogin button[type=submit]").click();
            await page.waitForURL(base + "/index.html");
            assert.equal(new URL(page.url()).origin, base);
            await page.evaluate(async () => { await fetch("/api/auth/logout", { method: "POST" }); });
        }
        const outro = await browser.newContext();
        await outro.addCookies([{ name: "inventario_sessao", value: setorB.split("=")[1], url: base }]);
        const paginaB = await outro.newPage(); await paginaB.goto(base + antigo);
        await paginaB.waitForFunction(() => document.querySelector(".erro")?.textContent === "Ativo não encontrado");
        assert.equal(await paginaB.locator(".imagem-ativo").count(), 0);
        await outro.close(); await context.close();
        console.log("PASSOU: URL NFC antiga → login → retorno, bloqueio entre setores, imagem e PDF.js no Edge.");
    } finally { await browser.close(); }
};
