const NS = "http://www.w3.org/2000/svg";
const estadoMapa = {
    plantas: [],
    planta: null,
    escala: 1,
    x: 0,
    y: 0,
    arrastandoMapa: null,
    ambienteAtivo: null,
    marcadores: new Map(),
    rotulosAmbientes: [],
    camadaMarcadores: null,
    camadaGrupos: null,
    camadaDestaque: null,
    ativoDestacadoId: null
};

const elMapa = {
    seletor: document.getElementById("seletorPlanta"),
    busca: document.getElementById("buscaAtivo"),
    status: document.getElementById("filtroStatus"),
    ambientes: document.getElementById("listaAmbientes"),
    detalhes: document.getElementById("detalhesAtivo"),
    viewport: document.getElementById("viewportMapa"),
    palco: document.getElementById("palcoMapa"),
    svg: document.getElementById("svgMapa"),
    ativosAgrupados: document.getElementById("ativosAgrupados"),
    listaAtivosAgrupados: document.getElementById("listaAtivosAgrupados"),
    painelDetalhes: document.getElementById("painelDetalhes"),
    mensagem: document.getElementById("mensagemMapa"),
    notificacao: document.getElementById("notificacao")
};

async function requisicaoMapa(url, opcoes = {}) {
    const response = await fetch(url, {
        ...opcoes,
        headers: opcoes.body ? { "Content-Type": "application/json" } : undefined
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

function notificar(mensagem, tipo = "sucesso") {
    elMapa.notificacao.textContent = mensagem;
    elMapa.notificacao.className = `notificacao ${tipo === "erro" ? "erro" : ""}`;
    elMapa.notificacao.hidden = false;
    clearTimeout(notificar.timer);
    notificar.timer = setTimeout(() => { elMapa.notificacao.hidden = true; }, 3500);
}

function svgElemento(nome, atributos = {}) {
    const elemento = document.createElementNS(NS, nome);
    Object.entries(atributos).forEach(([chave, valor]) => elemento.setAttribute(chave, valor));
    return elemento;
}

function pontosSvg(poligono, largura, altura) {
    return poligono.map((ponto) => `${ponto.x * largura},${ponto.y * altura}`).join(" ");
}

function pontoDentro(ponto, poligono) {
    let dentro = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        const a = poligono[i];
        const b = poligono[j];
        const cruza = a.y > ponto.y !== b.y > ponto.y &&
            ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x;
        if (cruza) dentro = !dentro;
    }
    return dentro;
}

function aplicarTransformacao() {
    elMapa.palco.style.transform = `translate(${estadoMapa.x}px, ${estadoMapa.y}px) scale(${estadoMapa.escala})`;
    PlantaPDF.atualizar(elMapa.svg);
    atualizarRotulosAmbientes();
}

// Mantém os nomes legíveis sem permitir que cresçam junto com o zoom da planta.
function atualizarRotulosAmbientes() {
    const compensacao = 1 / Math.max(estadoMapa.escala, 1);
    estadoMapa.rotulosAmbientes.forEach(({ elemento, x, y }) => {
        elemento.setAttribute("transform", `translate(${x} ${y}) scale(${compensacao})`);
    });
}

function quebrarRotuloAmbiente(nome, limite = 18) {
    const linhas = [];
    String(nome || "").split(/\s*\/\s*/).forEach((trecho) => {
        let linha = "";
        trecho.split(/\s+/).filter(Boolean).forEach((palavra) => {
            const candidata = linha ? `${linha} ${palavra}` : palavra;
            if (linha && candidata.length > limite) {
                linhas.push(linha);
                linha = palavra;
            } else {
                linha = candidata;
            }
        });
        if (linha) linhas.push(linha);
    });
    return linhas.length ? linhas : ["Ambiente"];
}

function ajustarMapa() {
    if (!estadoMapa.planta) return;
    const margem = 44;
    const largura = elMapa.viewport.clientWidth;
    const altura = elMapa.viewport.clientHeight;
    estadoMapa.escala = Math.min(
        (largura - margem) / estadoMapa.planta.largura,
        (altura - margem) / estadoMapa.planta.altura,
        1.5
    );
    estadoMapa.escala = Math.max(estadoMapa.escala, .08);
    estadoMapa.x = (largura - estadoMapa.planta.largura * estadoMapa.escala) / 2;
    estadoMapa.y = (altura - estadoMapa.planta.altura * estadoMapa.escala) / 2;
    aplicarTransformacao();
    marcarAmbienteAtivo(null);
    atualizarVisualizacaoAtivos();
}

function zoom(fator, centroX = elMapa.viewport.clientWidth / 2, centroY = elMapa.viewport.clientHeight / 2) {
    const anterior = estadoMapa.escala;
    estadoMapa.escala = Math.max(.08, Math.min(6, anterior * fator));
    const proporcao = estadoMapa.escala / anterior;
    estadoMapa.x = centroX - (centroX - estadoMapa.x) * proporcao;
    estadoMapa.y = centroY - (centroY - estadoMapa.y) * proporcao;
    aplicarTransformacao();
    atualizarVisualizacaoAtivos();
}

function focarAmbiente(ambiente) {
    const xs = ambiente.poligono.map((p) => p.x * estadoMapa.planta.largura);
    const ys = ambiente.poligono.map((p) => p.y * estadoMapa.planta.altura);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const largura = Math.max(maxX - minX, 40);
    const altura = Math.max(maxY - minY, 40);
    estadoMapa.escala = Math.min(elMapa.viewport.clientWidth * .78 / largura, elMapa.viewport.clientHeight * .78 / altura, 5);
    estadoMapa.x = elMapa.viewport.clientWidth / 2 - ((minX + maxX) / 2) * estadoMapa.escala;
    estadoMapa.y = elMapa.viewport.clientHeight / 2 - ((minY + maxY) / 2) * estadoMapa.escala;
    aplicarTransformacao();
    marcarAmbienteAtivo(ambiente.id);
    atualizarVisualizacaoAtivos();
}

function marcarAmbienteAtivo(id) {
    estadoMapa.ambienteAtivo = id;
    document.querySelectorAll("[data-ambiente]").forEach((item) => {
        item.classList.toggle("ativo", String(item.dataset.ambiente) === String(id));
    });
}

function iconeAtivo(ativo) {
    return ativo.tipo_icone || ativo.categoria_icone || "📦";
}

function abrirPainelDetalhes() {
    elMapa.painelDetalhes.classList.add("aberto");
}

function mostrarEstadoVazioDetalhes(mensagem = "Clique em um ícone ou agrupamento na planta para visualizar os ativos aqui.") {
    elMapa.detalhes.classList.add("vazio");
    elMapa.detalhes.replaceChildren();
    const conteudo = document.createElement("div");
    conteudo.className = "estado-vazio-detalhes";
    const icone = document.createElement("span");
    icone.setAttribute("aria-hidden", "true");
    icone.textContent = "◎";
    const titulo = document.createElement("strong");
    titulo.textContent = "Nenhum ativo selecionado";
    const texto = document.createElement("p");
    texto.textContent = mensagem;
    conteudo.append(icone, titulo, texto);
    elMapa.detalhes.appendChild(conteudo);
}

function fecharPainelDetalhes() {
    elMapa.painelDetalhes.classList.remove("aberto");
    elMapa.ativosAgrupados.hidden = true;
    mostrarEstadoVazioDetalhes();
    atualizarVisualizacaoAtivos();
}

function transformacaoMarcador(ativo) {
    return `translate(${ativo.x * estadoMapa.planta.largura} ${ativo.y * estadoMapa.planta.altura}) scale(${1 / estadoMapa.escala})`;
}

function mostrarAgrupamento(ativos) {
    abrirPainelDetalhes();
    estadoMapa.ativoDestacadoId = null;
    mostrarEstadoVazioDetalhes("Selecione um ativo da lista acima para consultar seus dados.");
    elMapa.listaAtivosAgrupados.replaceChildren();
    ativos.forEach((ativo) => {
        const botao = document.createElement("button");
        botao.type = "button";
        const icone = document.createElement("span");
        icone.className = "emoji-lista";
        icone.textContent = iconeAtivo(ativo);
        const rotulo = document.createElement("span");
        rotulo.className = "rotulo-lista";
        const patrimonio = document.createElement("strong");
        patrimonio.textContent = ativo.patrimonio;
        const tipo = document.createElement("small");
        tipo.textContent = ativo.tipo_nome;
        rotulo.append(patrimonio, tipo);
        botao.append(icone, rotulo);
        botao.addEventListener("click", () => {
            estadoMapa.ativoDestacadoId = ativo.id;
            elMapa.listaAtivosAgrupados.querySelectorAll("button").forEach((item) => item.classList.remove("ativo"));
            botao.classList.add("ativo");
            mostrarDetalhes(ativo);
            atualizarVisualizacaoAtivos();
        });
        elMapa.listaAtivosAgrupados.appendChild(botao);
    });
    elMapa.ativosAgrupados.hidden = false;
}

// Agrupa apenas marcadores visíveis e próximos na tela, preservando suas posições reais.
function atualizarVisualizacaoAtivos() {
    if (!estadoMapa.planta || !estadoMapa.camadaGrupos) return;
    Array.from(estadoMapa.camadaDestaque.children).forEach((marcador) => estadoMapa.camadaMarcadores.appendChild(marcador));
    estadoMapa.camadaGrupos.replaceChildren();
    const busca = elMapa.busca.value.trim().toLocaleLowerCase("pt-BR");
    const status = elMapa.status.value;
    const grupos = [];

    estadoMapa.planta.ativos.forEach((ativo) => {
        const marcador = estadoMapa.marcadores.get(ativo.id);
        if (!marcador) return;
        marcador.setAttribute("transform", transformacaoMarcador(ativo));
        marcador.classList.remove("destacado");
        const visivel = (!busca || marcador.dataset.busca.includes(busca)) &&
            (!status || marcador.dataset.status === status);
        marcador.classList.toggle("oculto", !visivel);
        if (!visivel || ativo.id === estadoMapa.ativoDestacadoId) return;

        const x = ativo.x * estadoMapa.planta.largura;
        const y = ativo.y * estadoMapa.planta.altura;
        const grupo = grupos.find((item) => item.ambienteId === ativo.ambiente_id &&
            Math.hypot((x - item.x) * estadoMapa.escala, (y - item.y) * estadoMapa.escala) < 42);
        if (grupo) {
            grupo.ativos.push(ativo);
            grupo.x = grupo.ativos.reduce((soma, item) => soma + item.x * estadoMapa.planta.largura, 0) / grupo.ativos.length;
            grupo.y = grupo.ativos.reduce((soma, item) => soma + item.y * estadoMapa.planta.altura, 0) / grupo.ativos.length;
        } else {
            grupos.push({ ambienteId: ativo.ambiente_id, x, y, ativos: [ativo] });
        }
    });

    grupos.filter((grupo) => grupo.ativos.length > 1).forEach((grupo) => {
        grupo.ativos.forEach((ativo) => estadoMapa.marcadores.get(ativo.id).classList.add("oculto"));
        const barra = svgElemento("g", {
            class: "grupo-ativos",
            transform: `translate(${grupo.x} ${grupo.y}) scale(${1 / estadoMapa.escala})`,
            role: "button",
            tabindex: "0",
            "aria-label": `${grupo.ativos.length} ativos neste ponto. Clique para escolher.`
        });
        barra.appendChild(svgElemento("rect", { x: -38, y: -16, width: 76, height: 32, rx: 16 }));
        const amostra = svgElemento("text", { x: -11, y: 1, "font-size": 17 });
        amostra.textContent = grupo.ativos.slice(0, 2).map(iconeAtivo).join("");
        const contagem = svgElemento("text", { x: 25, y: 1, class: "grupo-contagem" });
        contagem.textContent = String(grupo.ativos.length);
        const titulo = svgElemento("title");
        titulo.textContent = `${grupo.ativos.length} ativos. Clique para escolher um item.`;
        barra.append(amostra, contagem, titulo);
        barra.addEventListener("click", (evento) => {
            evento.stopPropagation();
            mostrarAgrupamento(grupo.ativos);
        });
        barra.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                mostrarAgrupamento(grupo.ativos);
            }
        });
        estadoMapa.camadaGrupos.appendChild(barra);
    });

    if (estadoMapa.ativoDestacadoId) {
        const destacado = estadoMapa.marcadores.get(estadoMapa.ativoDestacadoId);
        if (destacado && !destacado.classList.contains("oculto")) {
            destacado.classList.add("destacado");
            estadoMapa.camadaDestaque.appendChild(destacado);
        }
    }
}

function mostrarDetalhes(ativo) {
    abrirPainelDetalhes();
    elMapa.detalhes.classList.remove("vazio");
    elMapa.detalhes.replaceChildren();
    const titulo = document.createElement("h2");
    titulo.textContent = `${iconeAtivo(ativo)} ${ativo.patrimonio}`;
    const lista = document.createElement("dl");
    const campos = [
        ["Tipo", ativo.tipo_nome], ["Categoria", ativo.categoria_nome],
        ["Setor", ativo.setor_nome], ["Status", ativo.status_nome || ativo.status]
    ];
    campos.forEach(([rotulo, valor], indice) => {
        const dt = document.createElement("dt"); const dd = document.createElement("dd");
        dt.textContent = rotulo; dd.textContent = valor || "—";
        if (indice === 3) { dd.className = "status-pill"; dd.style.setProperty("--cor-status", ativo.status_cor); }
        lista.append(dt, dd);
    });
    elMapa.detalhes.append(titulo, lista);
}

function coordenadaDoEvento(evento) {
    const ponto = elMapa.svg.createSVGPoint();
    ponto.x = evento.clientX; ponto.y = evento.clientY;
    const convertido = ponto.matrixTransform(elMapa.svg.getScreenCTM().inverse());
    return { x: convertido.x / estadoMapa.planta.largura, y: convertido.y / estadoMapa.planta.altura };
}

function ativarArrasteAtivo(grupo, ativo, ambiente) {
    grupo.addEventListener("pointerdown", (evento) => {
        evento.preventDefault(); evento.stopPropagation();
        if (!Number.isSafeInteger(Number(ativo.revisao)) || Number(ativo.revisao) < 1) {
            notificar("Atualize a planta antes de mover este ativo novamente.", "erro");
            return;
        }
        mostrarDetalhes(ativo);
        grupo.setPointerCapture(evento.pointerId);
        const inicial = { x: ativo.x, y: ativo.y, revisao: ativo.revisao };
        let ultima = inicial;
        const mover = (movimento) => {
            const ponto = coordenadaDoEvento(movimento);
            if (!pontoDentro(ponto, ambiente.poligono)) return;
            ultima = ponto;
            grupo.setAttribute("transform", `translate(${ponto.x * estadoMapa.planta.largura} ${ponto.y * estadoMapa.planta.altura}) scale(${1 / estadoMapa.escala})`);
        };
        const limparEventos = () => {
            grupo.removeEventListener("pointermove", mover);
            grupo.removeEventListener("pointerup", terminar);
            grupo.removeEventListener("pointercancel", cancelar);
        };
        const terminar = async () => {
            limparEventos();
            if (ultima.x === inicial.x && ultima.y === inicial.y) return;
            try {
                const resultado = await requisicaoMapa(`/api/mapas/ativos/${ativo.id}/posicao`, {
                    method: "PUT",
                    body: JSON.stringify({ ambiente_id: ambiente.id, x: ultima.x, y: ultima.y, revisao: inicial.revisao })
                });
                if (resultado.grupo_id) {
                    const posicoes = new Map(resultado.posicoes.map(posicao => [posicao.ativo_id, posicao]));
                    estadoMapa.planta.ativos.forEach(membro => {
                        const posicao = posicoes.get(membro.id);
                        if (posicao) {
                            membro.ambiente_id = posicao.ambiente_id;
                            membro.x = posicao.x; membro.y = posicao.y;
                            membro.revisao = null;
                        }
                    });
                    try {
                        await carregarPlanta(estadoMapa.planta.id);
                        notificar(`Grupo ${resultado.grupo_nome} movimentado com ${resultado.posicoes.length} ativos.`);
                    } catch (falhaRecarga) {
                        atualizarVisualizacaoAtivos();
                        notificar("Grupo movimentado. Atualize a planta para continuar a edição.", "erro");
                    }
                } else {
                    ativo.ambiente_id = resultado.ambiente_id;
                    ativo.x = resultado.x; ativo.y = resultado.y;
                    ativo.revisao = resultado.revisao;
                    atualizarVisualizacaoAtivos();
                    notificar("Posição do ativo atualizada.");
                }
            } catch (falha) {
                grupo.setAttribute("transform", transformacaoMarcador(ativo));
                notificar(falha.message, "erro");
                mostrarConflitoDeRevisao(falha,
                    `/ativo.html?unidade=${encodeURIComponent(usuarioAtual.unidade_id)}&ativo=${encodeURIComponent(ativo.id)}`);
            }
        };
        const cancelar = () => {
            limparEventos();
            grupo.setAttribute("transform", transformacaoMarcador(ativo));
        };
        grupo.addEventListener("pointermove", mover);
        grupo.addEventListener("pointerup", terminar);
        grupo.addEventListener("pointercancel", cancelar);
    });
}

function renderizarMapa() {
    const planta = estadoMapa.planta;
    estadoMapa.marcadores.clear();
    estadoMapa.rotulosAmbientes = [];
    estadoMapa.ativoDestacadoId = null;
    elMapa.ativosAgrupados.hidden = true;
    mostrarEstadoVazioDetalhes();
    elMapa.svg.replaceChildren();
    elMapa.svg.setAttribute("width", planta.largura);
    elMapa.svg.setAttribute("height", planta.altura);
    elMapa.svg.setAttribute("viewBox", `0 0 ${planta.largura} ${planta.altura}`);
    elMapa.palco.style.width = `${planta.largura}px`;
    elMapa.palco.style.height = `${planta.altura}px`;
    if (!PlantaPDF.montar(elMapa.svg, planta, () => ({ ...estadoMapa, viewport: elMapa.viewport }), mensagem => notificar(mensagem, "erro"))) {
        elMapa.svg.appendChild(svgElemento("image", { href: planta.imagem_url, width: planta.largura, height: planta.altura }));
    }

    planta.ambientes.forEach((ambiente) => {
        const poligono = svgElemento("polygon", {
            points: pontosSvg(ambiente.poligono, planta.largura, planta.altura),
            fill: ambiente.cor, "fill-opacity": ".10", stroke: ambiente.cor,
            class: "ambiente-poligono", "data-ambiente": ambiente.id
        });
        poligono.addEventListener("click", (evento) => { evento.stopPropagation(); focarAmbiente(ambiente); });
        const rotuloX = ambiente.centro_x * planta.largura;
        const rotuloY = ambiente.centro_y * planta.altura;
        const rotulo = svgElemento("g", { class: "ambiente-rotulo" });
        const textoRotulo = svgElemento("text");
        const linhas = quebrarRotuloAmbiente(ambiente.nome);
        linhas.forEach((linha, indice) => {
            const tspan = svgElemento("tspan", {
                x: 0,
                y: -24 + (indice - (linhas.length - 1) / 2) * 16
            });
            tspan.textContent = linha;
            textoRotulo.appendChild(tspan);
        });
        const tituloRotulo = svgElemento("title");
        tituloRotulo.textContent = ambiente.nome;
        rotulo.append(textoRotulo, tituloRotulo);
        estadoMapa.rotulosAmbientes.push({ elemento: rotulo, x: rotuloX, y: rotuloY });
        rotulo.setAttribute("transform", `translate(${rotuloX} ${rotuloY})`);
        elMapa.svg.append(poligono, rotulo);
    });

    planta.ativos.forEach((ativo) => {
        const ambiente = planta.ambientes.find((item) => item.id === ativo.ambiente_id);
        if (!ambiente) return;
        const raio = 17;
        const grupo = svgElemento("g", {
            class: "marcador-ativo", transform: transformacaoMarcador(ativo),
            "data-status": ativo.status, "data-busca": `${ativo.patrimonio} ${ativo.tipo_nome} ${ativo.categoria_nome}`.toLocaleLowerCase("pt-BR")
        });
        const circulo = svgElemento("circle", {
            r: raio,
            fill: "#ffffff",
            stroke: ativo.status_cor || "#1769e0"
        });
        const texto = svgElemento("text", { "font-size": 18 });
        texto.textContent = iconeAtivo(ativo);
        const titulo = svgElemento("title"); titulo.textContent = `${ativo.patrimonio} — ${ativo.tipo_nome}`;
        grupo.append(circulo, texto, titulo);
        grupo.addEventListener("click", (evento) => {
            evento.stopPropagation();
            estadoMapa.ativoDestacadoId = ativo.id;
            elMapa.ativosAgrupados.hidden = true;
            mostrarDetalhes(ativo);
            atualizarVisualizacaoAtivos();
        });
        ativarArrasteAtivo(grupo, ativo, ambiente);
        estadoMapa.marcadores.set(ativo.id, grupo);
    });
    estadoMapa.camadaMarcadores = svgElemento("g", { class: "camada-marcadores" });
    estadoMapa.camadaGrupos = svgElemento("g", { class: "camada-grupos" });
    estadoMapa.camadaDestaque = svgElemento("g", { class: "camada-destaque" });
    estadoMapa.marcadores.forEach((marcador) => estadoMapa.camadaMarcadores.appendChild(marcador));
    elMapa.svg.append(estadoMapa.camadaMarcadores, estadoMapa.camadaGrupos, estadoMapa.camadaDestaque);
    renderizarAmbientes();
    preencherStatus();
    filtrarAtivos();
    requestAnimationFrame(ajustarMapa);
}

function renderizarAmbientes() {
    elMapa.ambientes.replaceChildren();
    estadoMapa.planta.ambientes.forEach((ambiente) => {
        const botao = document.createElement("button");
        botao.type = "button"; botao.className = "ambiente-item"; botao.dataset.ambiente = ambiente.id;
        const cor = document.createElement("span"); cor.className = "ambiente-cor"; cor.style.background = ambiente.cor;
        const nome = document.createElement("span"); nome.textContent = ambiente.nome;
        const total = document.createElement("span"); total.className = "ambiente-contagem"; total.textContent = ambiente.total_ativos;
        botao.append(cor, nome, total); botao.addEventListener("click", () => focarAmbiente(ambiente));
        elMapa.ambientes.appendChild(botao);
    });
}

function preencherStatus() {
    const atual = elMapa.status.value;
    const unicos = new Map(estadoMapa.planta.ativos.map((ativo) => [ativo.status, ativo.status_nome || ativo.status]));
    elMapa.status.replaceChildren(new Option("Todos", ""));
    unicos.forEach((nome, codigo) => elMapa.status.appendChild(new Option(nome, codigo)));
    elMapa.status.value = atual;
}

function filtrarAtivos() {
    atualizarVisualizacaoAtivos();
}

async function carregarPlanta(id) {
    elMapa.mensagem.hidden = false;
    let planta;
    try { planta = await requisicaoMapa(`/api/mapas/${id}`); }
    finally { elMapa.mensagem.hidden = true; }
    estadoMapa.planta = planta;
    elMapa.viewport.hidden = false;
    renderizarMapa();
}

async function iniciarMapa() {
    await protegerPagina();
    estadoMapa.plantas = await requisicaoMapa("/api/mapas");
    elMapa.seletor.replaceChildren();
    if (!estadoMapa.plantas.length) {
        elMapa.mensagem.textContent = "Nenhuma planta foi configurada. Um administrador pode criar a primeira planta em “Configurar plantas”.";
        return;
    }
    estadoMapa.plantas.forEach((planta) => elMapa.seletor.appendChild(new Option(planta.nome, planta.id)));
    await carregarPlanta(estadoMapa.plantas[0].id);
}

elMapa.seletor.addEventListener("change", () => carregarPlanta(elMapa.seletor.value).catch((e) => notificar(e.message, "erro")));
elMapa.busca.addEventListener("input", filtrarAtivos);
elMapa.status.addEventListener("change", filtrarAtivos);
document.getElementById("zoomMais").addEventListener("click", () => zoom(1.25));
document.getElementById("zoomMenos").addEventListener("click", () => zoom(.8));
document.getElementById("ajustarMapa").addEventListener("click", ajustarMapa);
document.getElementById("verPlantaInteira").addEventListener("click", ajustarMapa);
elMapa.viewport.addEventListener("wheel", (evento) => { evento.preventDefault(); const r = elMapa.viewport.getBoundingClientRect(); zoom(evento.deltaY < 0 ? 1.12 : .89, evento.clientX - r.left, evento.clientY - r.top); }, { passive: false });
elMapa.viewport.addEventListener("pointerdown", (evento) => {
    if (evento.target.closest(".marcador-ativo, .grupo-ativos")) return;
    estadoMapa.arrastandoMapa = { x: evento.clientX, y: evento.clientY, origemX: estadoMapa.x, origemY: estadoMapa.y };
    elMapa.viewport.classList.add("arrastando"); elMapa.viewport.setPointerCapture(evento.pointerId);
});
elMapa.viewport.addEventListener("pointermove", (evento) => {
    if (!estadoMapa.arrastandoMapa) return;
    estadoMapa.x = estadoMapa.arrastandoMapa.origemX + evento.clientX - estadoMapa.arrastandoMapa.x;
    estadoMapa.y = estadoMapa.arrastandoMapa.origemY + evento.clientY - estadoMapa.arrastandoMapa.y;
    aplicarTransformacao();
});
elMapa.viewport.addEventListener("pointerup", () => { estadoMapa.arrastandoMapa = null; elMapa.viewport.classList.remove("arrastando"); });
elMapa.viewport.addEventListener("pointercancel", () => { estadoMapa.arrastandoMapa = null; elMapa.viewport.classList.remove("arrastando"); });
window.addEventListener("resize", () => { if (estadoMapa.planta) ajustarMapa(); });
document.getElementById("fecharGrupo").addEventListener("click", () => {
    elMapa.ativosAgrupados.hidden = true;
});
document.getElementById("fecharPainelDetalhes").addEventListener("click", fecharPainelDetalhes);

iniciarMapa().catch((falha) => { elMapa.mensagem.textContent = falha.message; notificar(falha.message, "erro"); });
