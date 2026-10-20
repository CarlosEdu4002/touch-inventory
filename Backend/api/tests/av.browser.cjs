const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

let base = "http://127.0.0.1:55450";
const runId = Date.now().toString(36);
const output = path.resolve(__dirname, "../output/av");
const fixturePath = path.resolve(__dirname, "../output/rv/fixture.json");

async function pagina(browser, token, viewport) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "inventario_sessao", value: token, url: base }]);
    const page = await context.newPage();
    const erros = [];
    page.on("pageerror", erro => erros.push(erro.message));
    await page.goto(base + "/index.html");
    await page.waitForFunction(() => Boolean(contextoPagina));
    return { context, page, erros };
}
async function pedido(page, url, method = "GET", body) {
    return page.evaluate(async ({ url, method, body }) => {
        const resposta = await fetch(url, {
            method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
    }, { url, method, body });
}
async function aprovado(page, url, method, body, status = 201) {
    const resultado = await pedido(page, url, method, body);
    assert.equal(resultado.status, status, JSON.stringify(resultado));
    return resultado.dados;
}
async function conferirTela(page, nome, largura, erros) {
    assert.deepEqual(erros, [], "sem erro JavaScript no navegador");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
        "sem rolagem horizontal");
    await page.screenshot({ path: path.join(output, `${nome}-${largura}.png`), fullPage: true });
}
function datasFuturas() {
    const hoje = new Date();
    return [7, 14, 21].map(dias => {
        const data = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + dias));
        return data.toISOString().slice(0, 10);
    });
}
async function av01(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    const sufixo = `${base.includes("auditoria") ? "http" : "local"}-${viewport.width}-${runId}`;
    try {
        if (base.includes("auditoria")) assert.equal(await page.evaluate(() => isSecureContext), false);
        const categoria = (await pedido(page, "/api/categorias")).dados.find(x => x.setor_id === fixture.setores.a);
        assert.ok(categoria);
        const datas = datasFuturas();
        const configuracao = {
            categoria_id: categoria.id, nome: `Checklist AV01 ${sufixo}`,
            permite_checklist: true, checklist_recorrencia: "personalizado",
            checklist_datas_personalizadas: datas, checklist_modo: "calendario",
            checklist_itens: ["Proteção antiga", "Lubrificação antiga"], checklist_alerta_dias: 15
        };
        const tipo = await aprovado(page, "/api/tipos", "POST", configuracao);
        const revisaoTipo = (await pedido(page, "/api/tipos/" + tipo.id)).dados.revisao;
        const ativos = {};
        for (const chave of ["modelo", "reenvio", "conflito"]) {
            const patrimonio = `AV01-${chave}-${sufixo}`;
            ativos[chave] = { patrimonio, ...(await aprovado(page, "/api/" + tipo.id, "POST", {
                patrimonio, setor_id: fixture.setores.a, status: "disponivel", tipo_revisao: revisaoTipo
            })) };
        }
        const detalhes = {};
        for (const [chave, ativo] of Object.entries(ativos)) {
            detalhes[chave] = (await pedido(page, `/api/checklists/${tipo.id}/${ativo.patrimonio}`)).dados;
            assert.deepEqual(detalhes[chave].perguntas.map(x => x.texto), configuracao.checklist_itens);
        }
        await aprovado(segundo.page, "/api/tipos/" + tipo.id, "PUT", {
            ...configuracao, revisao: revisaoTipo,
            checklist_itens: ["Proteção nova", "Lubrificação nova"]
        }, 200);
        await page.goto(base + "/checklists.html");
        const abrir = async (paginaAtual, ativo) => {
            await paginaAtual.locator("#listaChecklists tr").filter({ hasText: ativo.patrimonio })
                .getByRole("button", { name: "Realizar" }).click();
            await paginaAtual.locator("#dialogChecklist").waitFor({ state: "visible" });
        };
        const responder = async (paginaAtual, respostas, observacao = "") => {
            for (let i = 0; i < respostas.length; i++) {
                await paginaAtual.locator(`input[name="resposta-${i}"][value="${respostas[i]}"]`).check();
            }
            await paginaAtual.locator("#observacaoChecklist").fill(observacao);
        };
        const registrar = async paginaAtual => {
            const espera = paginaAtual.waitForResponse(r => r.url().endsWith("/executar") && r.request().method() === "POST");
            await paginaAtual.locator("#registrarChecklist").click();
            return espera;
        };
        await abrir(page, ativos.modelo);
        assert.deepEqual(await page.locator("#itensChecklist .item p").allTextContents(), configuracao.checklist_itens);
        await responder(page, ["conforme", "nao_aplica"]);
        const normal = await registrar(page);
        assert.equal(normal.status(), 201);
        const corpo = normal.request().postDataJSON();
        assert.equal(corpo.ocorrencia_id, detalhes.modelo.ocorrencia_id);
        assert.equal(corpo.modelo_id, detalhes.modelo.modelo_id);
        assert.equal(Object.hasOwn(corpo, "chave_reenvio"), false);
        assert.deepEqual(corpo.respostas.map(x => x.pergunta_id), detalhes.modelo.perguntas.map(x => x.id));
        const apos = (await pedido(page, `/api/checklists/${tipo.id}/${ativos.modelo.patrimonio}`)).dados;
        assert.equal(String(apos.checklist_proxima_data).slice(0, 10), datas[1]);
        assert.deepEqual(apos.historico[0].respostas.map(x => x.item), configuracao.checklist_itens);
        const autorizado = await pagina(browser, fixture.tokensSetor.a, viewport);
        const outroSetor = await pagina(browser, fixture.tokensSetor.b, viewport);
        const outraUnidade = await pagina(browser, fixture.tokenUnidadeB, viewport);
        try {
            const url = `/api/checklists/${tipo.id}/${ativos.modelo.patrimonio}/executar`;
            const estadoAntes = apos.historico[0];
            const acesso = await pedido(autorizado.page, url, "POST", corpo);
            assert.equal(acesso.status, 409);
            assert.equal(acesso.dados.erro, "Consulte os registros respondidos na data solicitada!");
            for (const semAcesso of [outroSetor.page, outraUnidade.page]) {
                const detalheNegado = await pedido(semAcesso, `/api/checklists/${tipo.id}/${ativos.modelo.patrimonio}`);
                assert.notEqual(detalheNegado.status, 200);
                const respostaNegada = await pedido(semAcesso, url, "POST", corpo);
                assert.notEqual(respostaNegada.status, 201);
                assert.notEqual(respostaNegada.dados.erro, "Consulte os registros respondidos na data solicitada!");
            }
            const depois = (await pedido(page, `/api/checklists/${tipo.id}/${ativos.modelo.patrimonio}`)).dados;
            assert.deepEqual(depois.historico[0], estadoAntes);
        } finally { await autorizado.context.close(); await outroSetor.context.close(); await outraUnidade.context.close(); }
        await page.locator("#listaChecklists tr").filter({ hasText: ativos.modelo.patrimonio }).waitFor();
        await abrir(page, ativos.modelo);
        assert.deepEqual(await page.locator("#itensChecklist .item p").allTextContents(),
            ["Proteção nova", "Lubrificação nova"]);
        assert.match(await page.locator("#historicoChecklist").innerText(), /Proteção antiga/);
        await responder(page, ["nao_conforme", "conforme"]);
        const semObservacao = await registrar(page);
        assert.equal(semObservacao.status(), 400);
        assert.equal(await page.locator("input[name='resposta-0'][value='nao_conforme']").isChecked(), true);
        await page.locator("#observacaoChecklist").fill("Falha de proteção encontrada");
        const naoConforme = await registrar(page);
        assert.equal(naoConforme.status(), 201);
        assert.equal(naoConforme.request().postDataJSON().observacao, "Falha de proteção encontrada");
        const aposNaoConforme = (await pedido(page, `/api/checklists/${tipo.id}/${ativos.modelo.patrimonio}`)).dados;
        assert.equal(String(aposNaoConforme.checklist_proxima_data).slice(0, 10), datas[2]);

        await abrir(page, ativos.reenvio);
        await responder(page, ["conforme", "conforme"], "Resposta simulada como perdida");
        let gravado;
        if (!base.includes("auditoria")) await page.route("**/executar", async route => {
            const resposta = await route.fetch();
            gravado = await resposta.json();
            assert.equal(resposta.status(), 201);
            await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ erro: "Resposta perdida" }) });
        }, { times: 1 });
        const perdido = await registrar(page);
        assert.equal(perdido.status(), base.includes("auditoria") ? 201 : 503);
        if (!base.includes("auditoria")) assert.equal(await page.locator("#observacaoChecklist").inputValue(), "Resposta simulada como perdida");
        const reenviado = base.includes("auditoria")
            ? await pedido(page, `/api/checklists/${tipo.id}/${ativos.reenvio.patrimonio}/executar`, "POST", perdido.request().postDataJSON())
            : await registrar(page);
        assert.equal(base.includes("auditoria") ? reenviado.status : reenviado.status(), 409);
        if (!base.includes("auditoria")) {
            assert.deepEqual(reenviado.request().postDataJSON(), perdido.request().postDataJSON());
            assert.equal((await reenviado.json()).erro, "Consulte os registros respondidos na data solicitada!");
            assert.equal(await page.locator("#mensagemEstadoChecklist").innerText(), "Consulte os registros respondidos na data solicitada!");
            assert.equal(await page.locator("#estadoChecklist a").count(), 0);
            assert.equal(await page.locator("#registrarChecklist").isDisabled(), true);
        } else assert.equal(reenviado.dados.erro, "Consulte os registros respondidos na data solicitada!");
        const historicoReenvio = (await pedido(page, `/api/checklists/${tipo.id}/${ativos.reenvio.patrimonio}`)).dados.historico;
        assert.equal(historicoReenvio.length, 1);
        if (!base.includes("auditoria")) await page.locator("#fecharChecklist").click();

        await abrir(page, ativos.conflito);
        await responder(page, ["conforme", "conforme"], "Resposta antiga preservada");
        await segundo.page.goto(base + "/checklists.html");
        await abrir(segundo.page, ativos.conflito);
        await responder(segundo.page, ["conforme", "conforme"]);
        assert.equal((await registrar(segundo.page)).status(), 201);
        const conflito = await registrar(page);
        assert.equal(conflito.status(), 409);
        assert.equal(conflito.request().postDataJSON().ocorrencia_id, detalhes.conflito.ocorrencia_id);
        assert.equal(await page.locator("#observacaoChecklist").inputValue(), "Resposta antiga preservada");
        assert.equal(await page.locator("#mensagemEstadoChecklist").innerText(), "Consulte os registros respondidos na data solicitada!");
        assert.equal(await page.locator("#estadoChecklist a").count(), 0);
        assert.equal(await page.locator("#registrarChecklist").isDisabled(), true);
        assert.equal((await pedido(page, `/api/checklists/${tipo.id}/${ativos.conflito.patrimonio}`)).dados.historico.length, 1);
        await conferirTela(page, "av01", viewport.width, erros);
        assert.deepEqual(segundo.erros, []);
        console.log(`PASSOU AV-01 ${viewport.width}px: modelo congelado, recorrencia, nao conformidade, reenvio e concorrencia`);
    } finally { await segundo.context.close(); await context.close(); }
}

async function av02(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    const sufixo = `${viewport.width}-${runId}`;
    try {
        const categoria = (await pedido(page, "/api/categorias")).dados.find(x => x.setor_id === fixture.setores.a);
        const tipoBase = { categoria_id: categoria.id, nome: `AV02 tipo ${sufixo}` };
        const tipo = await aprovado(page, "/api/tipos", "POST", tipoBase);
        const tipoRemover = await aprovado(page, "/api/tipos", "POST", {
            categoria_id: categoria.id, nome: `AV02 remover ${sufixo}`
        });
        const campoBase = { tipo_ativo_id: tipo.id, nome: `nota_av02_${viewport.width}`,
            label: `Nota AV02 ${sufixo}`, tipo: "texto", obrigatorio: false,
            editavel: true, visivel: true, ordem: 1, opcoes: [] };
        const campo = await aprovado(page, "/api/campos", "POST", campoBase);
        const campoRemover = await aprovado(page, "/api/campos", "POST", {
            ...campoBase, tipo_ativo_id: tipoRemover.id, label: `Remover AV02 ${sufixo}`
        });
        await page.goto(base + "/administracao.html");
        const linhaTipo = id => page.locator("#listaTipos .item-lista").filter({ hasText: id });
        const linhaCampo = id => page.locator("#listaCampos .item-lista").filter({ hasText: id });
        await linhaTipo(tipoBase.nome).getByRole("button", { name: "Editar", exact: true }).click();
        const revisaoTipo = await page.evaluate(() => estado.tipoEmEdicao.revisao);
        await page.locator("#tipoNome").fill(tipoBase.nome + " editado");
        const editarTipo = page.waitForResponse(r => r.url().endsWith("/api/tipos/" + tipo.id) && r.request().method() === "PUT");
        await page.locator("#salvarTipo").click();
        const sucessoTipo = await editarTipo;
        assert.equal(sucessoTipo.status(), 200);
        assert.equal(sucessoTipo.request().postDataJSON().revisao, revisaoTipo);
        assert.equal((await pedido(page, "/api/tipos/" + tipo.id)).dados.nome, tipoBase.nome + " editado");

        await page.locator("#campoTipoAtivo").selectOption(String(tipo.id));
        await linhaCampo(campoBase.label).getByRole("button", { name: "Editar", exact: true }).click();
        const revisaoCampo = await page.evaluate(() => estado.campoEmEdicao.revisao);
        await page.locator("#campoLabel").fill(campoBase.label + " editado");
        const editarCampo = page.waitForResponse(r => r.url().endsWith("/api/campos/" + campo.id) && r.request().method() === "PUT");
        await page.locator("#salvarCampo").click();
        const sucessoCampo = await editarCampo;
        assert.equal(sucessoCampo.status(), 200);
        assert.equal(sucessoCampo.request().postDataJSON().revisao, revisaoCampo);
        assert.equal((await pedido(page, "/api/campos/" + campo.id)).dados.label, campoBase.label + " editado");

        await linhaTipo(tipoBase.nome + " editado").getByRole("button", { name: "Editar", exact: true }).click();
        await page.locator("#tipoNome").fill("Preenchimento antigo AV02");
        const tipoAtual = (await pedido(segundo.page, "/api/tipos/" + tipo.id)).dados;
        await aprovado(segundo.page, "/api/tipos/" + tipo.id, "PUT", {
            ...tipoAtual, nome: tipoAtual.nome + " concorrente"
        }, 200);
        const conflitoTipo = page.waitForResponse(r => r.url().endsWith("/api/tipos/" + tipo.id) && r.request().method() === "PUT");
        await page.locator("#salvarTipo").click();
        const respostaConflitoTipo = await conflitoTipo;
        assert.equal(respostaConflitoTipo.status(), 409);
        assert.equal(await page.locator("#tipoNome").inputValue(), "Preenchimento antigo AV02");
        await page.locator("#avisoRevisaoAlterada a").waitFor();
        await page.locator("#cancelarTipo").click();

        await linhaCampo(campoBase.label + " editado").getByRole("button", { name: "Editar", exact: true }).click();
        await page.locator("#campoLabel").fill("Campo antigo AV02");
        const campoAtual = (await pedido(segundo.page, "/api/campos/" + campo.id)).dados;
        await aprovado(segundo.page, "/api/campos/" + campo.id, "PUT", {
            ...campoAtual, label: campoAtual.label + " concorrente"
        }, 200);
        const conflitoCampo = page.waitForResponse(r => r.url().endsWith("/api/campos/" + campo.id) && r.request().method() === "PUT");
        await page.locator("#salvarCampo").click();
        assert.equal((await conflitoCampo).status(), 409);
        assert.equal(await page.locator("#campoLabel").inputValue(), "Campo antigo AV02");
        await page.locator("#cancelarCampo").click();

        await page.reload();
        await page.waitForFunction(() => Boolean(contextoPagina));
        await page.locator("#campoTipoAtivo").selectOption(String(tipoRemover.id));
        await linhaCampo(campoRemover.label).waitFor();
        const revisaoRemoverCampo = (await pedido(page, "/api/campos/" + campoRemover.id)).dados.revisao;
        page.once("dialog", dialog => dialog.accept());
        const removerCampo = page.waitForResponse(r => r.url().endsWith("/api/campos/" + campoRemover.id) && r.request().method() === "DELETE");
        await linhaCampo(campoRemover.label).getByRole("button", { name: "Remover", exact: true }).click();
        const respostaRemoverCampo = await removerCampo;
        assert.equal(respostaRemoverCampo.status(), 200);
        assert.deepEqual(respostaRemoverCampo.request().postDataJSON(), { revisao: revisaoRemoverCampo });
        assert.equal((await pedido(page, "/api/campos/" + campoRemover.id)).status, 404);

        await page.reload();
        await page.waitForFunction(() => Boolean(contextoPagina));
        const revisaoRemoverTipo = (await pedido(page, "/api/tipos/" + tipoRemover.id)).dados.revisao;
        page.once("dialog", dialog => dialog.accept());
        const removerTipo = page.waitForResponse(r => r.url().endsWith("/api/tipos/" + tipoRemover.id) && r.request().method() === "DELETE");
        await linhaTipo(tipoRemover.nome).getByRole("button", { name: "Remover", exact: true }).click();
        const respostaRemoverTipo = await removerTipo;
        assert.equal(respostaRemoverTipo.status(), 200);
        assert.deepEqual(respostaRemoverTipo.request().postDataJSON(), { revisao: revisaoRemoverTipo });
        assert.equal((await pedido(page, "/api/tipos/" + tipoRemover.id)).status, 404);

        const tipoExclusaoConcorrente = await aprovado(page, "/api/tipos", "POST", {
            categoria_id: categoria.id, nome: `AV02 exclusao concorrente ${sufixo}`
        });
        const campoExclusaoConcorrente = await aprovado(page, "/api/campos", "POST", {
            ...campoBase, tipo_ativo_id: tipoExclusaoConcorrente.id,
            label: `AV02 campo concorrente ${sufixo}`
        });
        await page.reload();
        await page.waitForFunction(() => Boolean(contextoPagina));
        await page.locator("#campoTipoAtivo").selectOption(String(tipoExclusaoConcorrente.id));
        const campoAntes = (await pedido(page, "/api/campos/" + campoExclusaoConcorrente.id)).dados;
        page.once("dialog", async dialog => {
            await aprovado(segundo.page, "/api/campos/" + campoAntes.id, "PUT", {
                ...campoAntes, label: campoAntes.label + " alterado"
            }, 200);
            await dialog.accept();
        });
        const excluirCampoAntigo = page.waitForResponse(r => r.url().endsWith("/api/campos/" + campoAntes.id) && r.request().method() === "DELETE");
        await linhaCampo(campoAntes.label).getByRole("button", { name: "Remover", exact: true }).click();
        const respostaExcluirCampoAntigo = await excluirCampoAntigo;
        assert.equal(respostaExcluirCampoAntigo.status(), 409);
        assert.equal(respostaExcluirCampoAntigo.request().postDataJSON().revisao, campoAntes.revisao);
        await page.locator("#avisoRevisaoAlterada a").waitFor();
        const tipoAntes = (await pedido(page, "/api/tipos/" + tipoExclusaoConcorrente.id)).dados;
        const revisaoMostrada = await page.evaluate(id => estado.tipos.find(t => t.id === id).revisao,
            tipoExclusaoConcorrente.id);
        page.once("dialog", async dialog => {
            await aprovado(segundo.page, "/api/tipos/" + tipoAntes.id, "PUT", {
                ...tipoAntes, nome: tipoAntes.nome + " alterado"
            }, 200);
            await dialog.accept();
        });
        const excluirTipoAntigo = page.waitForResponse(r => r.url().endsWith("/api/tipos/" + tipoAntes.id) && r.request().method() === "DELETE");
        await linhaTipo(tipoAntes.nome).getByRole("button", { name: "Remover", exact: true }).click();
        const respostaExcluirTipoAntigo = await excluirTipoAntigo;
        assert.equal(respostaExcluirTipoAntigo.status(), 409);
        assert.equal(respostaExcluirTipoAntigo.request().postDataJSON().revisao, revisaoMostrada);

        const patrimonio = `AV02-ATIVO-${sufixo}`;
        const tipoVigente = (await pedido(page, "/api/tipos/" + tipo.id)).dados;
        await aprovado(page, "/api/" + tipo.id, "POST", {
            patrimonio, setor_id: fixture.setores.a, status: "disponivel", tipo_revisao: tipoVigente.revisao
        });
        const ativo = (await pedido(page, "/api/" + tipo.id + "/" + patrimonio)).dados;
        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo.id);
        await page.locator("#tabela tr").filter({ hasText: patrimonio }).click();
        await page.locator("#btnEditar").click();
        await page.locator("#modal:not(.oculto)").waitFor();
        const campoParaInvalidar = (await pedido(segundo.page, "/api/campos/" + campo.id)).dados;
        await aprovado(segundo.page, "/api/campos/" + campo.id, "PUT", {
            ...campoParaInvalidar, label: campoParaInvalidar.label + " novamente"
        }, 200);
        const edicaoAntiga = page.waitForResponse(r => r.url().endsWith("/api/ativos/" + ativo.id) && r.request().method() === "PUT");
        await page.locator("#formModal button[type=submit]").click();
        assert.equal((await edicaoAntiga).status(), 409);
        assert.equal(await page.locator("#modal:not(.oculto)").count(), 1);
        await conferirTela(page, "av02", viewport.width, erros);
        console.log(`PASSOU AV-02 ${viewport.width}px: quatro botoes, conflitos e formulario antigo de ativo`);
    } finally { await segundo.context.close(); await context.close(); }
}

async function av03(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    const sufixo = `${viewport.width}-${runId}`;
    try {
        const tipo = fixture.tipos.desktop;
        const revisaoTipo = (await pedido(page, "/api/tipos/" + tipo)).dados.revisao;
        const ativos = [];
        for (let i = 0; i < 3; i++) {
            const patrimonio = `AV03-${i}-${sufixo}`;
            await aprovado(page, "/api/" + tipo, "POST", {
                patrimonio, setor_id: fixture.setores.a, status: "disponivel", tipo_revisao: revisaoTipo
            });
            ativos.push((await pedido(page, "/api/" + tipo + "/" + patrimonio)).dados);
        }
        const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jwioAAAAASUVORK5CYII=";
        const planta = await aprovado(page, "/api/mapas", "POST", {
            nome: `Planta AV03 ${sufixo}`, largura: 800, altura: 600, imagem: png, ordem: 1
        });
        const ambiente = await aprovado(page, "/api/mapas/ambientes/novo", "POST", {
            planta_id: planta.id, setor_id: fixture.setores.a, nome: `Sala AV03 ${sufixo}`,
            cor: "#2563eb", padrao: false,
            poligono: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }]
        });
        for (const [i, ativo] of ativos.entries()) {
            const atual = (await pedido(page, "/api/ativos/" + ativo.id)).dados;
            await aprovado(page, `/api/mapas/ativos/${ativo.id}/posicao`, "PUT", {
                ambiente_id: ambiente.id, x: i === 0 ? .3 : .6, y: i === 0 ? .3 : .6, revisao: atual.revisao
            }, 200);
        }
        const membros = [];
        for (const ativo of ativos.slice(1)) membros.push((await pedido(page, "/api/ativos/" + ativo.id)).dados);
        const grupo = await aprovado(page, "/api/vinculos", "POST", {
            nome: `Grupo AV03 ${sufixo}`, ativo_ids: membros.map(x => x.id),
            revisoes: Object.fromEntries(membros.map(x => [x.id, x.revisao]))
        });
        await page.goto(base + "/mapa.html");
        await page.waitForFunction(() => Boolean(estadoMapa.planta));
        // Evita disparar uma segunda recarga quando a planta inicial já é a desejada.
        if (await page.evaluate(() => estadoMapa.planta.id) !== planta.id) {
            await page.locator("#seletorPlanta").selectOption(String(planta.id));
            await page.waitForFunction(id => estadoMapa.planta?.id === id, planta.id);
        }
        await page.evaluate(() => new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator("#viewportMapa").waitFor({ state: "visible" });
        const marcador = ativo => page.locator(`.marcador-ativo[data-busca*="${ativo.patrimonio.toLowerCase()}"]`);
        const arrastar = async (ativo, dx = 22, dy = 15) => {
            const alvo = marcador(ativo);
            await alvo.waitFor({ state: "visible" });
            await alvo.scrollIntoViewIfNeeded();
            const caixa = await alvo.boundingBox();
            assert.ok(caixa);
            assert.equal(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".marcador-ativo")),
                { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }), true,
            "marcador acessível para arrastar");
            const resposta = page.waitForResponse(r => r.url().endsWith(`/api/mapas/ativos/${ativo.id}/posicao`) && r.request().method() === "PUT");
            await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
            await page.mouse.down();
            await page.mouse.move(caixa.x + caixa.width / 2 + dx, caixa.y + caixa.height / 2 + dy, { steps: 5 });
            await page.mouse.up();
            return resposta;
        };
        const revisaoInicial = await page.evaluate(id => estadoMapa.planta.ativos.find(x => x.id === id).revisao, ativos[0].id);
        const primeiro = await arrastar(ativos[0]);
        assert.equal(primeiro.status(), 200);
        assert.equal(primeiro.request().postDataJSON().revisao, revisaoInicial);
        const posicaoPrimeira = await primeiro.json();
        assert.equal(await page.evaluate(id => estadoMapa.planta.ativos.find(x => x.id === id).revisao, ativos[0].id),
            posicaoPrimeira.revisao);
        if (viewport.width === 390) await page.locator("#fecharPainelDetalhes").click();
        const segundoArraste = await arrastar(ativos[0], 16, 10);
        assert.equal(segundoArraste.status(), 200);
        assert.equal(segundoArraste.request().postDataJSON().revisao, posicaoPrimeira.revisao);
        const posicaoPersistida = (await pedido(page, "/api/mapas/" + planta.id)).dados.ativos.find(x => x.id === ativos[0].id);
        assert.equal(posicaoPersistida.x, (await segundoArraste.json()).x);
        assert.ok((await pedido(page, "/api/ativos/" + ativos[0].id + "/historico")).dados
            .filter(x => x.acao === "posicionamento_mapa").length >= 3);

        if (viewport.width === 390) await page.locator("#fecharPainelDetalhes").click();
        await page.locator(".grupo-ativos").click();
        await page.locator("#listaAtivosAgrupados").getByRole("button", { name: new RegExp(ativos[1].patrimonio) }).click();
        if (viewport.width === 390) await page.locator("#fecharPainelDetalhes").click();
        const revisaoGrupo = await page.evaluate(id => estadoMapa.planta.ativos.find(x => x.id === id).revisao, ativos[1].id);
        const movimentoGrupo = await arrastar(ativos[1], 17, 12);
        assert.equal(movimentoGrupo.status(), 200);
        assert.equal(movimentoGrupo.request().postDataJSON().revisao, revisaoGrupo);
        const retornoGrupo = await movimentoGrupo.json();
        assert.equal(retornoGrupo.grupo_id, grupo.id);
        assert.equal(retornoGrupo.posicoes.length, 2);
        await page.waitForFunction(ids => ids.every(id => estadoMapa.planta.ativos.find(x => x.id === id)?.revisao),
            membros.map(x => x.id));
        const plantaAtual = (await pedido(page, "/api/mapas/" + planta.id)).dados;
        const posGrupo = membros.map(x => plantaAtual.ativos.find(a => a.id === x.id));
        assert.equal(posGrupo[0].x, posGrupo[1].x);
        assert.equal(posGrupo[0].y, posGrupo[1].y);
        for (const membro of membros) assert.ok((await pedido(page, "/api/ativos/" + membro.id + "/historico")).dados
            .some(x => x.acao === "posicionamento_mapa"));

        if (viewport.width === 390) await page.locator("#fecharPainelDetalhes").click();

        const revisaoAntiga = await page.evaluate(id => estadoMapa.planta.ativos.find(x => x.id === id).revisao, ativos[0].id);
        const atualOutro = (await pedido(segundo.page, "/api/ativos/" + ativos[0].id)).dados;
        await aprovado(segundo.page, `/api/mapas/ativos/${ativos[0].id}/posicao`, "PUT", {
            ambiente_id: ambiente.id, x: .42, y: .43, revisao: atualOutro.revisao
        }, 200);
        const conflito = await arrastar(ativos[0], 12, 9);
        assert.equal(conflito.status(), 409);
        assert.equal(conflito.request().postDataJSON().revisao, revisaoAntiga);
        await page.locator("#avisoRevisaoAlterada a").waitFor();
        assert.equal(await page.evaluate(id => estadoMapa.planta.ativos.find(x => x.id === id).revisao, ativos[0].id), revisaoAntiga);
        const depoisConflito = (await pedido(page, "/api/mapas/" + planta.id)).dados.ativos.find(x => x.id === ativos[0].id);
        assert.equal(depoisConflito.x, .42);
        assert.equal(depoisConflito.y, .43);
        const atualRestricao = (await pedido(page, "/api/ativos/" + ativos[0].id)).dados;
        assert.equal((await pedido(page, `/api/mapas/ativos/${ativos[0].id}/posicao`, "PUT", {
            ambiente_id: ambiente.id, x: .95, y: .95, revisao: atualRestricao.revisao
        })).status, 409);
        const outraSala = await aprovado(page, "/api/mapas/ambientes/novo", "POST", {
            planta_id: planta.id, setor_id: fixture.setores.b, nome: `Outro setor ${sufixo}`,
            cor: "#16a34a", padrao: false,
            poligono: [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }]
        });
        assert.equal((await pedido(page, `/api/mapas/ativos/${ativos[0].id}/posicao`, "PUT", {
            ambiente_id: outraSala.id, x: .5, y: .5, revisao: atualRestricao.revisao
        })).status, 409);
        await conferirTela(page, "av03", viewport.width, erros);
        console.log(`PASSOU AV-03 ${viewport.width}px: dois arrastes, grupo, concorrencia, setor e limites`);
    } finally { await segundo.context.close(); await context.close(); }
}

async function av04(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const sufixo = `${viewport.width}-${runId}`;
    try {
        const categoria = (await pedido(page, "/api/categorias")).dados.find(x => x.setor_id === fixture.setores.a);
        const tipo = await aprovado(page, "/api/tipos", "POST", {
            categoria_id: categoria.id, nome: `Campos AV04 ${sufixo}`
        });
        for (const campo of [
            { nome: "inspecao_ok", label: "Inspeção concluída", tipo: "booleano", ordem: 1 },
            { nome: "quantidade", label: "Quantidade", tipo: "numero", ordem: 2 }
        ]) await aprovado(page, "/api/campos", "POST", {
            tipo_ativo_id: tipo.id, ...campo, obrigatorio: true,
            editavel: true, visivel: true, opcoes: []
        });
        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo.id);
        await page.locator("#btnAdicionar").click();
        await page.locator("#modal:not(.oculto)").waitFor();
        const booleano = page.locator("#campo-inspecao_ok");
        const numero = page.locator("#campo-quantidade");
        assert.equal(await booleano.evaluate(elemento => elemento.tagName), "SELECT");
        assert.equal(await booleano.evaluate(elemento => elemento.validity.valueMissing), true);
        assert.equal(await numero.getAttribute("step"), "any");
        const patrimonio = `AV04-${sufixo}`;
        await page.locator("#campo-patrimonio").fill(patrimonio);
        await page.locator("#campo-setor_id").selectOption(String(fixture.setores.a));
        await numero.fill("1.5");
        assert.equal(await numero.evaluate(elemento => elemento.validity.stepMismatch), false);
        let enviados = 0;
        const contar = request => { if (request.url().endsWith("/api/" + tipo.id) && request.method() === "POST") enviados++; };
        page.on("request", contar);
        await page.locator("#formModal button[type=submit]").click();
        assert.equal(enviados, 0, "sem resposta booleana não deve enviar");
        await booleano.selectOption("false");
        const criar = page.waitForResponse(r => r.url().endsWith("/api/" + tipo.id) && r.request().method() === "POST");
        await page.locator("#formModal button[type=submit]").click();
        const criado = await criar;
        assert.equal(criado.status(), 201);
        assert.equal(criado.request().postDataJSON().inspecao_ok, false);
        assert.equal(criado.request().postDataJSON().quantidade, "1.5");
        const ativo = (await pedido(page, "/api/" + tipo.id + "/" + patrimonio)).dados;
        assert.equal(ativo.inspecao_ok, false);
        assert.equal(Number(ativo.quantidade), 1.5);

        await page.locator("#tabela tr").filter({ hasText: patrimonio }).click();
        await page.locator("#btnEditar").click();
        await page.locator("#modal:not(.oculto)").waitFor();
        assert.equal(await booleano.inputValue(), "false");
        await booleano.selectOption("true");
        await numero.fill("2.75");
        const editar = page.waitForResponse(r => r.url().endsWith("/api/ativos/" + ativo.id) && r.request().method() === "PUT");
        await page.locator("#formModal button[type=submit]").click();
        const editado = await editar;
        assert.equal(editado.status(), 200);
        assert.equal(editado.request().postDataJSON().inspecao_ok, true);
        assert.equal(editado.request().postDataJSON().quantidade, "2.75");
        const atualizado = (await pedido(page, "/api/" + tipo.id + "/" + patrimonio)).dados;
        assert.equal(atualizado.inspecao_ok, true);
        assert.equal(Number(atualizado.quantidade), 2.75);

        await page.locator("#tabela tr").filter({ hasText: patrimonio }).click();
        await page.locator("#btnEditar").click();
        await page.locator("#modal:not(.oculto)").waitFor();
        await numero.fill("1e999");
        const invalido = page.waitForResponse(r => r.url().endsWith("/api/ativos/" + ativo.id) && r.request().method() === "PUT", { timeout: 3000 });
        await page.locator("#formModal button[type=submit]").click();
        const respostaInvalida = await invalido.catch(() => null);
        if (respostaInvalida) assert.equal(respostaInvalida.status(), 400);
        else assert.equal(await numero.evaluate(elemento => elemento.validity.valid), false);
        assert.equal(await page.locator("#modal:not(.oculto)").count(), 1);
        assert.equal((await pedido(page, "/api/" + tipo.id + "/" + patrimonio)).dados.quantidade, atualizado.quantidade);
        page.off("request", contar);
        await conferirTela(page, "av04", viewport.width, erros);
        console.log(`PASSOU AV-04 ${viewport.width}px: false, true, ausencia, decimais e invalido`);
    } finally { await context.close(); }
}

async function main() {
    await fs.mkdir(output, { recursive: true });
    const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
    const browser = await chromium.launch({ channel: "msedge", headless: true,
        args: ["--host-resolver-rules=MAP inventario-auditoria.test 127.0.0.1", "--no-proxy-server"] });
    try {
        for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
            if (process.argv.includes("--av01")) await av01(browser, fixture, viewport);
            if (process.argv.includes("--av02")) await av02(browser, fixture, viewport);
            if (process.argv.includes("--av03")) await av03(browser, fixture, viewport);
            if (process.argv.includes("--av04")) await av04(browser, fixture, viewport);
        }
        if (process.argv.includes("--av01-http")) {
            base = "http://inventario-auditoria.test:55450";
            for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
                await av01(browser, fixture, viewport);
            }
        }
    } finally { await browser.close(); }
}
main().catch(erro => { console.error(erro); process.exitCode = 1; });
