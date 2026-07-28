const estadoGestao = { usuarios: [], status: [], setores: [] };

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

function dataAcesso(valor) {
    return valor
        ? new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short"
          }).format(new Date(valor))
        : "Nunca acessou";
}

function renderUsuarios() {
    const lista = document.getElementById("listaUsuarios");
    lista.innerHTML = "";
    estadoGestao.usuarios.forEach((usuario) => {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `
            <div class="card-topo">
                <div><strong>${usuario.nome}</strong><span>@${usuario.login}</span></div>
                <span class="selo ${usuario.ativo ? "ativo" : "inativo"}">${
                    usuario.ativo ? "Ativo" : "Bloqueado"
                }</span>
            </div>
            <p>${usuario.setor_nome || "Administrador"}</p>
            <p>Último acesso: ${dataAcesso(usuario.ultimo_acesso)}</p>
            <p>${usuario.sessoes_ativas} sessão(ões) ativa(s)</p>
            <div class="card-acoes">
                <button type="button" data-editar="${usuario.id}">Editar / senha</button>
                <button type="button" class="secundario" data-sessoes="${usuario.id}">Encerrar sessões</button>
            </div>`;
        lista.appendChild(card);
    });
}

function renderStatus() {
    const lista = document.getElementById("listaStatus");
    lista.innerHTML = "";
    estadoGestao.status.forEach((status) => {
        const card = document.createElement("article");
        card.className = "card status-card";
        card.innerHTML = `
            <span class="cor" style="background:${status.cor}"></span>
            <div><strong>${status.nome}</strong><p>${status.codigo}</p></div>
            <span class="selo ${status.ativo ? "ativo" : "inativo"}">${
                status.ativo ? "Ativo" : "Inativo"
            }</span>
            <button type="button" data-status="${status.codigo}">Editar</button>`;
        lista.appendChild(card);
    });
}

function renderSetores() {
    const lista = document.getElementById("listaSetores");
    lista.innerHTML = "";
    estadoGestao.setores.forEach((setor) => {
        const card = document.createElement("article");
        card.className = "card status-card";
        card.innerHTML = `
            <div>
                <strong>${setor.nome}</strong>
                <p>Opção de alocação</p>
            </div>
            <span class="selo ${setor.ativo ? "ativo" : "inativo"}">${
                setor.ativo ? "Ativo" : "Inativo"
            }</span>
            <button type="button" data-setor="${setor.id}">Editar</button>`;
        lista.appendChild(card);
    });
}

function preencherSetoresUsuario() {
    const select = document.getElementById("usuarioSetor");
    select.innerHTML = '<option value="">Selecione um setor</option>';
    estadoGestao.setores
        .filter((setor) => setor.ativo)
        .forEach((setor) => {
            const option = document.createElement("option");
            option.value = setor.id;
            option.textContent = setor.nome;
            select.appendChild(option);
        });
}

function alternarSetorUsuario() {
    const perfil = document.getElementById("usuarioPerfil").value;
    const grupo = document.getElementById("grupoUsuarioSetor");
    const select = document.getElementById("usuarioSetor");
    grupo.hidden = perfil === "admin";
    select.required = perfil === "setor";
}

async function carregar() {
    [
        estadoGestao.usuarios,
        estadoGestao.status,
        estadoGestao.setores
    ] = await Promise.all([
        api("/api/gestao/usuarios"),
        api("/api/gestao/status"),
        api("/api/setores?todos=true")
    ]);
    renderUsuarios();
    renderStatus();
    renderSetores();
    preencherSetoresUsuario();
}

document.addEventListener("click", async (evento) => {
    const editarId = evento.target.dataset.editar;
    const sessoesId = evento.target.dataset.sessoes;
    const codigo = evento.target.dataset.status;
    const setorId = evento.target.dataset.setor;
    if (editarId) {
        const usuario = estadoGestao.usuarios.find(
            (item) => String(item.id) === editarId
        );
        document.getElementById("usuarioId").value = usuario.id;
        document.getElementById("tituloUsuario").textContent = "Editar usuário";
        document.getElementById("grupoUsuarioLogin").hidden = true;
        document.getElementById("grupoUsuarioPerfil").hidden = true;
        document.getElementById("grupoUsuarioSetor").hidden = true;
        document.getElementById("usuarioLogin").required = false;
        document.getElementById("usuarioNome").value = usuario.nome;
        document.getElementById("usuarioSenha").value = "";
        document.getElementById("usuarioSenha").required = false;
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

document.getElementById("novoUsuario").addEventListener("click", () => {
    document.getElementById("formUsuario").reset();
    document.getElementById("usuarioId").value = "";
    document.getElementById("tituloUsuario").textContent = "Adicionar usuário";
    document.getElementById("grupoUsuarioLogin").hidden = false;
    document.getElementById("grupoUsuarioPerfil").hidden = false;
    document.getElementById("usuarioLogin").required = true;
    document.getElementById("usuarioSenha").required = true;
    document.getElementById("usuarioAtivo").checked = true;
    alternarSetorUsuario();
    document.getElementById("dialogUsuario").showModal();
});

document
    .getElementById("usuarioPerfil")
    .addEventListener("change", alternarSetorUsuario);

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
    const id = document.getElementById("usuarioId").value;
    await api(id ? `/api/gestao/usuarios/${id}` : "/api/gestao/usuarios", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
            login: document.getElementById("usuarioLogin").value,
            nome: document.getElementById("usuarioNome").value,
            perfil: document.getElementById("usuarioPerfil").value,
            setor_id: document.getElementById("usuarioSetor").value,
            senha: document.getElementById("usuarioSenha").value || undefined,
            ativo: document.getElementById("usuarioAtivo").checked
        })
    });
    document.getElementById("dialogUsuario").close();
    await carregar();
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
