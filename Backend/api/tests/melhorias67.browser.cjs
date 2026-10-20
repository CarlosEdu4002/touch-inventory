const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
    if(process.env.UI_BASE!=='http://127.0.0.1:3307') throw new Error('Use somente o servidor descartável na porta 3307');
    const base=process.env.UI_BASE, fixture=JSON.parse(await fs.readFile(process.env.UI_FIXTURE_PATH,'utf8'));
    const output=path.resolve(__dirname,'../output/melhorias67');await fs.mkdir(output,{recursive:true});
    const webBase=base.replace('127.0.0.1','inventario-http.test');
    const browser=await chromium.launch({channel:'msedge',headless:true,args:['--host-resolver-rules=MAP inventario-http.test 127.0.0.1','--no-proxy-server']});
    try {
        for(const [nome,viewport] of [['desktop',{width:1365,height:900}],['mobile',{width:390,height:844}]]) {
            const context=await browser.newContext({viewport});
            await context.addCookies([{name:'inventario_sessao',value:fixture.token,url:base}]);
            await context.addCookies([{name:'inventario_sessao',value:fixture.token,url:webBase}]);
            const page=await context.newPage(), outra=await context.newPage(), erros=[];
            for(const p of [page,outra]) p.on('pageerror',e=>erros.push(e.message));
            const patrimonio=`UI-${nome.toUpperCase()}`;
            for(const p of [page,outra]) {
                await p.goto(`${webBase}/exibeAtivos.html?tipo=${fixture.tipoId}`);
                await p.locator('#tabela tr').filter({hasText:patrimonio}).click();
                await p.locator('#btnEditar').click();await p.locator('#modal:not(.oculto)').waitFor();
            }
            await page.locator('#formModal button[type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});
            const resposta=outra.waitForResponse(r=>r.request().method()==='PUT' && r.url().includes('/api/ativos/'));
            await outra.locator('#formModal button[type=submit]').click();assert.equal((await resposta).status(),409);
            assert.equal(await outra.locator('#modal').isVisible(),true);
            assert.equal(await outra.locator('#campo-patrimonio').inputValue(),patrimonio);
            await outra.screenshot({path:path.join(output,`${nome}-conflito.png`),fullPage:true});
            await page.goto(`${webBase}/checklists.html`);
            assert.equal(await page.evaluate(()=>isSecureContext),false);
            assert.equal(await page.evaluate(()=>typeof crypto.randomUUID),'undefined');
            await page.locator('#listaChecklists tr').filter({hasText:patrimonio}).getByRole('button',{name:'Realizar'}).click();
            await page.locator('#dialogChecklist').waitFor();
            assert.match(await page.locator('#detalheChecklist').innerText(),/ocorrência.*versão.*vencimento original/);
            // Uma outra pessoa publica novo modelo depois da abertura.
            const tipo=await (await context.request.get(`${base}/api/tipos/${fixture.tipoId}`)).json();
            const atualizado=await context.request.put(`${base}/api/tipos/${fixture.tipoId}`,{data:{...tipo,checklist_itens:['Nova pergunta publicada']}});
            assert.equal(atualizado.status(),200);
            const itens=page.locator('#itensChecklist .item');
            for(let i=0;i<await itens.count();i++) await itens.nth(i).locator('input[value=conforme]').check();
            await page.locator('#observacaoChecklist').fill('Conferência preservada no modelo aberto.');
            await page.screenshot({path:path.join(output,`${nome}-checklist.png`),fullPage:true});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
            const envio=page.waitForResponse(r=>r.url().endsWith('/executar'));
            await page.locator('#formChecklist button[type=submit]').click();assert.equal((await envio).status(),201);
            await page.locator('#dialogChecklist').waitFor({state:'hidden'});
            // Formulário de transferência aberto antes de remover outro integrante.
            const membros=[];
            const definicao=await (await context.request.get(`${base}/api/tipos/${fixture.tipoId}`)).json();
            assert.equal((await context.request.put(`${base}/api/tipos/${fixture.tipoId}`,{data:{...definicao,permite_vinculo:true}})).status(),200);
            const principal=await (await context.request.get(`${base}/api/${fixture.tipoId}/${patrimonio}`)).json();
            membros.push(principal);
            for(const sufixo of ['B','C']) {
                const cadastro=await context.request.post(`${base}/api/${fixture.tipoId}`,{data:{patrimonio:`${patrimonio}-${sufixo}`,setor_id:principal.setor_id,tipo_revisao:(await (await context.request.get(`${base}/api/tipos/${fixture.tipoId}`)).json()).revisao}});
                assert.equal(cadastro.status(),201);
                membros.push(await (await context.request.get(`${base}/api/${fixture.tipoId}/${patrimonio}-${sufixo}`)).json());
            }
            const grupo=await context.request.post(`${base}/api/vinculos`,{data:{nome:`Trio ${nome}`,ativo_ids:membros.map(m=>m.id),revisoes:Object.fromEntries(membros.map(m=>[m.id,m.revisao]))}});
            assert.equal(grupo.status(),201);const g=await grupo.json();
            await page.goto(`${webBase}/exibeAtivos.html?tipo=${fixture.tipoId}`);
            await page.locator('#tabela tr').filter({hasText:patrimonio}).filter({hasNotText:`${patrimonio}-`}).click();
            await page.locator('#btnTransferir').click();await page.locator('#modalTransferencia:not(.oculto)').waitFor();
            const aberto=await (await context.request.get(`${base}/api/${fixture.tipoId}/${patrimonio}`)).json();
            const remocao=await context.request.delete(`${base}/api/vinculos/${g.id}/membros/${membros[1].id}`,{data:{revisao:aberto.grupo_esperado.revisao}});
            assert.equal(remocao.status(),200);
            const setores=await (await context.request.get(`${base}/api/setores`)).json();
            await page.locator('#setorDestino').selectOption(String(setores.find(s=>s.id!==principal.setor_id).id));
            const transferencia=page.waitForResponse(r=>r.url().endsWith('/transferir'));
            await page.locator('#formTransferencia button[type=submit]').click();assert.equal((await transferencia).status(),409);
            assert.equal(await page.locator('#modalTransferencia').isVisible(),true);
            assert.deepEqual(erros,[]);
            await context.close();console.log(`PASSOU navegador ${nome}: conflito preserva formulário; ocorrência/modelo/vencimento; envio com modelo antigo; sem transbordamento.`);
        }
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
