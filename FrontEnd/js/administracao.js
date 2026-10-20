// =====================
// Estado e configurações da interface
// =====================

const estado = {
    categorias: [],
    tipos: [],
    campos: [],
    tipoCamposSelecionado: null,
    nomeCampoAlteradoManual: false,
    tipoEmEdicao: null,
    campoEmEdicao: null
};

const elementos = {
    mensagem: document.getElementById("mensagem"),
    formCategoria: document.getElementById("formCategoria"),
    categoriaId: document.getElementById("categoriaId"),
    categoriaNome: document.getElementById("categoriaNome"),
    categoriaIcone: document.getElementById("categoriaIcone"),
    salvarCategoria: document.getElementById("salvarCategoria"),
    cancelarCategoria: document.getElementById("cancelarCategoria"),
    listaCategorias: document.getElementById("listaCategorias"),
    totalCategorias: document.getElementById("totalCategorias"),
    formTipo: document.getElementById("formTipo"),
    tipoId: document.getElementById("tipoId"),
    tipoCategoria: document.getElementById("tipoCategoria"),
    tipoNome: document.getElementById("tipoNome"),
    tipoIcone: document.getElementById("tipoIcone"),
    tipoPermiteEmprestimo: document.getElementById("tipoPermiteEmprestimo"),
    tipoPermiteVinculo: document.getElementById("tipoPermiteVinculo"),
    tipoPermiteChecklist: document.getElementById("tipoPermiteChecklist"),
    configuracaoChecklist: document.getElementById("configuracaoChecklist"),
    checklistRecorrencia: document.getElementById("checklistRecorrencia"),
    checklistAlertaDias: document.getElementById("checklistAlertaDias"),
    checklistModo: document.getElementById("checklistModo"),
    checklistModoCampo: document.getElementById("checklistModoCampo"),
    checklistDatasCampo: document.getElementById("checklistDatasCampo"),
    checklistDatasLista: document.getElementById("checklistDatasLista"),
    adicionarDataChecklist: document.getElementById("adicionarDataChecklist"),
    checklistItens: document.getElementById("checklistItens"),
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

// =====================
// Funções da interface
// =====================

// Função: Executa uma chamada à API, interpreta o JSON retornado e transforma respostas de erro em exceções.
async function requisicao(url, opcoes = {}) {
    const response = await fetch(url, {
        ...opcoes,
        headers: opcoes.body
            ? { "Content-Type": "application/json" }
            : undefined
    });
    const dados = await response.json().catch(() => ({}));

    if (!response.ok) {
        const erro = new Error(dados.erro || "Não foi possível concluir a operação");
        erro.status = response.status;
        erro.codigo = dados.codigo;
        throw erro;
    }

    return dados;
}

// Função: Exibe o retorno das operações administrativas, diferenciando visualmente sucesso e erro.
function mostrarMensagem(texto, erro = false) {
    elementos.mensagem.textContent = texto;
    elementos.mensagem.classList.toggle("erro", erro);
    elementos.mensagem.classList.remove("oculto");

    window.setTimeout(() => {
        elementos.mensagem.classList.add("oculto");
    }, 4000);
}

// Função: Cria um botão administrativo com texto, classe visual e ação de clique.
function criarBotao(texto, classe, acao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = classe;
    botao.textContent = texto;
    botao.addEventListener("click", acao);
    return botao;
}

// Função: Cria uma opção de seleção com valor, texto e estado inicial informados.
function criarOpcao(valor, texto, selecionada = false) {
    const opcao = document.createElement("option");
    opcao.value = valor;
    opcao.textContent = texto;
    opcao.selected = selecionada;
    return opcao;
}

// Função: Formata a autoria da última troca de ícone para auditoria visível ao setor.
function descreverAlteracaoIcone(registro) {
    if (!registro.icone_usuario_nome || !registro.icone_atualizado_em) {
        return "";
    }

    const data = new Date(registro.icone_atualizado_em).toLocaleString("pt-BR");
    return ` · Ícone alterado por ${registro.icone_usuario_nome} em ${data}`;
}

// Função: Substitui o conteúdo de uma lista por uma mensagem vazia segura.
function mostrarListaVazia(lista, mensagem) {
    const vazio = document.createElement("p");
    vazio.className = "vazio";
    vazio.textContent = mensagem;
    lista.replaceChildren(vazio);
}

// Função: Monta um item reutilizável de lista com informações e ações de edição e remoção.
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

// Função: Preenche a seleção de categorias e mantém marcada a opção informada.
function preencherSelectCategorias(valorSelecionado = "") {
    elementos.tipoCategoria.replaceChildren(
        criarOpcao("", "Selecione uma categoria")
    );

    estado.categorias.forEach((categoria) => {
        elementos.tipoCategoria.appendChild(
            criarOpcao(
                categoria.id,
                `${categoria.icone || "📁"} ${categoria.nome}`,
                String(categoria.id) === String(valorSelecionado)
            )
        );
    });
}

// Função: Remove acentos e diferenças de caixa para tornar a busca textual consistente.
function normalizarBusca(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

// Função: Filtra os tipos pelo texto pesquisado e atualiza as opções disponíveis no seletor.
function preencherSelectTipos(filtro = "") {
    const selecionado = elementos.campoTipoAtivo.value;
    const termo = normalizarBusca(filtro);
    elementos.campoTipoAtivo.replaceChildren(
        criarOpcao("", "Selecione um tipo de ativo")
    );

    const tiposFiltrados = estado.tipos.filter((tipo) =>
        normalizarBusca(
            `${tipo.categoria_nome} ${tipo.nome}`
        ).includes(termo)
    );

    tiposFiltrados.forEach((tipo) => {
        elementos.campoTipoAtivo.appendChild(
            criarOpcao(
                tipo.id,
                `${tipo.categoria_nome} — ${tipo.nome}`,
                String(tipo.id) === String(selecionado)
            )
        );
    });

    if (tiposFiltrados.length === 0) {
        const opcao = criarOpcao("", "Nenhum tipo encontrado");
        opcao.disabled = true;
        elementos.campoTipoAtivo.appendChild(opcao);
    }

    return tiposFiltrados;
}

// Função: Sai do modo de edição de categoria e restaura o formulário para um novo cadastro.
function cancelarEdicaoCategoria() {
    elementos.formCategoria.reset();
    elementos.categoriaIcone.value = "";
    window.EmojiPicker.atualizarBotao(elementos.categoriaIcone);
    elementos.categoriaId.value = "";
    elementos.salvarCategoria.textContent = "Adicionar";
    elementos.cancelarCategoria.classList.add("oculto");
}

// Função: Sai do modo de edição de tipo de ativo e restaura os valores iniciais do formulário.
function cancelarEdicaoTipo() {
    elementos.formTipo.reset();
    elementos.tipoIcone.value = "";
    window.EmojiPicker.atualizarBotao(elementos.tipoIcone);
    elementos.tipoId.value = "";
    estado.tipoEmEdicao = null;
    elementos.tipoPermiteEmprestimo.checked = false;
    elementos.tipoPermiteVinculo.checked = false;
    elementos.tipoPermiteChecklist.checked = false;
    elementos.checklistRecorrencia.value = "mensal";
    elementos.checklistAlertaDias.value = "15";
    elementos.checklistModo.value = "conclusao";
    elementos.checklistItens.value = "";
    preencherDatasChecklist([]);
    atualizarCamposRecorrencia();
    elementos.configuracaoChecklist.classList.add("oculto");
    elementos.salvarTipo.textContent = "Adicionar tipo de ativo";
    elementos.cancelarTipo.classList.add("oculto");
}

function recorrenciaDoTipo(tipo) {
    return tipo.checklist_recorrencia ||
        ({ 1: "mensal", 3: "trimestral", 6: "semestral", 12: "anual" })[tipo.checklist_intervalo_meses] ||
        "mensal";
}

function rotuloRecorrencia(tipo) {
    return ({
        semanal: "Semanal", mensal: "Mensal", trimestral: "Trimestral",
        semestral: "Semestral", anual: "Anual", personalizado: "Datas específicas"
    })[recorrenciaDoTipo(tipo)];
}

function adicionarLinhaDataChecklist(valor = "") {
    const linha = document.createElement("div");
    const input = document.createElement("input");
    const remover = document.createElement("button");
    linha.className = "data-checklist-linha";
    input.type = "date";
    input.value = valor;
    remover.type = "button";
    remover.className = "btn-remover";
    remover.textContent = "Remover";
    remover.addEventListener("click", () => {
        linha.remove();
        if (!elementos.checklistDatasLista.children.length) adicionarLinhaDataChecklist();
    });
    linha.append(input, remover);
    elementos.checklistDatasLista.appendChild(linha);
}

function preencherDatasChecklist(datas) {
    elementos.checklistDatasLista.replaceChildren();
    (datas?.length ? datas : [""]).forEach(adicionarLinhaDataChecklist);
}

function obterDatasChecklist() {
    return [...elementos.checklistDatasLista.querySelectorAll('input[type="date"]')]
        .map((input) => input.value).filter(Boolean);
}

function atualizarCamposRecorrencia() {
    const personalizado = elementos.checklistRecorrencia.value === "personalizado";
    if (personalizado && !elementos.checklistDatasLista.children.length) {
        adicionarLinhaDataChecklist();
    }
    elementos.checklistDatasCampo.classList.toggle("oculto", !personalizado);
    elementos.checklistModoCampo.classList.toggle("oculto", personalizado);
    elementos.checklistDatasLista.querySelectorAll('input[type="date"]')
        .forEach((input) => { input.required = personalizado; });
}

// Função: Sai do modo de edição de campo dinâmico e limpa os controles correspondentes.
function cancelarEdicaoCampo() {
    elementos.formCampo.reset();
    elementos.campoId.value = "";
    estado.campoEmEdicao = null;
    elementos.campoOrdem.value = String(estado.campos.length + 1);
    elementos.campoEditavel.checked = true;
    elementos.campoVisivel.checked = true;
    elementos.salvarCampo.textContent = "Adicionar campo";
    elementos.cancelarCampo.classList.add("oculto");
    elementos.grupoOpcoes.classList.add("oculto");
    estado.nomeCampoAlteradoManual = false;
}

// Função: Carrega a categoria escolhida no formulário e ativa seu modo de edição.
function editarCategoria(categoria) {
    elementos.categoriaId.value = categoria.id;
    elementos.categoriaNome.value = categoria.nome;
    elementos.categoriaIcone.value = categoria.icone || "";
    window.EmojiPicker.atualizarBotao(elementos.categoriaIcone);
    elementos.salvarCategoria.textContent = "Salvar";
    elementos.cancelarCategoria.classList.remove("oculto");
    elementos.categoriaNome.focus();
}

// Função: Carrega o tipo de ativo escolhido no formulário e ativa seu modo de edição.
function editarTipo(tipo) {
    estado.tipoEmEdicao = { id: tipo.id, revisao: tipo.revisao };
    elementos.tipoId.value = tipo.id;
    elementos.tipoNome.value = tipo.nome;
    elementos.tipoIcone.value = tipo.icone || "";
    window.EmojiPicker.atualizarBotao(elementos.tipoIcone);
    elementos.tipoPermiteEmprestimo.checked = Boolean(tipo.permite_emprestimo);
    elementos.tipoPermiteVinculo.checked = Boolean(tipo.permite_vinculo);
    elementos.tipoPermiteChecklist.checked = Boolean(tipo.permite_checklist);
    elementos.checklistRecorrencia.value = recorrenciaDoTipo(tipo);
    elementos.checklistAlertaDias.value = tipo.checklist_alerta_dias ?? 15;
    elementos.checklistModo.value = tipo.checklist_modo || "conclusao";
    elementos.checklistItens.value = (tipo.checklist_itens || []).join("\n");
    preencherDatasChecklist(tipo.checklist_datas_personalizadas || []);
    atualizarCamposRecorrencia();
    elementos.configuracaoChecklist.classList.toggle("oculto", !tipo.permite_checklist);
    preencherSelectCategorias(tipo.categoria_id);
    elementos.salvarTipo.textContent = "Salvar alterações";
    elementos.cancelarTipo.classList.remove("oculto");
    elementos.tipoNome.focus();
}

// Função: Carrega a configuração do campo escolhido no formulário e ativa seu modo de edição.
function editarCampo(campo) {
    estado.campoEmEdicao = { id: campo.id, revisao: campo.revisao };
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

// Função: Solicita confirmação, remove a categoria pela API e atualiza as listas administrativas.
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

// Função: Solicita confirmação, remove o tipo de ativo pela API e recarrega os dados relacionados.
async function removerTipo(tipo) {
    const { id, nome, revisao } = tipo;
    if (!window.confirm(`Remover o tipo de ativo "${nome}"?`)) {
        return;
    }

    try {
        await requisicao(`/api/tipos/${id}`, {
            method: "DELETE", body: JSON.stringify({ revisao })
        });
        if (estado.tipoCamposSelecionado === id) {
            await carregarCampos(null);
        }
        mostrarMensagem("Tipo de ativo removido com sucesso.");
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
        mostrarConflitoDeRevisao(erro, "/administracao.html");
    }
}

// Função: Solicita confirmação, remove o campo dinâmico pela API e atualiza a lista do tipo selecionado.
async function removerCampo(campo) {
    const { id, label, revisao } = campo;
    if (!window.confirm(`Remover o campo "${label}"?`)) {
        return;
    }

    try {
        await requisicao(`/api/campos/${id}`, {
            method: "DELETE", body: JSON.stringify({ revisao })
        });
        mostrarMensagem("Campo removido com sucesso.");
        await carregarCampos(estado.tipoCamposSelecionado);
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
        mostrarConflitoDeRevisao(erro, "/administracao.html");
    }
}

// Função: Reconstrói a lista visual de categorias e vincula suas ações de manutenção.
function renderizarCategorias() {
    elementos.listaCategorias.replaceChildren();
    elementos.totalCategorias.textContent = estado.categorias.length;

    if (estado.categorias.length === 0) {
        mostrarListaVazia(
            elementos.listaCategorias,
            "Nenhuma categoria cadastrada."
        );
        return;
    }

    estado.categorias.forEach((categoria) => {
        const quantidadeTipos = estado.tipos.filter(
            (tipo) => tipo.categoria_id === categoria.id
        ).length;

        elementos.listaCategorias.appendChild(
            criarItemLista(
                `${categoria.icone || "📁"} ${categoria.nome}`,
                `${quantidadeTipos} tipo(s) de ativo${descreverAlteracaoIcone(categoria)}`,
                () => editarCategoria(categoria),
                () => removerCategoria(categoria)
            )
        );
    });
}

// Função: Reconstrói a lista visual de tipos, agrupando-os pelas respectivas categorias.
function renderizarTipos() {
    elementos.listaTipos.replaceChildren();
    elementos.totalTipos.textContent = estado.tipos.length;

    if (estado.tipos.length === 0) {
        mostrarListaVazia(
            elementos.listaTipos,
            "Nenhum tipo de ativo cadastrado."
        );
        return;
    }

    estado.tipos.forEach((tipo) => {
        elementos.listaTipos.appendChild(
            criarItemLista(
                `${tipo.icone || tipo.categoria_icone || "📦"} ${tipo.nome}`,
                `${tipo.categoria_nome} · ${[
                    tipo.permite_emprestimo && "Empréstimo",
                    tipo.permite_checklist && `Checklist ${rotuloRecorrencia(tipo)}`,
                    tipo.permite_vinculo && "Vínculos"
                ].filter(Boolean).join(" · ") || "Somente patrimônio"}${descreverAlteracaoIcone(tipo)}`,
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

// Função: Reconstrói a lista de campos do tipo selecionado com suas propriedades e ações.
function renderizarCampos() {
    elementos.listaCampos.replaceChildren();
    const camposConfiguraveis = estado.campos.filter(
        (campo) => campo.nome !== "patrimonio"
    );
    elementos.totalCampos.textContent = camposConfiguraveis.length + 1;

    const patrimonio = document.createElement("div");
    const conteudoPatrimonio = document.createElement("div");
    const nomePatrimonio = document.createElement("p");
    const detalhePatrimonio = document.createElement("p");
    const seloPatrimonio = document.createElement("span");
    patrimonio.className = "item-lista campo-sistema";
    conteudoPatrimonio.className = "item-conteudo";
    nomePatrimonio.className = "item-nome";
    nomePatrimonio.textContent = "Patrimônio";
    detalhePatrimonio.className = "item-detalhe";
    detalhePatrimonio.textContent = "Campo obrigatório do sistema";
    seloPatrimonio.className = "selo-sistema";
    seloPatrimonio.textContent = "Protegido";
    conteudoPatrimonio.append(nomePatrimonio, detalhePatrimonio);
    patrimonio.append(conteudoPatrimonio, seloPatrimonio);
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

// Função: Busca na API os campos do tipo indicado e atualiza a área de configuração.
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

// Função: Busca categorias e tipos disponíveis e sincroniza os seletores e listas da administração.
async function carregarDados() {
    const [categorias, tipos] = await Promise.all([
        requisicao("/api/categorias"),
        requisicao("/api/tipos")
    ]);

    estado.categorias = categorias;
    estado.tipos = tipos;
    preencherSelectCategorias(elementos.tipoCategoria.value);
    preencherSelectTipos();
    renderizarCategorias();
    renderizarTipos();
}

elementos.formCategoria.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const id = elementos.categoriaId.value;
    const nome = elementos.categoriaNome.value.trim();
    const icone = elementos.categoriaIcone.value.trim();

    try {
        await requisicao(id ? `/api/categorias/${id}` : "/api/categorias", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify({ nome, icone })
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
    const revisaoEdicao = estado.tipoEmEdicao;
    const dados = {
        categoria_id: Number(elementos.tipoCategoria.value),
        nome: elementos.tipoNome.value.trim(),
        icone: elementos.tipoIcone.value.trim(),
        permite_emprestimo: elementos.tipoPermiteEmprestimo.checked,
        permite_vinculo: elementos.tipoPermiteVinculo.checked,
        permite_checklist: elementos.tipoPermiteChecklist.checked,
        checklist_recorrencia: elementos.checklistRecorrencia.value,
        checklist_datas_personalizadas: obterDatasChecklist(),
        checklist_alerta_dias: Number(elementos.checklistAlertaDias.value),
        checklist_modo: elementos.checklistModo.value,
        checklist_itens: elementos.checklistItens.value.split("\n")
            .map((item) => item.trim()).filter(Boolean)
    };
    if (id) {
        if (String(revisaoEdicao?.id) !== id) return mostrarMensagem("Abra novamente o tipo para editar.", true);
        dados.revisao = revisaoEdicao.revisao;
    }

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
        mostrarConflitoDeRevisao(erro, "/administracao.html");
    }
});

elementos.formCampo.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const id = elementos.campoId.value;
    const revisaoEdicao = estado.campoEmEdicao;
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
    if (id) {
        if (String(revisaoEdicao?.id) !== id) return mostrarMensagem("Abra novamente o campo para editar.", true);
        dados.revisao = revisaoEdicao.revisao;
    }

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
        await carregarDados();
    } catch (erro) {
        mostrarMensagem(erro.message, true);
        mostrarConflitoDeRevisao(erro, "/administracao.html");
    }
});

elementos.cancelarCategoria.addEventListener(
    "click",
    cancelarEdicaoCategoria
);
elementos.cancelarTipo.addEventListener("click", cancelarEdicaoTipo);
elementos.tipoPermiteChecklist.addEventListener("change", () => {
    elementos.configuracaoChecklist.classList.toggle(
        "oculto", !elementos.tipoPermiteChecklist.checked
    );
});
elementos.checklistRecorrencia.addEventListener("change", atualizarCamposRecorrencia);
elementos.adicionarDataChecklist.addEventListener("click", () => adicionarLinhaDataChecklist());
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

// Função: Converte um texto em identificador simples, sem acentos ou caracteres incompatíveis.
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

// Função: Valida o acesso administrativo, carrega os dados iniciais e ativa os eventos da página.
async function iniciarAdministracao() {
    await protegerPagina();
    window.EmojiPicker.iniciar();
    await carregarDados();
}

iniciarAdministracao().catch((erro) =>
    mostrarMensagem(erro.message, true)
);
