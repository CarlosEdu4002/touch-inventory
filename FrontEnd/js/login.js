// =====================
// Estado e configurações da interface
// =====================

const areaLogin = document.getElementById("areaLogin");
const areaConfiguracao = document.getElementById("areaConfiguracao");
const formLogin = document.getElementById("formLogin");
const formConfiguracao = document.getElementById("formConfiguracao");
const mensagem = document.getElementById("mensagemLogin");

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
        throw new Error(dados.erro || "Não foi possível continuar");
    }

    return dados;
}

// Função: Exibe no formulário de acesso a mensagem correspondente ao erro ocorrido.
function mostrarErro(erro) {
    mensagem.textContent = erro.message;
    mensagem.classList.remove("oculto");
}

// Função: Encaminha o usuário autenticado para a página permitida pelo seu perfil.
function redirecionar() {
    const retorno = new URLSearchParams(window.location.search).get(
        "retorno"
    );
    let destino = "/index.html";
    if (retorno && retorno.startsWith("/") && !retorno.startsWith("//") &&
        !/[\\\u0000-\u0020\u007f]/.test(retorno)) {
        const url = new URL(retorno, window.location.origin);
        const paginas = new Set([
            "/index.html", "/ativo.html", "/exibeAtivos.html", "/administracao.html",
            "/checklists.html", "/exportacoes.html", "/gestao.html", "/grupos.html",
            "/mapa.html", "/mapa-admin.html", "/lixeira.html"
        ]);
        if (url.origin === window.location.origin &&
            paginas.has(url.pathname)) {
            destino = `${url.pathname}${url.search}${url.hash}`;
        }
    }
    window.location.replace('/unidades.html?retorno=' + encodeURIComponent(destino));
}

// Função: Verifica a configuração e a sessão existentes para preparar o fluxo inicial da página.
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

    const login = document.getElementById("loginAdmin").value;
    const senha = document.getElementById("senhaAdmin").value;

    try {
        await requisicao("/api/auth/configurar", {
            method: "POST",
            body: JSON.stringify({
                nome: document.getElementById("nomeAdmin").value,
                login,
                senha
            })
        });
        await requisicao("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ login, senha })
        });
        redirecionar();
    } catch (erro) {
        mostrarErro(erro);
    }
});
iniciar().catch(mostrarErro);
