window.tipo =
    new URLSearchParams(window.location.search).get("tipo") ||
    "paleteiras";

let ativosCarregados = [];
let ativoSelecionado = null;
let contextoTipoAtual = null;

function selecionarLinha(id, linha) {
    document
        .querySelectorAll("#tabela tr")
        .forEach((tr) => tr.classList.remove("selecionado"));

    linha.classList.add("selecionado");
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

        const isTouch = navigator.maxTouchPoints > 0;
        const campos = camposVisiveis(contextoTipoAtual.campos);

        ativos.forEach((ativo) => {
            const linha = document.createElement("tr");

            campos.forEach((campo) => {
                const td = document.createElement("td");
                td.textContent = formatarValorCampo(
                    campo,
                    ativo[campo.nome]
                );
                linha.appendChild(td);
            });

            linha.addEventListener("click", () => {
                selecionarLinha(ativo.patrimonio, linha);

                if (isTouch) {
                    abrirAtivo(ativo.patrimonio);
                }
            });

            if (!isTouch) {
                linha.addEventListener("dblclick", () => {
                    abrirAtivo(ativo.patrimonio);
                });
            }

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
        alert("Ativo não encontrado");
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
        alert(erro.message);
    }
}

iniciarPaginaAtivos();
