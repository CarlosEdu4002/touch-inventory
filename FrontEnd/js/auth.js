// =====================
// Estado e configurações da interface
// =====================

let usuarioAtual = null;
let contextoPagina = null;
let contextoBloqueado = false;
const fetchNativo = window.fetch.bind(window);

function avisarContextoAlterado() {
    if (contextoBloqueado) return;
    contextoBloqueado = true;
    const aviso = document.createElement("div");
    aviso.id = "avisoContextoAlterado";
    aviso.setAttribute("role", "alert");
    const texto = document.createElement("span");
    texto.textContent = "A unidade ou o setor da sessão mudou em outra aba. Esta página foi bloqueada; seu preenchimento permanece aqui. Atualize para continuar.";
    const atualizar = document.createElement("button");
    atualizar.type = "button";
    atualizar.textContent = "Atualizar página";
    atualizar.addEventListener("click", () => window.location.reload());
    const escolher = document.createElement("a");
    escolher.href = "/unidades.html";
    escolher.textContent = "Escolher unidade";
    aviso.append(texto, atualizar, escolher);
    document.body.prepend(aviso);
}

function mostrarConflitoDeRevisao(erro, urlConsulta) {
    if (erro?.status !== 409 || erro.codigo === "CONTEXTO_ALTERADO") return false;
    let aviso = document.getElementById("avisoRevisaoAlterada");
    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "avisoRevisaoAlterada";
        aviso.setAttribute("role", "alert");
        const texto = document.createElement("span");
        const consultar = document.createElement("a");
        consultar.target = "_blank";
        consultar.rel = "noopener noreferrer";
        consultar.textContent = "Consultar dados atuais em outra aba";
        aviso.append(texto, consultar);
        document.body.prepend(aviso);
    }
    aviso.querySelector("span").textContent = erro.message + " O formulário nesta aba permanece preenchido.";
    aviso.querySelector("a").href = urlConsulta || window.location.href;
    return true;
}

async function verificarContextoPagina() {
    if (!contextoPagina || contextoBloqueado) return;
    try {
        const resposta = await fetchNativo("/api/auth/me", { cache: "no-store" });
        if (!resposta.ok) { avisarContextoAlterado(); return; }
        const atual = (await resposta.json()).usuario;
        const chave = [atual.unidade_id, atual.setor_id || 0, atual.contexto_versao].join(":");
        if (chave !== contextoPagina) avisarContextoAlterado();
    } catch (_) {
        // Falha de rede não significa troca de unidade; a API ainda valida cada pedido.
    }
}

function instalarContextoPagina(usuario) {
    if (contextoPagina) return;
    contextoPagina = [usuario.unidade_id, usuario.setor_id || 0, usuario.contexto_versao].join(":");
    window.fetch = async (entrada, opcoes = {}) => {
        const recurso = typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url;
        const url = new URL(recurso, window.location.href);
        const precisaContexto = url.origin === window.location.origin &&
            url.pathname.startsWith("/api/") &&
            (!url.pathname.startsWith("/api/auth/")) &&
            (!url.pathname.startsWith("/api/unidades/") ||
                url.pathname === "/api/unidades/setor/selecionar");
        if (!precisaContexto) return fetchNativo(entrada, opcoes);
        if (contextoBloqueado) {
            return new Response(JSON.stringify({
                codigo: "CONTEXTO_ALTERADO",
                erro: "Atualize a página para usar a unidade ou o setor atual"
            }), { status: 409, headers: { "Content-Type": "application/json" } });
        }
        const headers = new Headers(entrada instanceof Request ? entrada.headers : undefined);
        new Headers(opcoes.headers).forEach((valor, nome) => headers.set(nome, valor));
        headers.set("X-Inventario-Contexto", contextoPagina);
        const resposta = await fetchNativo(entrada, { ...opcoes, headers });
        if (resposta.status === 409) {
            const dados = await resposta.clone().json().catch(() => ({}));
            if (dados.codigo === "CONTEXTO_ALTERADO") avisarContextoAlterado();
        }
        return resposta;
    };
    window.addEventListener("focus", verificarContextoPagina);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) verificarContextoPagina();
    });
}
// Revalida ao restaurar uma página do histórico após logout/revogação.
window.addEventListener("pageshow", (evento) => {
    if (evento.persisted) window.location.reload();
});

// =====================
// Funções da interface
// =====================

// Função: Consulta a sessão ativa e devolve os dados do usuário autenticado.
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

// Função: Bloqueia páginas sem sessão válida e, quando solicitado, restringe o acesso a administradores.
async function protegerPagina(apenasAdmin = false) {
    const usuario = await obterUsuarioAtual();

    if (!usuario) {
        const retorno = encodeURIComponent(
            `${window.location.pathname}${window.location.search}`
        );
        window.location.replace(`/login.html?retorno=${retorno}`);
        throw new Error("Autenticação necessária");
    }

    if (!usuario.unidade_id) {
        const retorno=encodeURIComponent(window.location.pathname+window.location.search);
        window.location.replace("/unidades.html?retorno="+retorno);
        throw new Error("Selecione uma unidade");
    }

    if (apenasAdmin && usuario.perfil !== "admin") {
        window.location.replace("/index.html");
        throw new Error("Acesso restrito ao administrador");
    }

    instalarContextoPagina(usuario);

    document.querySelectorAll("[data-admin]").forEach((elemento) => {
        elemento.hidden = usuario.perfil !== "admin";
    });

    const identificacao = document.getElementById("usuarioSessao");
    if (identificacao) {
        identificacao.textContent =
            usuario.nome+" · "+usuario.unidade_nome+
            (usuario.perfil==="setor" && usuario.setor_nome ? " · "+usuario.setor_nome : "");
    }

    if (!document.getElementById("estiloContextoUnidade")) {
        const estilo = document.createElement("link");
        estilo.id = "estiloContextoUnidade";
        estilo.rel = "stylesheet";
        estilo.href = "/css/style_contexto_unidade.css";
        document.head.append(estilo);
    }

    document.querySelectorAll('img[src="/Imagens/logo.svg"]').forEach((logo) => {
        const origem = logo.getAttribute("src");
        const descricao = logo.alt;
        logo.onerror = () => {
            logo.onerror = null;
            logo.src = origem;
            logo.alt = descricao;
        };
        logo.src = "/api/unidades/" + usuario.unidade_id + "/logo";
        logo.alt = "Logo da unidade " + usuario.unidade_nome;
    });

    if (!document.getElementById("trocarUnidade")) {
        const link=document.createElement("a");
        link.id="trocarUnidade";
        link.href="/unidades.html";
        link.textContent="Trocar unidade";
        const alvo=document.getElementById("btnSair") || identificacao;
        alvo?.parentNode?.insertBefore(link,alvo);
    }
    if(usuario.perfil==="setor" && usuario.setores_ids?.length>1 && !document.getElementById("trocarSetor")) {
        const seletor=document.createElement("select");
        seletor.id="trocarSetor";
        seletor.setAttribute("aria-label","Setor ativo");
        fetch("/api/setores?todos=true").then(r=>r.json()).then(setores=>{
            for(const setor of setores.filter(s=>usuario.setores_ids.includes(s.id))) {
                const opcao=document.createElement("option");
                opcao.value=setor.id;opcao.textContent=setor.nome;
                opcao.selected=setor.id===usuario.setor_id;
                seletor.append(opcao);
            }
        });
        seletor.addEventListener("change",async()=>{
            const r=await fetch("/api/unidades/setor/selecionar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({setor_id:Number(seletor.value)})});
            if(r.ok)window.location.reload();else alert((await r.json()).erro||"Não foi possível trocar setor");
        });
        const alvo=document.getElementById("btnSair") || identificacao;
        alvo?.parentNode?.insertBefore(seletor,alvo);
    }

    const botaoSair = document.getElementById("btnSair");
    if (botaoSair && !botaoSair.dataset.configurado) {
        botaoSair.dataset.configurado = "true";
        botaoSair.addEventListener("click", sair);
    }

    return usuario;
}

// Função: Encerra a sessão no servidor e redireciona o usuário para a página de acesso.
async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    usuarioAtual = null;
    window.location.replace("/login.html");
}
