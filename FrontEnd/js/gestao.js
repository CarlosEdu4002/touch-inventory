// =====================
// Estado e configurações da interface
// =====================

const estadoGestao = { usuarios: [], status: [], setores: [], unidades: [], setoresPorUnidade: {} };

// =====================
// Funções da interface
// =====================

// Função: Executa uma requisição autenticada da gestão e devolve o JSON ou lança o erro informado pela API.
async function api(url, opcoes = {}) {
    const response = await fetch(url, {
        ...opcoes,
        headers: opcoes.body
            ? { "Content-Type": "application/json" }
            : undefined
    });
    const dados = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(dados.erro || "Operação não concluída");
    return dados;
}

// Função: Formata a data do último acesso para exibição local ou informa quando nunca houve acesso.
function dataAcesso(valor) {
    return valor
        ? new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short"
          }).format(new Date(valor))
        : "Nunca acessou";
}

// Cada conta pode atuar em vários setores de várias unidades.
function preencherAcessosUsuario(acessos=[]) {
    const area=document.getElementById("acessosUsuario");
    area.replaceChildren();
    for(const unidade of estadoGestao.unidades) {
        const bloco=criarElemento("div","acesso-unidade");
        const nome=criarElemento("strong","",unidade.nome);
        bloco.append(nome);
        const selecionados=acessos.find(a=>a.unidade_id===unidade.id)?.setores_ids || [];
        const setores=estadoGestao.setoresPorUnidade[unidade.id] || [];
        if(!setores.some(s=>s.ativo))bloco.append(criarElemento("small","","Sem setores ativos; crie setores dentro desta unidade."));
        for(const setor of setores.filter(s=>s.ativo || selecionados.includes(s.id))) {
            const rotulo=document.createElement("label");
            const caixa=document.createElement("input");
            caixa.type="checkbox";caixa.dataset.unidade=unidade.id;caixa.value=setor.id;
            caixa.checked=selecionados.includes(setor.id);
            rotulo.append(caixa,document.createTextNode(setor.nome));
            bloco.append(rotulo);
        }
        area.append(bloco);
    }
}
function acessosMarcados() {
    return estadoGestao.unidades.map(unidade=>({
        unidade_id:unidade.id,
        setores_ids:[...document.querySelectorAll('#acessosUsuario input[data-unidade="'+unidade.id+'"]:checked')].map(x=>Number(x.value))
    })).filter(a=>a.setores_ids.length);
}
function atualizarCampoSetorUsuario() {
    document.getElementById("grupoUsuarioSetor").hidden =
        document.getElementById("usuarioPerfil").value!=="setor";
}

// Função: Limpa o formulário e abre a janela para cadastrar um novo usuário.
function abrirNovoUsuario() {
    document.getElementById("formUsuario").reset();
    document.getElementById("tituloDialogUsuario").textContent =
        "Novo usuário";
    document.getElementById("usuarioId").value = "";
    document.getElementById("usuarioLogin").disabled = false;
    document.getElementById("usuarioPerfil").disabled = false;

    document.getElementById("usuarioSenha").required = true;
    document.getElementById("usuarioSenha").placeholder =
        "Mínimo de 8 caracteres";
    document.getElementById("usuarioAtivo").checked = true;
    preencherAcessosUsuario();
    atualizarCampoSetorUsuario();
    document.getElementById("dialogUsuario").showModal();
}

// Função: Cria um elemento com classe e texto opcionais sem interpretar dados como HTML.
function criarElemento(tag, classe = "", texto = "") {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== "") elemento.textContent = texto;
    return elemento;
}

// Função: Cria o selo visual que informa se um registro está ativo ou inativo.
function criarSelo(ativo, textoAtivo = "Ativo", textoInativo = "Inativo") {
    return criarElemento(
        "span",
        `selo ${ativo ? "ativo" : "inativo"}`,
        ativo ? textoAtivo : textoInativo
    );
}

// Função: Cria um botão de ação e associa seu identificador ao atributo de dados indicado.
function criarBotaoAcao(texto, atributo, valor, classe = "") {
    const botao = criarElemento("button", classe, texto);
    botao.type = "button";
    botao.dataset[atributo] = valor;
    return botao;
}

// Função: Monta os cartões de usuários com perfil, setor, estado, último acesso e ações permitidas.
function renderUsuarios() {
    const lista = document.getElementById("listaUsuarios");
    lista.replaceChildren();

    const termo = document.getElementById("buscaUsuarios").value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const filtrados = estadoGestao.usuarios.filter((usuario) =>
        [usuario.nome, usuario.login].some((valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(termo))
    );
    document.getElementById("resultadoBuscaUsuarios").textContent = termo
        ? filtrados.length + " de " + estadoGestao.usuarios.length + " usuário(s) encontrado(s)" : "";
    filtrados.forEach((usuario) => {
        const card = criarElemento("article", "card");
        const topo = criarElemento("div", "card-topo");
        const identidade = document.createElement("div");
        const nome = criarElemento("strong", "", usuario.nome);
        const login = criarElemento("span", "", `@${usuario.login}`);
        const acoes = criarElemento("div", "card-acoes");

        identidade.append(nome, login);
        topo.append(
            identidade,
            criarSelo(usuario.ativo, "Ativo", "Bloqueado")
        );
        acoes.append(
            criarBotaoAcao("Editar / senha", "editar", usuario.id),
            criarBotaoAcao(
                "Encerrar sessões",
                "sessoes",
                usuario.id,
                "secundario"
            )
        );
        card.append(
            topo,
            criarElemento("p", "", usuario.perfil==="admin" ? "Administrador geral" : (usuario.setores_ids.length ? usuario.setores_ids.map(id=>estadoGestao.setores.find(s=>s.id===id)?.nome||"Setor "+id).join(", ") : "Sem acesso a esta unidade")),
            criarElemento(
                "p",
                "",
                `Último acesso: ${dataAcesso(usuario.ultimo_acesso)}`
            ),
            criarElemento(
                "p",
                "",
                `${usuario.sessoes_ativas} sessão(ões) ativa(s)`
            ),
            acoes
        );
        lista.appendChild(card);
    });
}

// Função: Monta os cartões de status com cor, ordem, situação e ação de edição.
function renderStatus() {
    const lista = document.getElementById("listaStatus");
    lista.replaceChildren();

    estadoGestao.status.forEach((status) => {
        const card = criarElemento("article", "card status-card");
        const cor = criarElemento("span", "cor");
        const dados = document.createElement("div");

        cor.style.backgroundColor = status.cor;
        dados.append(
            criarElemento("strong", "", status.nome),
            criarElemento("p", "", status.codigo)
        );
        card.append(
            cor,
            dados,
            criarSelo(status.ativo),
            criarBotaoAcao("Editar", "status", status.codigo)
        );
        lista.appendChild(card);
    });
}

// Função: Monta os cartões de setores com situação e ação de edição.
function renderSetores() {
    const lista = document.getElementById("listaSetores");
    lista.replaceChildren();

    estadoGestao.setores.forEach((setor) => {
        const card = criarElemento("article", "card status-card");
        const dados = document.createElement("div");

        dados.append(
            criarElemento("strong", "", setor.nome),
            criarElemento("p", "", "Opção de alocação")
        );
        card.append(
            dados,
            criarSelo(setor.ativo),
            criarBotaoAcao("Editar", "setor", setor.id)
        );
        lista.appendChild(card);
    });
}

// Função: Busca os dados do painel de gestão e atualiza usuários, status, setores e indicadores.
async function carregar() {
    [
        estadoGestao.usuarios,
        estadoGestao.status,
        estadoGestao.setores,
        estadoGestao.unidades
    ] = await Promise.all([
        api("/api/gestao/usuarios"),
        api("/api/gestao/status"),
        api("/api/setores?todos=true"),
        api("/api/unidades")
    ]);
    const listas=await Promise.all(estadoGestao.unidades.map(u=>api("/api/unidades/"+u.id+"/setores")));
    estadoGestao.unidades.forEach((u,i)=>estadoGestao.setoresPorUnidade[u.id]=listas[i]);
    renderUsuarios();
    renderStatus();
    renderSetores();
    document.getElementById("novoUsuario").disabled=false;
}

document.getElementById("buscaUsuarios").addEventListener("input", renderUsuarios);

document.addEventListener("click", async (evento) => {
    const editarId = evento.target.dataset.editar;
    const sessoesId = evento.target.dataset.sessoes;
    const codigo = evento.target.dataset.status;
    const setorId = evento.target.dataset.setor;
    if (editarId) {
        const usuario = estadoGestao.usuarios.find(
            (item) => String(item.id) === editarId
        );
        document.getElementById("tituloDialogUsuario").textContent =
            "Editar usuário";
        document.getElementById("usuarioId").value = usuario.id;
        document.getElementById("usuarioNome").value = usuario.nome;
        document.getElementById("usuarioLogin").value = usuario.login;
        document.getElementById("usuarioLogin").disabled = true;
        document.getElementById("usuarioPerfil").value = usuario.perfil;
        document.getElementById("usuarioPerfil").disabled = true;
        const acessos=usuario.perfil==="admin" ? [] :
            await api("/api/gestao/usuarios/"+usuario.id+"/acessos");
        preencherAcessosUsuario(acessos);
        atualizarCampoSetorUsuario();
        document.getElementById("usuarioSenha").value = "";
        document.getElementById("usuarioSenha").required = false;
        document.getElementById("usuarioSenha").placeholder =
            "Deixe vazio para manter";
        document.getElementById("usuarioAtivo").checked = usuario.ativo;
        document.getElementById("dialogUsuario").showModal();
    }
    if (sessoesId && confirm("Encerrar todas as sessões deste usuário?")) {
        await api(`/api/gestao/usuarios/${sessoesId}/encerrar-sessoes`, {
            method: "POST"
        });
        await carregar();
    }
    if (codigo) {
        const status = estadoGestao.status.find(
            (item) => item.codigo === codigo
        );
        document.getElementById("statusCodigo").value = status.codigo;
        document.getElementById("statusNome").value = status.nome;
        document.getElementById("statusCor").value = status.cor;
        document.getElementById("statusOrdem").value = status.ordem;
        document.getElementById("statusAtivo").checked = status.ativo;
        document.getElementById("dialogStatus").showModal();
    }
    if (setorId) {
        const setor = estadoGestao.setores.find(
            (item) => String(item.id) === setorId
        );
        document.getElementById("setorId").value = setor.id;
        document.getElementById("setorNome").value = setor.nome;
        document.getElementById("setorAtivo").checked = setor.ativo;
        document.getElementById("dialogSetor").showModal();
    }
    if (evento.target.dataset.fechar !== undefined) {
        evento.target.closest("dialog").close();
    }
});

document
    .getElementById("novoUsuario")
    .addEventListener("click", abrirNovoUsuario);

document
    .getElementById("usuarioPerfil")
    .addEventListener("change", atualizarCampoSetorUsuario);

document.getElementById("novoStatus").addEventListener("click", () => {
    document.getElementById("formStatus").reset();
    document.getElementById("statusCodigo").value = "";
    document.getElementById("dialogStatus").showModal();
});

document.getElementById("novoSetor").addEventListener("click", () => {
    document.getElementById("formSetor").reset();
    document.getElementById("setorId").value = "";
    document.getElementById("setorAtivo").checked = true;
    document.getElementById("dialogSetor").showModal();
});

document.getElementById("formUsuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        const id=document.getElementById("usuarioId").value;
        const perfil=document.getElementById("usuarioPerfil").value;
        const dados={
            nome:document.getElementById("usuarioNome").value,
            senha:document.getElementById("usuarioSenha").value || undefined,
            ativo:document.getElementById("usuarioAtivo").checked
        };
        if(!id) {
            dados.login=document.getElementById("usuarioLogin").value;
            dados.perfil=perfil;
        }
        if(perfil==="setor") {
            dados.acessos=acessosMarcados();
            if(!dados.acessos.length)
                throw new Error("Marque ao menos um setor em uma unidade.");
        }
        await api(id ? "/api/gestao/usuarios/"+id : "/api/gestao/usuarios",{
            method:id ? "PUT" : "POST",
            body:JSON.stringify(dados)
        });
        document.getElementById("dialogUsuario").close();
        await carregar();
    } catch(erro) { alert(erro.message); }
});

document.getElementById("formStatus").addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo =
        document.getElementById("statusCodigo").value ||
        document
            .getElementById("statusNome")
            .value.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_");
    await api(`/api/gestao/status/${codigo}`, {
        method: "PUT",
        body: JSON.stringify({
            nome: document.getElementById("statusNome").value,
            cor: document.getElementById("statusCor").value,
            ordem: Number(document.getElementById("statusOrdem").value),
            ativo: document.getElementById("statusAtivo").checked
        })
    });
    document.getElementById("dialogStatus").close();
    await carregar();
});

document.getElementById("formSetor").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("setorId").value;
    await api(id ? `/api/setores/${id}` : "/api/setores", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
            nome: document.getElementById("setorNome").value,
            ativo: document.getElementById("setorAtivo").checked
        })
    });
    document.getElementById("dialogSetor").close();
    await carregar();
});

(async () => {
    await protegerPagina(true);
    await carregar();
})().catch((erro) => alert(erro.message));
