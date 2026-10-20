// =====================
// Estado e configurações da interface
// =====================

window.tipo =
    new URLSearchParams(window.location.search).get("tipo") ||
    "paleteiras";

let ativosCarregados = [];
let ativoSelecionado = null;
let ativoSelecionadoId = null;
let ativoSelecionadoRevisao = null;
let contextoTipoAtual = null;
let temporizadorNotificacao = null;

// =====================
// Funções da interface
// =====================

// Função: Apresenta uma mensagem temporária de aviso, sucesso ou erro com atributos adequados de acessibilidade.
function mostrarNotificacao(mensagem, tipoNotificacao = "aviso") {
    const area = document.getElementById("notificacoes");
    if (!area) return;

    window.clearTimeout(temporizadorNotificacao);

    const notificacao = document.createElement("div");
    const texto = document.createElement("p");
    const fechar = document.createElement("button");

    notificacao.className =
        `notificacao notificacao-${tipoNotificacao}`;
    notificacao.setAttribute(
        "role",
        tipoNotificacao === "erro" ? "alert" : "status"
    );
    texto.textContent = mensagem;
    fechar.type = "button";
    fechar.className = "notificacao-fechar";
    fechar.setAttribute("aria-label", "Fechar aviso");
    fechar.textContent = "×";
    fechar.addEventListener("click", () => notificacao.remove());

    notificacao.append(texto, fechar);
    area.replaceChildren(notificacao);

    temporizadorNotificacao = window.setTimeout(() => {
        notificacao.classList.add("notificacao-saindo");
        window.setTimeout(() => notificacao.remove(), 180);
    }, 4200);
}

// Função: Marca visualmente o ativo escolhido e mantém seu identificador como seleção atual.
function selecionarLinha(id, linha) {
    document
        .querySelectorAll("#tabela tr")
        .forEach((tr) => {
            tr.classList.remove("selecionado");
            tr.setAttribute("aria-selected", "false");
        });

    linha.classList.add("selecionado");
    linha.setAttribute("aria-selected", "true");
    ativoSelecionado = id;
    const ativo = ativosCarregados.find(item => item.patrimonio === id);
    ativoSelecionadoId = ativo?.id || null;
    ativoSelecionadoRevisao = ativo?.revisao ?? null;
}

// Função: Abre o ativo na unidade selecionada usando sua identidade permanente.
function abrirAtivo(id) {
    const ativo=ativosCarregados.find(item=>item.patrimonio===id);
    if (!ativo || !usuarioAtual?.unidade_id) {
        mostrarNotificacao("Não foi possível identificar o ativo nesta unidade", "erro");
        return;
    }
    window.location.href = `ativo.html?unidade=${encodeURIComponent(usuarioAtual.unidade_id)}&ativo=${encodeURIComponent(ativo.id)}`;
}

// Função: Cria as colunas da tabela a partir dos campos visíveis configurados para o tipo atual.
function montarCabecalho(campos) {
    const cabecalho = document.getElementById("cabecalhoTabela");
    cabecalho.replaceChildren();

    camposVisiveis(campos).forEach((campo) => {
        const th = document.createElement("th");
        th.textContent = campo.label;
        cabecalho.appendChild(th);
    });

    const thAcoes = document.createElement("th");
    thAcoes.className = "coluna-acoes";
    thAcoes.textContent = "Detalhes";
    cabecalho.appendChild(thAcoes);
}

// Função: Atualiza títulos e textos da página com o nome e a categoria do tipo de ativo selecionado.
function atualizarIdentificacao(contexto) {
    const categoria = document.getElementById("categoriaAtual");
    const tipoTitulo = document.getElementById("tipoAtual");
    const botaoEmprestimo = document.getElementById("btnEmprestimo");
    const botaoVinculos = document.getElementById("btnVinculos");

    categoria.textContent =
        contexto.tipo.categoria_nome || "Sem categoria";
    tipoTitulo.textContent = contexto.tipo.nome;
    document.title =
        `${contexto.tipo.nome} | Controle Patrimonial`;
    botaoEmprestimo.classList.toggle(
        "oculto",
        !contexto.tipo.permite_emprestimo
    );
    botaoVinculos.classList.toggle("oculto", !contexto.tipo.permite_vinculo);
}

// Função: Busca os ativos do tipo atual e reconstrói as linhas e colunas da tabela.
async function carregarAtivos() {
    const tabela = document.getElementById("tabela");

    try {
        contextoTipoAtual =
            contextoTipoAtual || (await obterContextoTipo(tipo));
        window.tipo=String(contextoTipoAtual.tipo.id);

        const response = await fetch(
            `/api/${encodeURIComponent(tipo)}`
        );
        const ativos = await lerResposta(
            response,
            "Erro ao carregar ativos"
        );

        ativos.sort((a, b) =>
            a.patrimonio.localeCompare(b.patrimonio, undefined, {
                numeric: true,
                sensitivity: "base"
            })
        );

        ativosCarregados = ativos;
        tabela.replaceChildren();

        const campos = camposVisiveis(contextoTipoAtual.campos);

        ativos.forEach((ativo) => {
            const linha = document.createElement("tr");
            linha.dataset.patrimonio = ativo.patrimonio;
            linha.tabIndex = -1;
            linha.setAttribute("aria-selected", "false");

            campos.forEach((campo) => {
                const td = document.createElement("td");
                const conteudo = document.createElement("span");
                const valorFormatado = formatarValorCampo(
                    campo,
                    ativo[campo.nome]
                );
                conteudo.className = "conteudo-celula";
                conteudo.textContent = valorFormatado;
                conteudo.title = valorFormatado;
                td.className = "celula-dados";
                td.appendChild(conteudo);
                linha.appendChild(td);
            });

            const celulaAcoes = document.createElement("td");
            const botaoAbrir = document.createElement("button");
            celulaAcoes.className = "coluna-acoes";
            botaoAbrir.type = "button";
            botaoAbrir.className = "btn-abrir-ativo";
            botaoAbrir.textContent = "Abrir";
            botaoAbrir.setAttribute(
                "aria-label",
                `Abrir detalhes do ativo ${ativo.patrimonio}`
            );
            botaoAbrir.addEventListener("click", (evento) => {
                evento.stopPropagation();
                abrirAtivo(ativo.patrimonio);
            });
            celulaAcoes.appendChild(botaoAbrir);
            linha.appendChild(celulaAcoes);

            linha.addEventListener("click", () => {
                selecionarLinha(ativo.patrimonio, linha);
            });

            linha.addEventListener("dblclick", () => {
                abrirAtivo(ativo.patrimonio);
            });

            tabela.appendChild(linha);
        });

        const patrimonioSolicitado = new URLSearchParams(window.location.search)
            .get("selecionar");
        if (patrimonioSolicitado) {
            const linhaSolicitada = [...tabela.querySelectorAll("tr")].find(
                (linha) => linha.dataset.patrimonio?.toLocaleUpperCase("pt-BR") ===
                    patrimonioSolicitado.toLocaleUpperCase("pt-BR")
            );
            if (linhaSolicitada) {
                selecionarLinha(linhaSolicitada.dataset.patrimonio, linhaSolicitada);
                linhaSolicitada.scrollIntoView({ behavior: "smooth", block: "center" });
                linhaSolicitada.focus({ preventScroll: true });
            }
        }
    } catch (erro) {
        console.error(erro);
        tabela.replaceChildren();

        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.textContent = erro.message;
        linha.appendChild(celula);
        tabela.appendChild(linha);
    }
}

// Função: Localiza na tabela o patrimônio digitado, selecionando-o quando houver correspondência exata.
function buscarAtivo() {
    const texto = document
        .getElementById("buscaId")
        .value
        .trim()
        .toUpperCase();

    const ativo = ativosCarregados.find(
        (item) => item.patrimonio.toUpperCase() === texto
    );

    if (!ativo) {
        mostrarNotificacao("Ativo não encontrado.", "erro");
        return;
    }

    abrirAtivo(ativo.patrimonio);
}

// Função: Valida o tipo informado na URL, carrega seu contexto e inicia a listagem de ativos.
async function iniciarPaginaAtivos() {
    try {
        await protegerPagina();
        contextoTipoAtual = await obterContextoTipo(tipo);
        atualizarIdentificacao(contextoTipoAtual);
        montarCabecalho(contextoTipoAtual.campos);
        await carregarAtivos();
    } catch (erro) {
        console.error(erro);
        mostrarNotificacao(erro.message, "erro");
    }
}

iniciarPaginaAtivos();
