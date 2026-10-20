let gruposCarregados = [];
const parametrosGrupos = new URLSearchParams(window.location.search);
const categoriaIdGrupo = parametrosGrupos.get("categoria_id");
const categoriaNomeGrupo = parametrosGrupos.get("categoria");
const elementoGrupo = (id) => document.getElementById(id);

async function requisicaoGrupos(url) {
    const resposta = await fetch(url);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar os grupos");
    return dados;
}

function textoBuscaGrupo(grupo) {
    return [grupo.nome, ...(grupo.membros || []).flatMap((item) => [
        item.patrimonio, item.tipo_nome, item.categoria_nome, item.setor_nome
    ])].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
}

function renderizarGrupos() {
    const termo = elementoGrupo("buscaGrupo").value.trim().toLocaleLowerCase("pt-BR");
    const grupos = gruposCarregados.filter((grupo) => textoBuscaGrupo(grupo).includes(termo));
    const lista = elementoGrupo("listaGrupos");
    lista.replaceChildren();
    elementoGrupo("gruposVazios").hidden = grupos.length > 0;
    elementoGrupo("totalGrupos").textContent = `${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`;

    grupos.forEach((grupo) => {
        const card = document.createElement("article");
        const cabecalho = document.createElement("div");
        const titulo = document.createElement("h3");
        const total = document.createElement("span");
        const membros = document.createElement("div");
        card.className = "grupo-card"; cabecalho.className = "grupo-cabecalho"; membros.className = "membros";
        titulo.textContent = grupo.nome; total.textContent = `${grupo.total_membros} itens vinculados`;
        cabecalho.append(titulo, total);
        (grupo.membros || []).forEach((item) => {
            const link = document.createElement("a");
            const patrimonio = document.createElement("strong");
            const detalhe = document.createElement("span");
            link.className = "membro";
            link.href = `exibeAtivos.html?tipo=${encodeURIComponent(item.tipo_ativo_id)}&selecionar=${encodeURIComponent(item.patrimonio)}`;
            patrimonio.textContent = item.patrimonio;
            detalhe.textContent = `${item.tipo_nome} · ${item.setor_nome || "Sem setor"}`;
            link.append(patrimonio, detalhe); membros.appendChild(link);
        });
        card.append(cabecalho, membros); lista.appendChild(card);
    });
}

async function iniciarGrupos() {
    try {
        await protegerPagina();
        if (categoriaIdGrupo) {
            elementoGrupo("tituloGrupos").textContent = categoriaNomeGrupo || "Grupos da categoria";
            elementoGrupo("verTodosGrupos").hidden = false;
        }
        const query = categoriaIdGrupo ? `?categoria_id=${encodeURIComponent(categoriaIdGrupo)}` : "";
        gruposCarregados = await requisicaoGrupos(`/api/vinculos${query}`);
        renderizarGrupos();
    } catch (erro) {
        elementoGrupo("notificacao").textContent = erro.message;
        elementoGrupo("notificacao").hidden = false;
    }
}

elementoGrupo("buscaGrupo").addEventListener("input", renderizarGrupos);
document.addEventListener("DOMContentLoaded", iniciarGrupos);
