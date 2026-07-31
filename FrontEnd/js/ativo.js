const params = new URLSearchParams(window.location.search);
const tipo = params.get("tipo");
const id = params.get("id");

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

async function carregarAtivo() {
    const container = document.getElementById("conteudo");
    if (!tipo || !id) {
        container.innerHTML =
            '<p class="erro">Ativo não informado na URL</p>';
        return;
    }
    try {
        const response = await fetch(
            `/api/publico/ativos/${encodeURIComponent(
                tipo
            )}/${encodeURIComponent(id)}`
        );
        const dados = await response.json();
        if (!response.ok) {
            throw new Error(dados.erro || "Ativo não encontrado");
        }
        container.innerHTML = "";
        container.classList.toggle("sem-imagem", !dados.ativo.imagem_url);
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
        container.innerHTML = `<p class="erro">${erro.message}</p>`;
    }
}

carregarAtivo();
