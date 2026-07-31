window.tipo =
    new URLSearchParams(window.location.search).get("tipo") ||
    "paleteiras";

let ativosCarregados = [];
let ativoSelecionado = null;
let contextoTipoAtual = null;
let temporizadorNotificacao = null;

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
}

function abrirAtivo(id) {
    window.location.href = `ativo.html?tipo=${encodeURIComponent(
        tipo
    )}&id=${encodeURIComponent(id)}`;
}

function montarCabecalho(campos) {
    const cabecalho = document.getElementById("cabecalhoTabela");
    cabecalho.innerHTML = "";

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

function atualizarIdentificacao(contexto) {
    const categoria = document.getElementById("categoriaAtual");
    const tipoTitulo = document.getElementById("tipoAtual");

    categoria.textContent =
        contexto.tipo.categoria_nome || "Sem categoria";
    tipoTitulo.textContent = contexto.tipo.nome;
    document.title =
        `${contexto.tipo.nome} | Touch Inventory`;
}

async function carregarAtivos() {
    const tabela = document.getElementById("tabela");

    try {
        contextoTipoAtual =
            contextoTipoAtual || (await obterContextoTipo(tipo));

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
        tabela.innerHTML = "";

        const campos = camposVisiveis(contextoTipoAtual.campos);

        ativos.forEach((ativo) => {
            const linha = document.createElement("tr");
            linha.setAttribute("aria-selected", "false");

            campos.forEach((campo) => {
                const td = document.createElement("td");
                td.textContent = formatarValorCampo(
                    campo,
                    ativo[campo.nome]
                );
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
    } catch (erro) {
        console.error(erro);
        tabela.innerHTML = "";

        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.textContent = erro.message;
        linha.appendChild(celula);
        tabela.appendChild(linha);
    }
}

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
