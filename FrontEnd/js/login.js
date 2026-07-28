const areaLogin = document.getElementById("areaLogin");
const areaConfiguracao = document.getElementById("areaConfiguracao");
const formLogin = document.getElementById("formLogin");
const formConfiguracao = document.getElementById("formConfiguracao");
const mensagem = document.getElementById("mensagemLogin");

async function requisicao(url, opcoes = {}) {
    const response = await fetch(url, {
        ...opcoes,
        headers: opcoes.body
            ? { "Content-Type": "application/json" }
            : undefined
    });
    const dados = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(dados.erro || "Não foi possível continuar");
    }

    return dados;
}

function mostrarErro(erro) {
    mensagem.textContent = erro.message;
    mensagem.classList.remove("oculto");
}

function redirecionar() {
    const retorno = new URLSearchParams(window.location.search).get(
        "retorno"
    );
    window.location.replace(
        retorno && retorno.startsWith("/") ? retorno : "/index.html"
    );
}

async function iniciar() {
    const me = await fetch("/api/auth/me");
    if (me.ok) {
        redirecionar();
        return;
    }

    const status = await requisicao("/api/auth/status");
    (status.configurado ? areaLogin : areaConfiguracao).classList.remove(
        "oculto"
    );
}

formLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    mensagem.classList.add("oculto");

    try {
        await requisicao("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                login: document.getElementById("login").value,
                senha: document.getElementById("senha").value
            })
        });
        redirecionar();
    } catch (erro) {
        mostrarErro(erro);
    }
});

formConfiguracao.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    mensagem.classList.add("oculto");

    const senhaAdmin = document.getElementById("senhaAdmin").value;

    try {
        await requisicao("/api/auth/configurar", {
            method: "POST",
            body: JSON.stringify({ senha: senhaAdmin })
        });

        await requisicao("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                login: "admin",
                senha: senhaAdmin
            })
        });
        redirecionar();
    } catch (erro) {
        mostrarErro(erro);
    }
});

iniciar().catch(mostrarErro);
