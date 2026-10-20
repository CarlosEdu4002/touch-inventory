// =====================
// Estado e configurações da interface
// =====================

const params = new URLSearchParams(window.location.search);
const ativoId = params.get("ativo");
const unidadeId = params.get("unidade");

// =====================
// Funções da interface
// =====================

// Função: Transforma um valor do ativo em texto legível de acordo com a definição do campo.
function formatarValor(campo, valor) {
    if (valor === undefined || valor === null || valor === "") return "N/A";
    if (campo.tipo === "booleano") return valor === true ? "Sim" : "Não";
    if (campo.tipo === "data") {
        const partes = String(valor).split("-");
        if (partes.length === 3) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
    }
    if (["select", "selecao"].includes(campo.tipo)) {
        const opcao = (campo.opcoes || []).find((item) =>
            typeof item === "object"
                ? String(item.valor) === String(valor)
                : String(item) === String(valor)
        );
        if (opcao && typeof opcao === "object") return opcao.label;
    }
    return String(valor);
}

// Função: Cria uma linha de rótulo e valor e a adiciona ao contêiner de detalhes do ativo.
function adicionarLinha(container, labelTexto, valorTexto) {
    const linha = document.createElement("div");
    const label = document.createElement("span");
    const valor = document.createElement("span");
    linha.className = "linha";
    label.className = "label";
    label.textContent = `${labelTexto}:`;
    valor.textContent = valorTexto || "N/A";
    linha.append(label, valor);
    container.appendChild(linha);
}

// Função: Substitui o conteúdo da consulta por uma mensagem de erro segura.
function mostrarErro(container, mensagem) {
    const erro = document.createElement("p");
    erro.className = "erro";
    erro.textContent = mensagem;
    container.replaceChildren(erro);
}

// Função: Exige a unidade indicada pela etiqueta antes de consultar o ativo.
async function carregarAtivo() {
    const usuario = await protegerPagina();
    const container = document.getElementById("conteudo");
    if (!/^[1-9]\d*$/.test(ativoId || "") || !/^[1-9]\d*$/.test(unidadeId || "") ||
        !Number.isSafeInteger(Number(ativoId)) || !Number.isSafeInteger(Number(unidadeId))) {
        mostrarErro(container, "Etiqueta inválida. Grave uma nova URL com unidade e ID do ativo.");
        return;
    }
    if (Number(usuario.unidade_id) !== Number(unidadeId)) {
        const retorno = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/unidades.html?retorno=${retorno}`);
        return;
    }
    try {
        const response = await fetch(`/api/ativos/${encodeURIComponent(ativoId)}/detalhes?unidade=${encodeURIComponent(unidadeId)}`);
        const dados = await response.json();
        if (!response.ok) {
            throw new Error(dados.erro || "Ativo não encontrado");
        }
        container.replaceChildren();
        container.classList.toggle(
            "sem-imagem",
            !dados.ativo.imagem_url
        );
        if (dados.ativo.imagem_url) {
            const imagem = document.createElement("img");
            imagem.className = "imagem-ativo";
            imagem.src = dados.ativo.imagem_url;
            imagem.alt = `Imagem do ativo ${dados.ativo.patrimonio}`;
            container.appendChild(imagem);
        }
        adicionarLinha(container, "Patrimônio", dados.ativo.patrimonio);
        adicionarLinha(container, "Tipo de ativo", dados.tipo.nome);
        adicionarLinha(container, "Categoria", dados.tipo.categoria_nome);
        adicionarLinha(container, "Setor", dados.ativo.setor);
        adicionarLinha(container, "Status", dados.ativo.status);
        dados.campos
            .filter(
                (campo) =>
                    !["patrimonio", "setor", "setor_id", "status"].includes(
                        campo.nome
                    )
            )
            .forEach((campo) => {
                adicionarLinha(
                    container,
                    campo.label,
                    formatarValor(campo, dados.ativo[campo.nome])
                );
            });
    } catch (erro) {
        console.error(erro);
        mostrarErro(container, erro.message);
    }
}

carregarAtivo().catch(() => {});
