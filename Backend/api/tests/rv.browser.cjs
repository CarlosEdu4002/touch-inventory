const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const base = "http://127.0.0.1:55450";
const runId = Date.now().toString(36);
const fixturePath = path.resolve(__dirname, "../output/rv/fixture.json");
async function pagina(browser, token, viewport) {
    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: "inventario_sessao", value: token, url: base }]);
    const page = await context.newPage();
    const erros = [];
    page.on("pageerror", erro => erros.push(erro.message));
    return { context, page, erros };
}
async function conferirTela(page, etapa, largura, erros) {
    assert.deepEqual(erros, [], "sem erros de JavaScript no navegador");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
        "pagina sem rolagem horizontal");
    await page.screenshot({ path: path.resolve(__dirname, "../output/rv/" + etapa + "-" + largura + ".png"),
        fullPage: true });
}
async function pedido(page, url, method = "GET", body) {
    return page.evaluate(async ({ url, method, body }) => {
        const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, dados: await r.json().catch(() => ({})) };
    }, { url, method, body });
}
async function rv01(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    const ativoId = fixture.ativos.excluir;
    const tipo = fixture.tipos.desktop;
    try {
        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo);
        const linha = page.locator("#tabela tr").filter({ hasText: "RV-EXCLUIR" });
        await linha.waitFor();
        await linha.click();
        const revisao = await page.evaluate(() => ativoSelecionadoRevisao);
        await page.locator("#btnRemover").click();
        const excluir = page.waitForResponse(r => r.url().endsWith("/api/ativos/" + ativoId) &&
            r.request().method() === "DELETE");
        await page.locator("#btnConfirmarRemocao").click();
        const respostaExcluir = await excluir;
        assert.equal(respostaExcluir.status(), 200);
        assert.deepEqual(respostaExcluir.request().postDataJSON(),
            { confirmar_exclusao: true, revisao });

        await page.goto(base + "/lixeira.html");
        const excluido = page.locator('#ativosLixeira tr[data-ativo-id="' + ativoId + '"]');
        await excluido.waitFor();
        const revExcluido = (await pedido(page, "/api/ativos/lixeira")).dados.find(x => x.id === ativoId).revisao;
        await excluido.getByRole("button", { name: "Histórico" }).click();
        await excluido.locator(".historico-lixeira").waitFor();
        assert.match(await excluido.locator(".historico-lixeira").innerText(), /Exclusão/);
        page.once("dialog", dialog => dialog.accept());
        const restaurar = page.waitForResponse(r => r.url().endsWith("/api/ativos/" + ativoId + "/restaurar"));
        await excluido.getByRole("button", { name: "Restaurar" }).click();
        const respostaRestaurar = await restaurar;
        assert.equal(respostaRestaurar.status(), 200);
        assert.deepEqual(respostaRestaurar.request().postDataJSON(), { revisao: revExcluido });
        await page.locator("#logLixeira").getByText("Restauração").first().waitFor();

        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo);
        await linha.waitFor(); await linha.click();
        const revisaoAntiga = await page.evaluate(() => ativoSelecionadoRevisao);
        await page.locator("#btnRemover").click();
        await segundo.page.goto(base + "/index.html");
        await segundo.page.waitForFunction(() => Boolean(contextoPagina));
        const atual = await pedido(segundo.page, "/api/ativos/" + ativoId);
        assert.equal(atual.status, 200);
        const alterar = await pedido(segundo.page, "/api/ativos/" + ativoId, "PUT", {
            patrimonio: atual.dados.patrimonio, setor_id: atual.dados.setor_id,
            status: atual.dados.status === "disponivel" ? "em_uso" : "disponivel", revisao: atual.dados.revisao,
            tipo_revisao: atual.dados.tipo_revisao
        });
        assert.equal(alterar.status, 200);
        const conflito = page.waitForResponse(r => r.url().endsWith("/api/ativos/" + ativoId) &&
            r.request().method() === "DELETE");
        await page.locator("#btnConfirmarRemocao").click();
        const respostaConflito = await conflito;
        assert.equal(respostaConflito.status(), 409);
        assert.equal(respostaConflito.request().postDataJSON().revisao, revisaoAntiga);
        await page.locator("#avisoRevisaoAlterada a").waitFor();
        assert.equal((await pedido(page, "/api/ativos/" + ativoId)).status, 200);
        await conferirTela(page, "rv01", viewport.width, erros);
        console.log("PASSOU RV-01 " + viewport.width + "px: excluir, historico, restaurar e conflito de outra conta");
    } finally { await segundo.context.close(); await context.close(); }
}

async function criarAtivo(page, tipo, patrimonio, setor, status = "em_uso") {
    const tipos = await pedido(page, "/api/tipos");
    const revisao = tipos.dados.find(item => item.id === tipo)?.revisao;
    assert.equal((await pedido(page, "/api/" + tipo, "POST",
        { patrimonio, setor_id: setor, status, tipo_revisao: revisao })).status, 201);
    const ativo = await pedido(page, "/api/" + tipo + "/" + patrimonio);
    assert.equal(ativo.status, 200);
    return ativo.dados;
}
async function rv02(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    const tipo = fixture.tipos.desktop, setor = fixture.setores;
    const sufixo = viewport.width + "-" + runId;
    try {
        await page.goto(base + "/index.html");
        await page.waitForFunction(() => Boolean(contextoPagina));
        await segundo.page.goto(base + "/index.html");
        await segundo.page.waitForFunction(() => Boolean(contextoPagina));
        const individual = await criarAtivo(page, tipo, "RV2-I-" + sufixo, setor.a);
        const membros = [];
        for (let i = 1; i <= 3; i++) membros.push(await criarAtivo(page, tipo, "RV2-G" + i + "-" + sufixo, setor.a));
        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo);
        await page.locator("#tabela tr").filter({ hasText: individual.patrimonio }).click();
        await page.locator("#btnTransferir").click();
        await page.locator("#modalTransferencia:not(.oculto)").waitFor();
        const revisaoIndividual = await page.evaluate(() => transferenciaAberta.revisao);
        await page.locator("#setorDestino").selectOption(String(setor.b));
        await page.locator("#observacaoTransferencia").fill("Transferencia individual RV");
        const resposta = page.waitForResponse(r => r.url().endsWith("/transferir") && r.request().method() === "POST");
        await page.locator("#formTransferencia button[type=submit]").click();
        const transferir = await resposta;
        assert.equal(transferir.status(), 200);
        assert.equal(transferir.request().postDataJSON().revisao, revisaoIndividual);
        assert.equal(transferir.request().postDataJSON().grupo_esperado, null);
        assert.equal((await pedido(page, "/api/ativos/" + individual.id)).dados.setor_id, setor.b);
        const historico = await pedido(page, "/api/ativos/" + individual.id + "/historico");
        assert.ok(historico.dados.some(item => item.acao === "transferencia"));

        const revisoes = Object.fromEntries(membros.map(item => [item.id, item.revisao]));
        const novo = await pedido(segundo.page, "/api/vinculos", "POST", {
            nome: "Grupo RV2 " + sufixo, ativo_ids: membros.map(item => item.id), revisoes
        });
        assert.equal(novo.status, 201);
        await page.reload();
        await page.locator("#tabela tr").filter({ hasText: membros[0].patrimonio }).click();
        await page.locator("#btnTransferir").click();
        await page.locator("#modalTransferencia:not(.oculto)").waitFor();
        assert.match(await page.locator("#resumoTransferencia").innerText(), /Todos os integrantes/);
        const snapshot = await page.evaluate(() => transferenciaAberta);
        await page.locator("#setorDestino").selectOption(String(setor.b));
        const respostaGrupo = page.waitForResponse(r => r.url().endsWith("/transferir") && r.request().method() === "POST");
        await page.locator("#formTransferencia button[type=submit]").click();
        const transferirGrupo = await respostaGrupo;
        assert.equal(transferirGrupo.status(), 200);
        assert.deepEqual(transferirGrupo.request().postDataJSON().grupo_esperado, snapshot.grupo_esperado);
        for (const item of membros) assert.equal((await pedido(page, "/api/ativos/" + item.id)).dados.setor_id, setor.b);

        await page.reload();
        await page.locator("#tabela tr").filter({ hasText: membros[0].patrimonio }).click();
        await page.locator("#btnTransferir").click();
        await page.locator("#modalTransferencia:not(.oculto)").waitFor();
        await page.locator("#setorDestino").selectOption(String(setor.c));
        await page.locator("#observacaoTransferencia").fill("Motivo preservado RV2");
        const grupoAtual = (await pedido(segundo.page,
            "/api/vinculos/ativo/" + tipo + "/" + membros[0].patrimonio)).dados.grupo;
        assert.equal((await pedido(segundo.page,
            "/api/vinculos/" + novo.dados.id + "/membros/" + membros[2].id,
            "DELETE", { revisao: grupoAtual.revisao })).status, 200);
        const conflito = page.waitForResponse(r => r.url().endsWith("/transferir") && r.request().method() === "POST");
        await page.locator("#formTransferencia button[type=submit]").click();
        assert.equal((await conflito).status(), 409);
        assert.equal(await page.locator("#observacaoTransferencia").inputValue(), "Motivo preservado RV2");
        await page.locator("#avisoRevisaoAlterada a").waitFor();
        for (const item of membros.slice(0, 2)) assert.equal((await pedido(page, "/api/ativos/" + item.id)).dados.setor_id, setor.b);
        await conferirTela(page, "rv02", viewport.width, erros);
        console.log("PASSOU RV-02 " + viewport.width + "px: individual, grupo, historico e composicao alterada");
    } finally { await segundo.context.close(); await context.close(); }
}

async function rv03(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    try {
        await page.goto(base + "/index.html");
        await page.waitForFunction(() => Boolean(contextoPagina));
        await segundo.page.goto(base + "/index.html");
        await segundo.page.waitForFunction(() => Boolean(contextoPagina));
        for (const [chave, rota, status] of [
            ["desktop", "movimentar-emprestimo", "em_uso"],
            ["chave", "movimentar-chave", "disponivel"],
            ["ferramenta", "movimentar-ferramenta", "disponivel"]
        ]) {
            const tipo = fixture.tipos[chave], patrimonio = "RV3-" + chave + "-" + viewport.width + "-" + runId;
            const ativo = await criarAtivo(page, tipo, patrimonio, fixture.setores.a, status);
            const caminho = "/api/" + tipo + "/" + patrimonio + "/" + rota;
            await page.goto(base + "/exibeAtivos.html?tipo=" + tipo);
            const linha = page.locator("#tabela tr").filter({ hasText: patrimonio });
            await linha.waitFor(); await linha.click();
            await page.locator("#btnEmprestimo").click();
            await page.locator("#modalMovimentacaoChave:not(.oculto)").waitFor();
            const revisaoSaida = await page.evaluate(() => ativoMovimentacao.revisao);
            await page.locator("#responsavelChave").fill("Responsavel RV3");
            await page.locator('[data-prazo-dias="1"]').click();
            await page.locator("#observacaoChave").fill("Observacao RV3");
            const saida = page.waitForResponse(r => r.url().endsWith("/" + rota) && r.request().method() === "POST", {timeout:5000});
            await page.locator("#confirmarMovimentacaoChave").click();
            const respostaSaida = await saida;
            assert.equal(respostaSaida.status(), 200, chave + " saida");
            const corpoSaida = respostaSaida.request().postDataJSON();
            assert.equal(corpoSaida.revisao, revisaoSaida);
            assert.equal(corpoSaida.acao_esperada, "saida");
            assert.equal(corpoSaida.responsavel, "Responsavel RV3");
            assert.equal(corpoSaida.observacao, "Observacao RV3");
            assert.ok(corpoSaida.prazo_devolucao);
            assert.equal((await pedido(page, "/api/ativos/" + ativo.id)).dados.status, "emprestado");
            const antesReenvio = (await pedido(page, "/api/ativos/" + ativo.id + "/historico")).dados.length;
            assert.equal((await pedido(page, caminho, "POST", corpoSaida)).status, 409);
            assert.equal((await pedido(page, "/api/ativos/" + ativo.id + "/historico")).dados.length, antesReenvio);

            await linha.waitFor(); await linha.click();
            await page.locator("#btnEmprestimo").click();
            await page.locator("#modalMovimentacaoChave:not(.oculto)").waitFor();
            const revisaoRetorno = await page.evaluate(() => ativoMovimentacao.revisao);
            const retorno = page.waitForResponse(r => r.url().endsWith("/" + rota) && r.request().method() === "POST");
            await page.locator("#confirmarMovimentacaoChave").click();
            const respostaRetorno = await retorno;
            assert.equal(respostaRetorno.status(), 200, chave + " devolucao");
            assert.equal(respostaRetorno.request().postDataJSON().revisao, revisaoRetorno);
            assert.equal(respostaRetorno.request().postDataJSON().acao_esperada, "devolucao");
            assert.notEqual((await pedido(page, "/api/ativos/" + ativo.id)).dados.status, "emprestado");

            await linha.waitFor(); await linha.click();
            await page.locator("#btnEmprestimo").click();
            await page.locator("#modalMovimentacaoChave:not(.oculto)").waitFor();
            const revisaoAntiga = await page.evaluate(() => ativoMovimentacao.revisao);
            await page.locator("#responsavelChave").fill("Preenchimento RV3 preservado");
            await page.locator('[data-prazo-dias="1"]').click();
            const atual = await pedido(segundo.page, "/api/ativos/" + ativo.id);
            assert.equal(atual.status, 200);
            const alteracao = await pedido(segundo.page, "/api/ativos/" + ativo.id, "PUT", {
                patrimonio, setor_id: atual.dados.setor_id,
                status: atual.dados.status === "disponivel" ? "em_uso" : "disponivel",
                revisao: atual.dados.revisao, tipo_revisao: atual.dados.tipo_revisao
            });
            assert.equal(alteracao.status, 200);
            const conflito = page.waitForResponse(r => r.url().endsWith("/" + rota) && r.request().method() === "POST");
            await page.locator("#confirmarMovimentacaoChave").click();
            const respostaConflito = await conflito;
            assert.equal(respostaConflito.status(), 409);
            assert.equal(respostaConflito.request().postDataJSON().revisao, revisaoAntiga);
            assert.equal(await page.locator("#responsavelChave").inputValue(), "Preenchimento RV3 preservado");
            await page.locator("#avisoRevisaoAlterada a").waitFor();
            await page.locator("#cancelarMovimentacaoChave").click();
        }
        await conferirTela(page, "rv03", viewport.width, erros);
        console.log("PASSOU RV-03 " + viewport.width + "px: ativo, chave, ferramenta, devolucao, reenvio e conflito");
    } finally { await segundo.context.close(); await context.close(); }
}

async function rv04(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segundo = await pagina(browser, fixture.segundoToken, viewport);
    const tipo = fixture.tipos.desktop, setor = fixture.setores.a;
    const sufixo = viewport.width + "-" + runId;
    const abrir = async patrimonio => {
        await page.locator("#tabela tr").filter({ hasText: patrimonio }).click();
        await page.locator("#btnVinculos").click();
        await page.locator("#modalVinculos:not(.oculto)").waitFor();
    };
    const adicionar = async patrimonio => {
        await page.locator("#buscarVinculo").fill(patrimonio);
        await page.locator("#candidatosVinculo .item-vinculo").filter({ hasText: patrimonio })
            .getByRole("button", { name: "Adicionar" }).click();
    };
    const grupoAtual = async patrimonio => (await pedido(segundo.page,
        "/api/vinculos/ativo/" + tipo + "/" + patrimonio)).dados.grupo;
    const mudarGrupo = async (grupo, nome) => pedido(segundo.page, "/api/vinculos/" + grupo.id, "PUT", {
        nome, ativo_ids: grupo.membros.map(item => item.ativo_id), revisao: grupo.revisao,
        revisoes: Object.fromEntries(grupo.membros.map(item => [item.ativo_id, item.revisao]))
    });
    try {
        await page.goto(base + "/index.html"); await page.waitForFunction(() => Boolean(contextoPagina));
        await segundo.page.goto(base + "/index.html");
        await segundo.page.waitForFunction(() => Boolean(contextoPagina));
        const a = await criarAtivo(page, tipo, "RV4-A-" + sufixo, setor);
        const b = await criarAtivo(page, tipo, "RV4-B-" + sufixo, setor);
        const c = await criarAtivo(page, tipo, "RV4-C-" + sufixo, setor);
        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo);
        await abrir(a.patrimonio);
        await page.locator("#nomeGrupo").fill("Grupo RV4 " + sufixo);
        await adicionar(b.patrimonio);
        const atualA = await pedido(segundo.page, "/api/ativos/" + a.id);
        assert.equal((await pedido(segundo.page, "/api/ativos/" + a.id, "PUT", {
            patrimonio: a.patrimonio, setor_id: setor, status: "disponivel",
            revisao: atualA.dados.revisao, tipo_revisao: atualA.dados.tipo_revisao
        })).status, 200);
        const conflitoCriacao = page.waitForResponse(r => r.url().endsWith("/api/vinculos") && r.request().method() === "POST");
        await page.locator("#formVinculos button[type=submit]").click();
        assert.equal((await conflitoCriacao).status(), 409);
        assert.equal(await page.locator("#nomeGrupo").inputValue(), "Grupo RV4 " + sufixo);
        await page.locator("#avisoRevisaoAlterada a").waitFor();
        await page.locator("#cancelarVinculos").click();

        await abrir(a.patrimonio);
        await page.locator("#nomeGrupo").fill("Grupo RV4 " + sufixo);
        await adicionar(b.patrimonio);
        const criar = page.waitForResponse(r => r.url().endsWith("/api/vinculos") && r.request().method() === "POST");
        await page.locator("#formVinculos button[type=submit]").click();
        const criado = await criar;
        assert.equal(criado.status(), 201);
        const corpoCriacao = criado.request().postDataJSON();
        assert.deepEqual(Object.keys(corpoCriacao.revisoes).map(Number).sort((x,y)=>x-y), [a.id,b.id].sort((x,y)=>x-y));
        const grupoId = (await criado.json()).id;
        assert.equal((await grupoAtual(a.patrimonio)).id, grupoId);

        await abrir(a.patrimonio);
        await page.locator("#nomeGrupo").fill("Grupo RV4 editado " + sufixo);
        const editar = page.waitForResponse(r => r.url().endsWith("/api/vinculos/" + grupoId) && r.request().method() === "PUT");
        await page.locator("#formVinculos button[type=submit]").click();
        const editado = await editar;
        assert.equal(editado.status(), 200);
        assert.ok(editado.request().postDataJSON().revisao >= 1);
        assert.equal((await grupoAtual(a.patrimonio)).nome, "Grupo RV4 editado " + sufixo);

        await abrir(a.patrimonio);
        await adicionar(c.patrimonio);
        const incluir = page.waitForResponse(r => r.url().endsWith("/api/vinculos/" + grupoId) && r.request().method() === "PUT");
        await page.locator("#formVinculos button[type=submit]").click();
        assert.equal((await incluir).status(), 200);
        assert.equal((await grupoAtual(a.patrimonio)).membros.length, 3);

        await abrir(a.patrimonio);
        await page.locator("#membrosVinculo .item-vinculo").filter({ hasText: c.patrimonio })
            .getByRole("button", { name: "Remover" }).click();
        const remover = page.waitForResponse(r => r.url().endsWith("/api/vinculos/" + grupoId) && r.request().method() === "PUT");
        await page.locator("#formVinculos button[type=submit]").click();
        assert.equal((await remover).status(), 200);
        assert.equal((await grupoAtual(a.patrimonio)).membros.length, 2);

        await abrir(a.patrimonio);
        await page.locator("#nomeGrupo").fill("Nome RV4 preservado");
        const grupoAntes = await grupoAtual(a.patrimonio);
        assert.equal((await mudarGrupo(grupoAntes, "Outra conta RV4")).status, 200);
        const conflitoEdicao = page.waitForResponse(r => r.url().endsWith("/api/vinculos/" + grupoId) && r.request().method() === "PUT");
        await page.locator("#formVinculos button[type=submit]").click();
        assert.equal((await conflitoEdicao).status(), 409);
        assert.equal(await page.locator("#nomeGrupo").inputValue(), "Nome RV4 preservado");
        await page.locator("#cancelarVinculos").click();

        await abrir(a.patrimonio);
        const grupoAntesUnlink = await grupoAtual(a.patrimonio);
        assert.equal((await mudarGrupo(grupoAntesUnlink, "Outra conta RV4 novamente")).status, 200);
        const conflitoUnlink = page.waitForResponse(r => r.url().endsWith("/membros/" + a.id) && r.request().method() === "DELETE");
        await page.locator("#desvincularAtivo").click();
        assert.equal((await conflitoUnlink).status(), 409);
        assert.equal(await page.locator("#modalVinculos").isVisible(), true);
        await page.locator("#cancelarVinculos").click();
        await abrir(a.patrimonio);
        const unlink = page.waitForResponse(r => r.url().endsWith("/membros/" + a.id) && r.request().method() === "DELETE");
        await page.locator("#desvincularAtivo").click();
        const removido = await unlink;
        assert.equal(removido.status(), 200);
        assert.ok(removido.request().postDataJSON().revisao >= 1);
        assert.equal(await grupoAtual(a.patrimonio), null);
        await conferirTela(page, "rv04", viewport.width, erros);
        console.log("PASSOU RV-04 " + viewport.width + "px: criar, editar, incluir, remover, desvincular e conflitos");
    } finally { await segundo.context.close(); await context.close(); }
}

async function rv05Contexto(browser, fixture, viewport) {
    const { context, page, erros } = await pagina(browser, fixture.token, viewport);
    const segunda = await context.newPage();
    const tipo = fixture.tipos.desktop, patrimonio = "RV-TRANSFERIR";
    try {
        await page.goto(base + "/exibeAtivos.html?tipo=" + tipo);
        await page.locator("#tabela tr").filter({ hasText: patrimonio }).click();
        const antes = await pedido(page, "/api/" + tipo + "/" + patrimonio);
        const historicoAntes = (await pedido(page,
            "/api/ativos/" + antes.dados.id + "/historico")).dados.length;
        await page.locator("#btnTransferir").click();
        await page.locator("#modalTransferencia:not(.oculto)").waitFor();
        await page.locator("#setorDestino").selectOption(String(fixture.setores.b));
        await page.locator("#observacaoTransferencia").fill("Preenchimento RV05 A-B-A");
        const chaveOriginal = await page.evaluate(() => contextoPagina);
        await segunda.goto(base + "/unidades.html");
        await segunda.locator(".cartao").filter({ hasText: "Unidade B RV" }).locator(".entrar").click();
        await segunda.waitForURL("**/index.html");
        await page.bringToFront();
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.locator("#avisoContextoAlterado").waitFor();
        assert.equal(await page.locator("#observacaoTransferencia").inputValue(), "Preenchimento RV05 A-B-A");
        await segunda.goto(base + "/unidades.html");
        await segunda.locator(".cartao").filter({ hasText: "Unidade A RV" }).locator(".entrar").click();
        await segunda.waitForURL("**/index.html");
        const rejeicaoServidor = await page.evaluate(async chave => {
            const r = await fetchNativo("/api/ativos/lixeira", {
                headers: { "X-Inventario-Contexto": chave }
            });
            return r.status;
        }, chaveOriginal);
        assert.equal(rejeicaoServidor, 409);
        await page.locator("#formTransferencia button[type=submit]").click();
        assert.equal(await page.locator("#observacaoTransferencia").inputValue(), "Preenchimento RV05 A-B-A");
        assert.equal(await page.locator("#modalTransferencia").isVisible(), true);
        const depois = await pedido(segunda, "/api/" + tipo + "/" + patrimonio);
        assert.equal(depois.dados.setor_id, antes.dados.setor_id);
        assert.equal((await pedido(segunda, "/api/ativos/" + antes.dados.id + "/historico")).dados.length, historicoAntes);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await conferirTela(page, "rv05", viewport.width, erros);
        console.log("PASSOU RV-05 " + viewport.width + "px: A-B-A, contexto antigo 409 e formulario preservado");
    } finally { await context.close(); }
}

(async () => {
    if (!["--rv01", "--rv02", "--rv03", "--rv04", "--rv05"].some(flag => process.argv.includes(flag))) {
        throw new Error("Informe ao menos uma etapa --rv01 a --rv05");
    }
    const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
        for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
            if (process.argv.includes("--rv01")) await rv01(browser, fixture, viewport);
            if (process.argv.includes("--rv02")) await rv02(browser, fixture, viewport);
            if (process.argv.includes("--rv03")) await rv03(browser, fixture, viewport);
            if (process.argv.includes("--rv04")) await rv04(browser, fixture, viewport);
            if (process.argv.includes("--rv05")) await rv05Contexto(browser, fixture, viewport);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
