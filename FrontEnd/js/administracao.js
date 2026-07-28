const estado = {
    categorias: [],
    tipos: [],
    campos: [],
    tipoCamposSelecionado: null,
    nomeCampoAlteradoManual: false
};

const elementos = {
    mensagem: document.getElementById("mensagem"),
    formCategoria: document.getElementById("formCategoria"),
    categoriaId: document.getElementById("categoriaId"),
    categoriaNome: document.getElementById("categoriaNome"),
    salvarCategoria: document.getElementById("salvarCategoria"),
    cancelarCategoria: document.getElementById("cancelarCategoria"),
    listaCategorias: document.getElementById("listaCategorias"),
    totalCategorias: document.getElementById("totalCategorias"),
    formTipo: document.getElementById("formTipo"),
    tipoId: document.getElementById("tipoId"),
    tipoCategoria: document.getElementById("tipoCategoria"),
    tipoNome: document.getElementById("tipoNome"),
    salvarTipo: document.getElementById("salvarTipo"),
    cancelarTipo: document.getElementById("cancelarTipo"),
    listaTipos: document.getElementById("listaTipos"),
    totalTipos: document.getElementById("totalTipos"),
    totalCampos: document.getElementById("totalCampos"),
    buscaTipoAtivo: document.getElementById("buscaTipoAtivo"),
    campoTipoAtivo: document.getElementById("campoTipoAtivo"),
    configuracaoCampos: document.getElementById("configuracaoCampos"),
    instrucaoCampos: document.getElementById("instrucaoCampos"),
    formCampo: document.getElementById("formCampo"),
    campoId: document.getElementById("campoId"),
    campoLabel: document.getElementById("campoLabel"),
    campoNome: document.getElementById("campoNome"),
    campoFormato: document.getElementById("campoFormato"),
    campoOrdem: document.getElementById("campoOrdem"),
    grupoOpcoes: document.getElementById("grupoOpcoes"),
    campoOpcoes: document.getElementById("campoOpcoes"),
    campoObrigatorio: document.getElementById("campoObrigatorio"),
    campoEditavel: document.getElementById("campoEditavel"),
    campoVisivel: document.getElementById("campoVisivel"),
    salvarCampo: document.getElementById("salvarCampo"),
    cancelarCampo: document.getElementById("cancelarCampo"),
    listaCampos: document.getElementById("listaCampos")
};

async function requisicao(url, opcoes = {}) {
    const response = await fetch(url, {
        ...opcoes,
        headers: opcoes.body
            ? { "Content-Type": "application/json" }
            : undefined
    });
    const dados = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(dados.erro || "Não foi possível concluir a operação");
    }

    return dados;
}

function mostrarMensagem(texto, erro = false) {
    elementos.mensagem.textContent = texto;
    elementos.mensagem.classList.toggle("erro", erro);
    elementos.mensagem.classList.remove("oculto");

    window.setTimeout(() => {
        elementos.mensagem.classList.add("oculto");
    }, 4000);
}

function criarBotao(texto, classe, acao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = classe;
    botao.textContent = texto;
    botao.addEventListener("click", acao);
    return botao;
}

function criarItemLista(nome, detalhe, aoEditar, aoRemover) {
    const item = document.createElement("div");
    const conteudo = document.createElement("div");
    const titulo = document.createElement("p");
    const descricao = document.createElement("p");
    const acoes = document.createElement("div");

    item.className = "item-lista";
    conteudo.className = "item-conteudo";
    titulo.className = "item-nome";
    descricao.className = "item-detalhe";
    acoes.className = "item-acoes";

    titulo.textContent = nome;
    descricao.textContent = detalhe;
    acoes.appendChild(criarBotao("Editar", "editar", aoEditar));
    acoes.appendChild(criarBotao("Remover", "remover", aoRemover));
    conteudo.appendChild(titulo);
    conteudo.appendChild(descricao);
    item.appendChild(conteudo);
    item.appendChild(acoes);

    return item;
}

function preencherSelectCategorias(valorSelecionado = "") {
    elementos.tipoCategoria.innerHTML =
        '<option value="">Selecione uma categoria</option>';

    estado.categorias.forEach((categoria) => {
        const option = document.createElement("option");
        option.value = categoria.id;
        option.textContent = categoria.nome;
        option.selected =
            String(categoria.id) === String(valorSelecionado);
        elementos.tipoCategoria.appendChild(option);
    });
}

function normalizarBusca(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function preencherSelectTipos(filtro = "") {
    const selecionado = elementos.campoTipoAtivo.value;
    const termo = normalizarBusca(filtro);
    elementos.campoTipoAtivo.innerHTML =
        '<option value="">Selecione um tipo de ativo</option>';

    const tiposFiltrados = estado.tipos.filter((tipo) =>
        normalizarBusca(
            `${tipo.categoria_nome} ${tipo.nome}`
        ).includes(termo)
    );

    tiposFiltrados.forEach((tipo) => {
        const option = document.createElement("option");
        option.value = tipo.id;
        option.textContent = `${tipo.categoria_nome} — ${tipo.nome}`;
        option.selected = String(tipo.id) === String(selecionado);
        elementos.campoTipoAtivo.appendChild(option);
    });

    if (tiposFiltrados.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Nenhum tipo encontrado";
        option.disabled = true;
        elementos.campoTipoAtivo.appendChild(option);
    }

    return tiposFiltrados;
}

function cancelarEdicaoCategoria() {
    elementos.formCategoria.reset();
    elementos.categoriaId.value = "";
    elementos.salvarCategoria.textContent = "Adicionar";
    elementos.cancelarCategoria.classList.add("oculto");
}

function cancelarEdicaoTipo() {
    elementos.formTipo.reset();
    elementos.tipoId.value = "";
    elementos.salvarTipo.textContent = "Adicionar";
    elementos.cancelarTipo.classList.add("oculto");
}

function cancelarEdicaoCampo() {
    elementos.formCampo.reset();
    elementos.campoId.value = "";
    elementos.campoOrdem.value = String(estado.campos.length + 1);
    elementos.campoEditavel.checked = true;
    elementos.campoVisivel.checked = true;
    elementos.salvarCampo.textContent = "Adicionar campo";
    elementos.cancelarCampo.classList.add("oculto");
    elementos.grupoOpcoes.classList.add("oculto");
    estado.nomeCampoAlteradoManual = false;
}

function editarCategoria(categoria) {
    elementos.categoriaId.value = categoria.id;
    elementos.categoriaNome.value = categoria.nome;
    elementos.salvarCategoria.textContent = "Salvar";
    elementos.cancelarCategoria.classList.remove("oculto");
    elementos.categoriaNome.focus();
}

function editarTipo(tipo) {
    elementos.tipoId.value = tipo.id;
    elementos.tipoNome.value = tipo.nome;
    preencherSelectCategorias(tipo.categoria_id);
    elementos.salvarTipo.textContent = "Salvar";
    elementos.cancelarTipo.classList.remove("oculto");
    elementos.tipoNome.focus();
}

function editarCampo(campo) {
    elementos.campoId.value = campo.id;
    elementos.campoLabel.value = campo.label;
    elementos.campoNome.value = campo.nome;
    elementos.campoFormato.value = campo.tipo;
    elementos.campoOrdem.value = campo.ordem;
    elementos.campoObrigatorio.checked = campo.obrigatorio;
    elementos.campoEditavel.checked = campo.editavel;
    elementos.campoVisivel.checked = campo.visivel;
    elementos.campoOpcoes.value = (campo.opcoes || []).join("\n");
    elementos.grupoOpcoes.classList.toggle(
        "oculto",
        !["select", "selecao"].includes(campo.tipo)
    );
    elementos.salvarCampo.textContent = "Salvar campo";
    elementos.cancelarCampo.classList.remove("oculto");
    estado.nomeCampoAlteradoManual = true;
    elementos.campoLabel.focus();
}

async function removerCategoria(categoria) {
    if (!window.confirm(`Remover a categoria "${categoria.nome}"?`)) {
        return;
    }

    try {
        await requisicao(`/api/categorias/${categoria.id}`, {
            method: "DELETE"
        });
        mostrarMensagem("Categoria removida com sucesso.");
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

async function removerTipo(tipo) {
    if (!window.confirm(`Remover o tipo de ativo "${tipo.nome}"?`)) {
        return;
    }

    try {
        await requisicao(`/api/tipos/${tipo.id}`, {
            method: "DELETE"
        });
        if (estado.tipoCamposSelecionado === tipo.id) {
            await carregarCampos(null);
        }
        mostrarMensagem("Tipo de ativo removido com sucesso.");
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

async function removerCampo(campo) {
    if (!window.confirm(`Remover o campo "${campo.label}"?`)) {
        return;
    }

    try {
        await requisicao(`/api/campos/${campo.id}`, {
            method: "DELETE"
        });
        mostrarMensagem("Campo removido com sucesso.");
        await carregarCampos(estado.tipoCamposSelecionado);
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
}

function renderizarCategorias() {
    elementos.listaCategorias.innerHTML = "";
    elementos.totalCategorias.textContent = estado.categorias.length;

    if (estado.categorias.length === 0) {
        elementos.listaCategorias.innerHTML =
            '<p class="vazio">Nenhuma categoria cadastrada.</p>';
        return;
    }

    estado.categorias.forEach((categoria) => {
        const quantidadeTipos = estado.tipos.filter(
            (tipo) => tipo.categoria_id === categoria.id
        ).length;

        elementos.listaCategorias.appendChild(
            criarItemLista(
                categoria.nome,
                `${quantidadeTipos} tipo(s) de ativo`,
                () => editarCategoria(categoria),
                () => removerCategoria(categoria)
            )
        );
    });
}

function renderizarTipos() {
    elementos.listaTipos.innerHTML = "";
    elementos.totalTipos.textContent = estado.tipos.length;

    if (estado.tipos.length === 0) {
        elementos.listaTipos.innerHTML =
            '<p class="vazio">Nenhum tipo de ativo cadastrado.</p>';
        return;
    }

    estado.tipos.forEach((tipo) => {
        elementos.listaTipos.appendChild(
            criarItemLista(
                tipo.nome,
                tipo.categoria_nome,
                () => editarTipo(tipo),
                () => removerTipo(tipo)
            )
        );
    });
}

const ROTULOS_FORMATO = {
    texto: "Texto curto",
    numero: "Número",
    data: "Data",
    booleano: "Sim ou não",
    select: "Lista de seleção",
    selecao: "Lista de seleção",
    textarea: "Texto longo"
};

function renderizarCampos() {
    elementos.listaCampos.innerHTML = "";
    const camposConfiguraveis = estado.campos.filter(
        (campo) => campo.nome !== "patrimonio"
    );
    elementos.totalCampos.textContent = camposConfiguraveis.length + 1;

    const patrimonio = document.createElement("div");
    patrimonio.className = "item-lista campo-sistema";
    patrimonio.innerHTML = `
        <div class="item-conteudo">
            <p class="item-nome">Patrimônio</p>
            <p class="item-detalhe">Campo obrigatório do sistema</p>
        </div>
        <span class="selo-sistema">Protegido</span>
    `;
    elementos.listaCampos.appendChild(patrimonio);

    camposConfiguraveis.forEach((campo) => {
        const caracteristicas = [
            ROTULOS_FORMATO[campo.tipo] || campo.tipo,
            campo.obrigatorio ? "Obrigatório" : "Opcional",
            campo.visivel ? "Visível" : "Oculto"
        ].join(" · ");

        elementos.listaCampos.appendChild(
            criarItemLista(
                campo.label,
                caracteristicas,
                () => editarCampo(campo),
                () => removerCampo(campo)
            )
        );
    });
}

async function carregarCampos(tipoId) {
    if (!tipoId) {
        estado.tipoCamposSelecionado = null;
        estado.campos = [];
        elementos.totalCampos.textContent = "0";
        elementos.configuracaoCampos.classList.add("oculto");
        elementos.instrucaoCampos.classList.remove("oculto");
        return;
    }

    estado.tipoCamposSelecionado = Number(tipoId);
    estado.campos = await requisicao(
        `/api/tipos/${tipoId}/campos`
    );
    elementos.instrucaoCampos.classList.add("oculto");
    elementos.configuracaoCampos.classList.remove("oculto");
    cancelarEdicaoCampo();
    renderizarCampos();
}

async function carregarDados() {
    const [categorias, tipos] = await Promise.all([
        requisicao("/api/categorias"),
        requisicao("/api/tipos")
    ]);

    estado.categorias = categorias;
    estado.tipos = tipos;
    preencherSelectCategorias();
    preencherSelectTipos();
    renderizarCategorias();
    renderizarTipos();
}

elementos.formCategoria.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const id = elementos.categoriaId.value;
    const nome = elementos.categoriaNome.value.trim();

    try {
        await requisicao(id ? `/api/categorias/${id}` : "/api/categorias", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify({ nome })
        });
        mostrarMensagem(
            id
                ? "Categoria atualizada com sucesso."
                : "Categoria criada com sucesso."
        );
        cancelarEdicaoCategoria();
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
});

elementos.formTipo.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const id = elementos.tipoId.value;
    const dados = {
        categoria_id: Number(elementos.tipoCategoria.value),
        nome: elementos.tipoNome.value.trim()
    };

    try {
        await requisicao(id ? `/api/tipos/${id}` : "/api/tipos", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(dados)
        });
        mostrarMensagem(
            id
                ? "Tipo de ativo atualizado com sucesso."
                : "Tipo de ativo criado com sucesso."
        );
        cancelarEdicaoTipo();
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
});

elementos.formCampo.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const id = elementos.campoId.value;
    const formato = elementos.campoFormato.value;
    const opcoes = ["select", "selecao"].includes(formato)
        ? elementos.campoOpcoes.value
              .split("\n")
              .map((opcao) => opcao.trim())
              .filter(Boolean)
        : [];
    const dados = {
        tipo_ativo_id: estado.tipoCamposSelecionado,
        nome: elementos.campoNome.value.trim(),
        label: elementos.campoLabel.value.trim(),
        tipo: formato,
        opcoes,
        obrigatorio: elementos.campoObrigatorio.checked,
        editavel: elementos.campoEditavel.checked,
        visivel: elementos.campoVisivel.checked,
        ordem: Number(elementos.campoOrdem.value)
    };

    try {
        await requisicao(id ? `/api/campos/${id}` : "/api/campos", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(dados)
        });
        mostrarMensagem(
            id
                ? "Campo atualizado com sucesso."
                : "Campo criado com sucesso."
        );
        await carregarCampos(estado.tipoCamposSelecionado);
    } catch (erro) {
        mostrarMensagem(erro.message, true);
    }
});

elementos.cancelarCategoria.addEventListener(
    "click",
    cancelarEdicaoCategoria
);
elementos.cancelarTipo.addEventListener("click", cancelarEdicaoTipo);
elementos.cancelarCampo.addEventListener(
    "click",
    cancelarEdicaoCampo
);

elementos.campoTipoAtivo.addEventListener("change", () => {
    carregarCampos(elementos.campoTipoAtivo.value).catch((erro) =>
        mostrarMensagem(erro.message, true)
    );
});

elementos.buscaTipoAtivo.addEventListener("input", () => {
    const filtro = elementos.buscaTipoAtivo.value;
    const encontrados = preencherSelectTipos(filtro);

    if (filtro.trim() && encontrados.length === 1) {
        elementos.campoTipoAtivo.value = encontrados[0].id;
        carregarCampos(encontrados[0].id).catch((erro) =>
            mostrarMensagem(erro.message, true)
        );
    }
});

elementos.campoFormato.addEventListener("change", () => {
    elementos.grupoOpcoes.classList.toggle(
        "oculto",
        !["select", "selecao"].includes(elementos.campoFormato.value)
    );
});

function gerarIdentificador(texto) {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

elementos.campoLabel.addEventListener("input", () => {
    if (!estado.nomeCampoAlteradoManual) {
        elementos.campoNome.value = gerarIdentificador(
            elementos.campoLabel.value
        );
    }
});

elementos.campoNome.addEventListener("input", () => {
    estado.nomeCampoAlteradoManual = true;
});

async function iniciarAdministracao() {
    await protegerPagina();
    await carregarDados();
}

iniciarAdministracao().catch((erro) =>
    mostrarMensagem(erro.message, true)
);
