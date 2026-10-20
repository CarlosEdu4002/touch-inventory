const botaoVinculos = document.getElementById("btnVinculos");
const modalVinculos = document.getElementById("modalVinculos");
let contextoVinculo = null;
let membrosSelecionados = new Map();
let buscaVinculoTimer = null;
let gruposDisponiveisVinculo = [];
let grupoDestinoVinculo = null;
let adicionandoEmGrupoExistente = false;

async function apiVinculos(url, opcoes = {}) {
    const resposta = await fetch(url, {
        headers: { "Content-Type": "application/json" }, ...opcoes
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        const erro = new Error(dados.erro || "Não foi possível concluir a operação");
        erro.status = resposta.status; erro.codigo = dados.codigo;
        throw erro;
    }
    return dados;
}

function linhaVinculo(item, acao, rotulo) {
    const linha = document.createElement("div");
    const texto = document.createElement("span");
    const botao = document.createElement("button");
    linha.className = "item-vinculo";
    texto.textContent = `${item.patrimonio} · ${item.tipo_nome} · ${item.setor_nome || "Sem setor"}`;
    botao.type = "button"; botao.textContent = rotulo;
    if (acao) botao.addEventListener("click", acao);
    else botao.disabled = true;
    linha.append(texto, botao); return linha;
}

function renderizarMembrosVinculo() {
    const area = document.getElementById("membrosVinculo"); area.replaceChildren();
    membrosSelecionados.forEach((item, id) => {
        const membroOriginal = adicionandoEmGrupoExistente && grupoDestinoVinculo?.membros
            ?.some((membro) => Number(membro.ativo_id) === Number(id));
        const remover = membroOriginal ? null : () => {
            if (Number(id) === Number(contextoVinculo.ativo.ativo_id)) {
                mostrarNotificacao("Use Desvincular este ativo para removê-lo do grupo.", "aviso"); return;
            }
            membrosSelecionados.delete(id); renderizarMembrosVinculo();
        };
        area.appendChild(linhaVinculo(item, remover, membroOriginal ? "Já vinculado" : "Remover"));
    });
}

function selecionarDestinoVinculo(grupoId) {
    grupoDestinoVinculo = gruposDisponiveisVinculo.find((grupo) => Number(grupo.id) === Number(grupoId)) || null;
    adicionandoEmGrupoExistente = Boolean(grupoDestinoVinculo);
    membrosSelecionados = new Map();
    (grupoDestinoVinculo?.membros || []).forEach((item) => membrosSelecionados.set(Number(item.ativo_id), item));
    membrosSelecionados.set(Number(contextoVinculo.ativo.ativo_id), contextoVinculo.ativo);

    const nome = document.getElementById("nomeGrupo");
    nome.value = grupoDestinoVinculo?.nome || "";
    nome.readOnly = adicionandoEmGrupoExistente;
    document.getElementById("resumoVinculo").textContent = grupoDestinoVinculo
        ? `O ativo será incluído no grupo ${grupoDestinoVinculo.nome}. Os membros atuais serão preservados.`
        : "Crie um grupo para que estes itens sejam movimentados sempre em conjunto.";
    renderizarMembrosVinculo();
    buscarCandidatosVinculo().catch((erro) => mostrarNotificacao(erro.message, "erro"));
}

async function prepararDestinoVinculo() {
    const campo = document.getElementById("destinoGrupoCampo");
    const seletor = document.getElementById("grupoExistente");
    campo.classList.toggle("oculto", Boolean(contextoVinculo.grupo));
    grupoDestinoVinculo = contextoVinculo.grupo || null;
    adicionandoEmGrupoExistente = false;
    document.getElementById("nomeGrupo").readOnly = false;
    if (contextoVinculo.grupo) return;

    const todos = await apiVinculos("/api/vinculos");
    gruposDisponiveisVinculo = todos.filter((grupo) =>
        (grupo.membros || []).some((item) => Number(item.setor_id) === Number(contextoVinculo.ativo.setor_id))
    );
    seletor.replaceChildren(new Option("Criar um novo grupo", ""));
    gruposDisponiveisVinculo.forEach((grupo) => {
        seletor.appendChild(new Option(`${grupo.nome} (${grupo.total_membros} itens)`, grupo.id));
    });
    seletor.value = "";
}

async function buscarCandidatosVinculo() {
    const termo = document.getElementById("buscarVinculo").value.trim();
    const candidatos = await apiVinculos(`/api/vinculos/candidatos?q=${encodeURIComponent(termo)}`);
    const area = document.getElementById("candidatosVinculo"); area.replaceChildren();
    candidatos.filter((item) => !membrosSelecionados.has(Number(item.ativo_id)) && !item.grupo_id)
        .slice(0, 12).forEach((item) => area.appendChild(linhaVinculo(item, () => {
            membrosSelecionados.set(Number(item.ativo_id), item); renderizarMembrosVinculo();
        }, "Adicionar")));
}

botaoVinculos.addEventListener("click", async () => {
    if (!ativoSelecionado) { mostrarNotificacao("Selecione um ativo antes de criar ou editar vínculos.", "aviso"); return; }
    try {
        contextoVinculo = await apiVinculos(`/api/vinculos/ativo/${encodeURIComponent(tipo)}/${encodeURIComponent(ativoSelecionado)}`);
        await prepararDestinoVinculo();
        membrosSelecionados = new Map();
        const atuais = contextoVinculo.grupo?.membros || [contextoVinculo.ativo];
        atuais.forEach((item) => membrosSelecionados.set(Number(item.ativo_id), item));
        document.getElementById("nomeGrupo").value = contextoVinculo.grupo?.nome || "";
        document.getElementById("resumoVinculo").textContent = contextoVinculo.grupo
            ? `Este ativo pertence ao grupo ${contextoVinculo.grupo.nome}. Alterações de mapa e setor serão conjuntas.`
            : "Crie um grupo para que estes itens sejam movimentados sempre em conjunto.";
        document.getElementById("desvincularAtivo").classList.toggle("oculto", !contextoVinculo.grupo);
        document.getElementById("buscarVinculo").value = "";
        renderizarMembrosVinculo(); await buscarCandidatosVinculo(); modalVinculos.classList.remove("oculto");
    } catch (erro) { mostrarNotificacao(erro.message, "erro"); }
});

document.getElementById("buscarVinculo").addEventListener("input", () => {
    clearTimeout(buscaVinculoTimer); buscaVinculoTimer = setTimeout(() => buscarCandidatosVinculo().catch((erro) => mostrarNotificacao(erro.message, "erro")), 250);
});
document.getElementById("grupoExistente").addEventListener("change", (evento) => selecionarDestinoVinculo(evento.target.value));
document.getElementById("cancelarVinculos").addEventListener("click", () => modalVinculos.classList.add("oculto"));
document.getElementById("formVinculos").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    try {
        const grupo = contextoVinculo.grupo || grupoDestinoVinculo;
        const revisoes = Object.fromEntries([...membrosSelecionados].map(([id, item]) => [id, item.revisao]));
        await apiVinculos(grupo ? `/api/vinculos/${grupo.id}` : "/api/vinculos", {
            method: grupo ? "PUT" : "POST",
            body: JSON.stringify({
                nome: document.getElementById("nomeGrupo").value,
                ativo_ids: [...membrosSelecionados.keys()], revisoes,
                ...(grupo ? { revisao: grupo.revisao } : {})
            })
        });
        modalVinculos.classList.add("oculto");
        contextoVinculo = null;
        ativoSelecionado = null; ativoSelecionadoId = null; ativoSelecionadoRevisao = null;
        await carregarAtivos();
        mostrarNotificacao("Grupo de ativos salvo com sucesso.", "sucesso");
    } catch (erro) {
        if (!mostrarConflitoDeRevisao(erro,
            `/exibeAtivos.html?tipo=${encodeURIComponent(tipo)}&selecionar=${encodeURIComponent(contextoVinculo?.ativo?.patrimonio)}`)) {
            mostrarNotificacao(erro.message, "erro");
        }
    }
});
document.getElementById("desvincularAtivo").addEventListener("click", async () => {
    if (!contextoVinculo?.grupo) return;
    try {
        await apiVinculos(`/api/vinculos/${contextoVinculo.grupo.id}/membros/${contextoVinculo.ativo.ativo_id}`, {
            method: "DELETE", body: JSON.stringify({ revisao: contextoVinculo.grupo.revisao })
        });
        modalVinculos.classList.add("oculto");
        contextoVinculo = null;
        ativoSelecionado = null; ativoSelecionadoId = null; ativoSelecionadoRevisao = null;
        await carregarAtivos();
        mostrarNotificacao("Ativo desvinculado com sucesso.", "sucesso");
    } catch (erro) {
        if (!mostrarConflitoDeRevisao(erro,
            `/exibeAtivos.html?tipo=${encodeURIComponent(tipo)}&selecionar=${encodeURIComponent(contextoVinculo?.ativo?.patrimonio)}`)) {
            mostrarNotificacao(erro.message, "erro");
        }
    }
});
