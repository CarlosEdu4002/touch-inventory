// Navegador real contra o servidor descartável do runner; nunca aponta para o laboratório operacional.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {chromium}=require("playwright");

(async()=>{
    if (!process.env.UI_BASE || !process.env.UI_FIXTURE_PATH) throw new Error("Informe o servidor isolado e a fixture temporária");
    const base=process.env.UI_BASE;
    const fixture=JSON.parse(await fs.readFile(process.env.UI_FIXTURE_PATH,"utf8"));
    const output=path.resolve(__dirname,"../output/lixeira");await fs.mkdir(output,{recursive:true});
    const browser=await chromium.launch({channel:"msedge",headless:true});
    try {
        for(const [nome,viewport] of [["desktop",{width:1365,height:900}],["mobile",{width:390,height:844}]]) {
            const context=await browser.newContext({viewport});
            await context.addCookies([{name:"inventario_sessao",value:fixture.token,url:base}]);
            const page=await context.newPage(); const erros=[];page.on("pageerror",erro=>erros.push(erro.message));
            const patrimonio=`UI-${nome.toUpperCase()}`;
            await page.goto(`${base}/exibeAtivos.html?tipo=${fixture.tipoId}`);
            const linha=page.locator("#tabela tr").filter({hasText:patrimonio});await linha.waitFor();
            await linha.getByRole("button",{name:`Abrir detalhes do ativo ${patrimonio}`}).click();
            await page.waitForURL("**/ativo.html?ativo=*");
            const id=new URL(page.url()).searchParams.get("ativo");
            await page.waitForFunction(p=>document.querySelector("#conteudo").textContent.includes(p),patrimonio);
            // Link antigo permanece compatível antes da exclusão.
            await page.goto(`${base}/ativo.html?tipo=${fixture.tipoId}&id=${patrimonio}`);
            await page.waitForFunction(p=>document.querySelector("#conteudo").textContent.includes(p),patrimonio);
            await page.goto(`${base}/exibeAtivos.html?tipo=${fixture.tipoId}`);
            const leitura=await page.evaluate(async id=>resolverLeitura(`ativo.html?ativo=${id}`),id);
            assert.equal(leitura.patrimonio,patrimonio);assert.equal(leitura.ativoId,id);
            const legada=await page.evaluate(p=>interpretarLeitura(`ativo.html?id=${p}&tipo=legado`),patrimonio);
            assert.equal(legada.patrimonio,patrimonio);
            await page.locator("#tabela tr").filter({hasText:patrimonio}).click();
            await page.locator("#btnEditar").click();await page.locator("#modal:not(.oculto)").waitFor();
            assert.equal(await page.locator("#campo-patrimonio").isDisabled(),true);
            await page.locator("#formModal button[type=submit]").click();await page.locator("#modal").waitFor({state:"hidden"});
            await page.locator("#tabela tr").filter({hasText:patrimonio}).click();
            await page.locator("#btnRemover").click();
            assert.match(await page.locator("#textoConfirmacao").innerText(),/30 dias/);
            assert.match(await page.locator("#textoConfirmacao").innerText(),/etiqueta antiga/);
            await page.screenshot({path:path.join(output,`${nome}-confirmacao.png`),fullPage:true});
            await page.locator("#btnConfirmarRemocao").click();
            await page.waitForFunction(p=>![...document.querySelectorAll("#tabela tr")].some(tr=>tr.textContent.includes(p)),patrimonio);
            assert.equal(await page.evaluate(async id=>{try{await resolverLeitura(`ativo.html?ativo=${id}`);return false;}catch{return true;}},id),true);
            await page.goto(`${base}/lixeira.html`);
            const excluido=page.locator(`#ativosLixeira tr[data-ativo-id="${id}"]`);await excluido.waitFor();
            await excluido.getByRole("button",{name:"Histórico",exact:true}).click();
            await page.waitForFunction(()=>document.querySelector(".historico-lixeira")?.textContent.includes("Exclusão"));
            assert.equal(await excluido.getByRole("button",{name:"Restaurar",exact:true}).isEnabled(),true);
            assert.equal(await page.getByRole("button",{name:/forçar/i}).count(),0);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,"Página não deve transbordar horizontalmente");
            await page.screenshot({path:path.join(output,`${nome}-lixeira.png`),fullPage:true});
            page.once("dialog",dialog=>dialog.accept());
            await excluido.getByRole("button",{name:"Restaurar",exact:true}).click();
            await page.waitForFunction(p=>![...document.querySelectorAll("#ativosLixeira tr")].some(tr=>tr.textContent.includes(p)),patrimonio);
            assert.match(await page.locator("#logLixeira").innerText(),/Restauração/);
            await page.goto(`${base}/ativo.html?ativo=${id}`);
            await page.waitForFunction(p=>document.querySelector("#conteudo").textContent.includes(p),patrimonio);
            assert.deepEqual(erros,[]);
            await context.close();console.log(`PASSOU: ${nome} — links ID/legado, edição, aviso explícito, exclusão, lixeira, histórico e restauração.`);
        }
    } finally {await browser.close();}
})().catch(erro=>{console.error(erro);process.exitCode=1;});
