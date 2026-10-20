(() => {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "/css/style_rodape.css";
    document.head.appendChild(style);

    const page = location.pathname.toLowerCase();
    if (page.endsWith("/ativo.html")) document.body.classList.add("rodape-pagina-ativo");
    if (page.endsWith("/login.html")) document.body.classList.add("rodape-pagina-login");

    const footer = document.createElement("footer");
    footer.className = "rodape-sistema";
    footer.setAttribute("aria-label", "Ajuda e suporte");

    const manual = document.createElement("a");
    manual.href = "/manual.html";
    manual.textContent = "Manual do usuário";
    footer.appendChild(manual);

    const separator = () => {
        const span = document.createElement("span");
        span.className = "rodape-separador";
        span.setAttribute("aria-hidden", "true");
        span.textContent = "·";
        footer.appendChild(span);
    };

    separator();
    const email = document.createElement("span");
    email.textContent = "Ajuda e suporte: procure o administrador da sua instalação";
    footer.appendChild(email);

    separator();
    const version = document.createElement("span");
    version.className = "rodape-versao";
    version.textContent = "Versão —";
    footer.appendChild(version);
    document.body.appendChild(footer);

    fetch("/versao", { cache: "no-store" })
        .then((response) => {
            if (!response.ok) throw new Error("Versão indisponível");
            return response.json();
        })
        .then((data) => {
            if (typeof data.versao === "string" && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(data.versao)) {
                version.textContent = `Versão ${data.versao}`;
            }
        })
        .catch(() => {});
})();
