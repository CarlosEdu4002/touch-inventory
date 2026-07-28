let usuarioAtual = null;

async function obterUsuarioAtual() {
    if (usuarioAtual) {
        return usuarioAtual;
    }

    const response = await fetch("/api/auth/me");

    if (!response.ok) {
        return null;
    }

    const dados = await response.json();
    usuarioAtual = dados.usuario;
    return usuarioAtual;
}

async function protegerPagina(apenasAdmin = false) {
    const usuario = await obterUsuarioAtual();

    if (!usuario) {
        const retorno = encodeURIComponent(
            `${window.location.pathname}${window.location.search}`
        );
        window.location.replace(`/login.html?retorno=${retorno}`);
        throw new Error("Autenticação necessária");
    }

    if (apenasAdmin && usuario.perfil !== "admin") {
        window.location.replace("/index.html");
        throw new Error("Acesso restrito ao administrador");
    }

    document.querySelectorAll("[data-admin]").forEach((elemento) => {
        elemento.hidden = usuario.perfil !== "admin";
    });

    const identificacao = document.getElementById("usuarioSessao");
    if (identificacao) {
        identificacao.textContent =
            usuario.perfil === "admin"
                ? usuario.nome
                : usuario.setor_nome;
    }

    const botaoSair = document.getElementById("btnSair");
    if (botaoSair && !botaoSair.dataset.configurado) {
        botaoSair.dataset.configurado = "true";
        botaoSair.addEventListener("click", sair);
    }

    return usuario;
}

async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    usuarioAtual = null;
    window.location.replace("/login.html");
}
