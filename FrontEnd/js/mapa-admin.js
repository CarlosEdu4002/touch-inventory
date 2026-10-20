const NS_MAPA = "http://www.w3.org/2000/svg";
const adminMapa = {
    plantas: [], planta: null, setores: [], pontos: [], editando: null,
    escala: 1, escalaAjustada: 1, x: 0, y: 0,
    arrastandoPlanta: null, verticeArrastado: null,
    espacoPressionado: false, ignorarClique: false
};
const $ = (id) => document.getElementById(id);

async function apiMapa(url, opcoes = {}) {
    const resposta = await fetch(url, { ...opcoes, headers: opcoes.body ? { "Content-Type": "application/json" } : undefined });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Operação não concluída");
    return dados;
}

function aviso(texto, erro = false) {
    const elemento = $("notificacao"); elemento.textContent = texto;
    elemento.className = `notificacao ${erro ? "erro" : ""}`; elemento.hidden = false;
    clearTimeout(aviso.timer); aviso.timer = setTimeout(() => { elemento.hidden = true; }, 3500);
}

function svgAdmin(nome, atributos = {}) {
    const elemento = document.createElementNS(NS_MAPA, nome);
    Object.entries(atributos).forEach(([chave, valor]) => elemento.setAttribute(chave, valor));
    return elemento;
}

function limitarEscalaEditor(escala) {
    return Math.max(adminMapa.escalaAjustada * .5, Math.min(Math.max(8, adminMapa.escalaAjustada * 16), escala));
}

function aplicarVistaEditor() {
    $("palcoEditor").style.transform = `translate(${adminMapa.x}px, ${adminMapa.y}px) scale(${adminMapa.escala})`;
    PlantaPDF.atualizar($("svgEditor"));
    $("escalaEditor").textContent = `${Math.round(adminMapa.escala * 100)}%`;
    $("svgEditor").querySelectorAll(".ponto-editor").forEach((ponto) => {
        ponto.setAttribute("r", 4.5 / adminMapa.escala);
    });
    $("svgEditor").querySelectorAll(".alvo-vertice-editor").forEach((alvo) => {
        alvo.setAttribute("r", 11 / adminMapa.escala);
    });
}

function ajustarEditor() {
    if (!adminMapa.planta || $("viewportEditor").hidden) return;
    const viewport = $("viewportEditor");
    adminMapa.escalaAjustada = Math.max(.001, Math.min(
        (viewport.clientWidth - 48) / adminMapa.planta.largura,
        (viewport.clientHeight - 48) / adminMapa.planta.altura,
        1.5
    ));
    adminMapa.escala = adminMapa.escalaAjustada;
    adminMapa.x = (viewport.clientWidth - adminMapa.planta.largura * adminMapa.escala) / 2;
    adminMapa.y = (viewport.clientHeight - adminMapa.planta.altura * adminMapa.escala) / 2;
    aplicarVistaEditor();
}

function zoomEditor(fator, centroX, centroY) {
    if (!adminMapa.planta) return;
    const viewport = $("viewportEditor");
    const x = centroX ?? viewport.clientWidth / 2;
    const y = centroY ?? viewport.clientHeight / 2;
    const anterior = adminMapa.escala;
    const nova = limitarEscalaEditor(anterior * fator);
    if (nova === anterior) return;
    const proporcao = nova / anterior;
    adminMapa.x = x - (x - adminMapa.x) * proporcao;
    adminMapa.y = y - (y - adminMapa.y) * proporcao;
    adminMapa.escala = nova;
    aplicarVistaEditor();
}

function focarAmbienteEditor(ambiente) {
    if (!adminMapa.planta || !ambiente.poligono?.length) return;
    const xs = ambiente.poligono.map((ponto) => ponto.x * adminMapa.planta.largura);
    const ys = ambiente.poligono.map((ponto) => ponto.y * adminMapa.planta.altura);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const viewport = $("viewportEditor");
    adminMapa.escala = limitarEscalaEditor(Math.min(
        viewport.clientWidth * .68 / Math.max(maxX - minX, 24),
        viewport.clientHeight * .68 / Math.max(maxY - minY, 24)
    ));
    adminMapa.x = viewport.clientWidth / 2 - (minX + maxX) / 2 * adminMapa.escala;
    adminMapa.y = viewport.clientHeight / 2 - (minY + maxY) / 2 * adminMapa.escala;
    aplicarVistaEditor();
}

function pontoNormalizadoEditor(evento) {
    const svg = $("svgEditor");
    const ponto = svg.createSVGPoint();
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    const local = ponto.matrixTransform(svg.getScreenCTM().inverse());
    return {
        x: Math.max(0, Math.min(1, local.x / adminMapa.planta.largura)),
        y: Math.max(0, Math.min(1, local.y / adminMapa.planta.altura))
    };
}

function abrirFormPlanta(planta = null) {
    $("formPlanta").reset(); $("plantaId").value = planta?.id || "";
    $("plantaNome").value = planta?.nome || ""; $("plantaDescricao").value = planta?.descricao || "";
    $("plantaOrdem").value = planta?.ordem || 0; $("plantaAtiva").checked = planta?.ativo ?? true;
    $("grupoArquivoPlanta").hidden = Boolean(planta); $("plantaArquivo").required = !planta;
    $("tituloFormPlanta").textContent = planta ? "Editar planta" : "Nova planta";
    $("dialogPlanta").showModal();
}

async function arquivoDados(arquivo) {
    if (!arquivo) throw new Error("Selecione o arquivo da planta.");
    if (arquivo.size > 10 * 1024 * 1024) throw new Error("A planta deve ter no máximo 10 MB.");
    const pdf = arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name);
    const tamanhoPDF = pdf ? await PlantaPDF.dimensoes(arquivo) : null;
    return new Promise((resolve, reject) => {
        const leitor = new FileReader(); leitor.onerror = () => reject(new Error("Não foi possível ler a imagem"));
        leitor.onload = () => {
            if (pdf) {
                resolve({ imagem: "data:application/pdf;base64," + leitor.result.split(",")[1], ...tamanhoPDF });
                return;
            }
            const imagem = new Image(); imagem.onerror = () => reject(new Error("Imagem inválida"));
            imagem.onload = () => resolve({ imagem: leitor.result, largura: imagem.naturalWidth, altura: imagem.naturalHeight });
            imagem.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
    });
}

function renderEditor() {
    const svg = $("svgEditor"); const planta = adminMapa.planta;
    svg.replaceChildren(); svg.setAttribute("width", planta.largura); svg.setAttribute("height", planta.altura);
    svg.setAttribute("viewBox", `0 0 ${planta.largura} ${planta.altura}`);
    $("palcoEditor").style.width = `${planta.largura}px`;
    $("palcoEditor").style.height = `${planta.altura}px`;
    if (!PlantaPDF.montar(svg, planta, () => ({ ...adminMapa, viewport: $("viewportEditor") }), mensagem => aviso(mensagem, true))) {
        svg.appendChild(svgAdmin("image", { href: planta.imagem_url, width: planta.largura, height: planta.altura }));
    }
    planta.ambientes.forEach((ambiente) => {
        const poligono = svgAdmin("polygon", {
            points: ambiente.poligono.map((p) => `${p.x * planta.largura},${p.y * planta.altura}`).join(" "),
            fill: ambiente.cor, "fill-opacity": adminMapa.editando?.id === ambiente.id ? ".28" : ".12",
            stroke: ambiente.cor, class: "ambiente-poligono"
        });
        svg.appendChild(poligono);
    });
    if (adminMapa.pontos.length) {
        svg.appendChild(svgAdmin("polyline", {
            points: adminMapa.pontos.map((p) => `${p.x * planta.largura},${p.y * planta.altura}`).join(" "), class: "linha-editor"
        }));
        adminMapa.pontos.forEach((p, indice) => {
            const vertice = svgAdmin("g", { class: "vertice-editor", "data-vertice": indice });
            vertice.appendChild(svgAdmin("circle", {
                cx: p.x * planta.largura, cy: p.y * planta.altura,
                r: 4.5 / adminMapa.escala, class: "ponto-editor"
            }));
            vertice.appendChild(svgAdmin("circle", {
                cx: p.x * planta.largura, cy: p.y * planta.altura,
                r: 11 / adminMapa.escala, class: "alvo-vertice-editor"
            }));
            svg.appendChild(vertice);
        });
    }
    aplicarVistaEditor();
}

function renderListaAmbientes() {
    const lista = $("listaAmbientesAdmin"); lista.replaceChildren();
    adminMapa.planta.ambientes.forEach((ambiente) => {
        const item = document.createElement("div"); item.className = "ambiente-admin-item";
        const nome = document.createElement("strong"); nome.textContent = `${ambiente.nome} · ${ambiente.setor_nome}`;
        const editar = document.createElement("button"); editar.type = "button"; editar.textContent = "Editar";
        editar.addEventListener("click", () => editarAmbiente(ambiente));
        const excluir = document.createElement("button"); excluir.type = "button"; excluir.textContent = "Excluir"; excluir.className = "perigo";
        excluir.addEventListener("click", () => excluirAmbiente(ambiente)); item.append(nome, editar, excluir); lista.appendChild(item);
    });
}

function atualizarPontos() {
    $("contadorPontos").textContent = `${adminMapa.pontos.length} pontos marcados`;
    $("desfazerPonto").disabled = adminMapa.pontos.length === 0;
    renderEditor();
}

function novoAmbiente() {
    adminMapa.editando = null; adminMapa.pontos = []; $("formAmbiente").reset(); $("ambienteId").value = "";
    $("ambienteCor").value = "#2563eb"; $("formAmbiente").hidden = false; atualizarPontos();
}

function editarAmbiente(ambiente) {
    adminMapa.editando = ambiente; adminMapa.pontos = ambiente.poligono.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    $("ambienteId").value = ambiente.id; $("ambienteNome").value = ambiente.nome;
    $("ambienteSetor").value = ambiente.setor_id; $("ambienteCor").value = ambiente.cor; $("ambientePadrao").checked = ambiente.padrao;
    $("formAmbiente").hidden = false; atualizarPontos(); focarAmbienteEditor(ambiente);
}

async function excluirAmbiente(ambiente) {
    if (!confirm(`Excluir o ambiente “${ambiente.nome}”?`)) return;
    await apiMapa(`/api/mapas/ambientes/${ambiente.id}`, { method: "DELETE" }); await carregarPlanta(adminMapa.planta.id); aviso("Ambiente excluído.");
}

async function carregarPlanta(id) {
    adminMapa.planta = await apiMapa(`/api/mapas/${id}`); $("mensagemEditor").hidden = true; $("viewportEditor").hidden = false;
    $("ferramentasEditor").hidden = false;
    $("configuracaoAmbiente").hidden = false; $("acoesPlanta").hidden = false; $("formAmbiente").hidden = true;
    adminMapa.pontos = []; adminMapa.editando = null; renderEditor(); renderListaAmbientes();
    requestAnimationFrame(ajustarEditor);
}

async function carregarListas(selecionar) {
    [adminMapa.plantas, adminMapa.setores] = await Promise.all([apiMapa("/api/mapas"), apiMapa("/api/setores?todos=true")]);
    const seletor = $("seletorPlantaAdmin"); seletor.replaceChildren(new Option("Selecione uma planta", ""));
    adminMapa.plantas.forEach((p) => seletor.appendChild(new Option(p.nome + (p.ativo ? "" : " (inativa)"), p.id)));
    const setores = $("ambienteSetor"); setores.replaceChildren(new Option("Selecione", ""));
    adminMapa.setores.filter((s) => s.ativo).forEach((s) => setores.appendChild(new Option(s.nome, s.id)));
    if (selecionar) { seletor.value = selecionar; await carregarPlanta(selecionar); }
}

$("svgEditor").addEventListener("click", (evento) => {
    if (adminMapa.ignorarClique) { adminMapa.ignorarClique = false; return; }
    if ($("formAmbiente").hidden || !adminMapa.planta || adminMapa.espacoPressionado || evento.button !== 0) return;
    if (evento.target.closest(".vertice-editor")) return;
    adminMapa.pontos.push(pontoNormalizadoEditor(evento));
    atualizarPontos();
});

$("svgEditor").addEventListener("pointerdown", (evento) => {
    const vertice = evento.target.closest(".vertice-editor");
    if (!vertice || $("formAmbiente").hidden || adminMapa.espacoPressionado || evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    adminMapa.verticeArrastado = Number(vertice.dataset.vertice);
    $("svgEditor").setPointerCapture(evento.pointerId);
});

$("svgEditor").addEventListener("pointermove", (evento) => {
    if (adminMapa.verticeArrastado === null) return;
    adminMapa.pontos[adminMapa.verticeArrastado] = pontoNormalizadoEditor(evento);
    atualizarPontos();
});

function encerrarArrasteVertice() {
    if (adminMapa.verticeArrastado === null) return;
    adminMapa.verticeArrastado = null;
    adminMapa.ignorarClique = true;
    window.setTimeout(() => { adminMapa.ignorarClique = false; }, 0);
}

$("svgEditor").addEventListener("pointerup", encerrarArrasteVertice);
$("svgEditor").addEventListener("pointercancel", encerrarArrasteVertice);

$("viewportEditor").addEventListener("wheel", (evento) => {
    if (!adminMapa.planta) return;
    evento.preventDefault();
    const retangulo = $("viewportEditor").getBoundingClientRect();
    const delta = Math.max(-180, Math.min(180, evento.deltaY));
    zoomEditor(Math.exp(-delta * .002), evento.clientX - retangulo.left, evento.clientY - retangulo.top);
}, { passive: false });

$("viewportEditor").addEventListener("pointerdown", (evento) => {
    if (!adminMapa.planta || !(evento.button === 1 || (evento.button === 0 && adminMapa.espacoPressionado))) return;
    evento.preventDefault();
    adminMapa.arrastandoPlanta = {
        x: evento.clientX, y: evento.clientY,
        origemX: adminMapa.x, origemY: adminMapa.y
    };
    $("viewportEditor").classList.add("movendo");
    $("viewportEditor").setPointerCapture(evento.pointerId);
});

$("viewportEditor").addEventListener("pointermove", (evento) => {
    if (!adminMapa.arrastandoPlanta) return;
    adminMapa.x = adminMapa.arrastandoPlanta.origemX + evento.clientX - adminMapa.arrastandoPlanta.x;
    adminMapa.y = adminMapa.arrastandoPlanta.origemY + evento.clientY - adminMapa.arrastandoPlanta.y;
    aplicarVistaEditor();
});

function encerrarArrastePlanta() {
    if (!adminMapa.arrastandoPlanta) return;
    adminMapa.arrastandoPlanta = null;
    $("viewportEditor").classList.remove("movendo");
    adminMapa.ignorarClique = true;
    window.setTimeout(() => { adminMapa.ignorarClique = false; }, 0);
}

$("viewportEditor").addEventListener("pointerup", encerrarArrastePlanta);
$("viewportEditor").addEventListener("pointercancel", encerrarArrastePlanta);

document.addEventListener("keydown", (evento) => {
    if (evento.code !== "Space" || !adminMapa.planta || evento.target.closest?.("input, textarea, select, button")) return;
    evento.preventDefault();
    adminMapa.espacoPressionado = true;
    $("viewportEditor").classList.add("espaco-pressionado");
});
document.addEventListener("keyup", (evento) => {
    if (evento.code !== "Space") return;
    adminMapa.espacoPressionado = false;
    $("viewportEditor").classList.remove("espaco-pressionado");
});
window.addEventListener("blur", () => {
    adminMapa.espacoPressionado = false;
    $("viewportEditor").classList.remove("espaco-pressionado");
});

$("zoomEditorMais").addEventListener("click", () => zoomEditor(1.5));
$("zoomEditorMenos").addEventListener("click", () => zoomEditor(1 / 1.5));
$("ajustarEditor").addEventListener("click", ajustarEditor);
$("zoomEditorReal").addEventListener("click", () => zoomEditor(1 / adminMapa.escala));
$("desfazerPonto").addEventListener("click", () => {
    if (!adminMapa.pontos.length) return;
    adminMapa.pontos.pop();
    atualizarPontos();
});
window.addEventListener("resize", () => { if (adminMapa.planta) ajustarEditor(); });

$("formPlanta").addEventListener("submit", async (evento) => {
    evento.preventDefault(); const id = $("plantaId").value;
    const botao = evento.currentTarget.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
        const dados = { nome: $("plantaNome").value, descricao: $("plantaDescricao").value, ordem: Number($("plantaOrdem").value), ativo: $("plantaAtiva").checked };
        if (!id) Object.assign(dados, await arquivoDados($("plantaArquivo").files[0]));
        const salva = await apiMapa(id ? `/api/mapas/${id}` : "/api/mapas", { method: id ? "PUT" : "POST", body: JSON.stringify(dados) });
        $("dialogPlanta").close(); await carregarListas(salva.id || id); aviso("Planta salva.");
    } catch (falha) { aviso(falha.message, true); }
    finally { botao.disabled = false; }
});

$("formAmbiente").addEventListener("submit", async (evento) => {
    evento.preventDefault(); if (adminMapa.pontos.length < 3) return aviso("Marque pelo menos três pontos.", true);
    const id = $("ambienteId").value;
    await apiMapa(id ? `/api/mapas/ambientes/${id}` : "/api/mapas/ambientes/novo", {
        method: id ? "PUT" : "POST", body: JSON.stringify({ planta_id: adminMapa.planta.id, nome: $("ambienteNome").value, setor_id: Number($("ambienteSetor").value), cor: $("ambienteCor").value, padrao: $("ambientePadrao").checked, poligono: adminMapa.pontos })
    });
    await carregarPlanta(adminMapa.planta.id); aviso("Ambiente salvo e ativos posicionados.");
});

$("novaPlanta").addEventListener("click", () => abrirFormPlanta());
$("editarPlanta").addEventListener("click", () => abrirFormPlanta(adminMapa.planta));
$("cancelarPlanta").addEventListener("click", () => $("dialogPlanta").close());
$("novoAmbiente").addEventListener("click", novoAmbiente);
$("cancelarAmbiente").addEventListener("click", () => { $("formAmbiente").hidden = true; adminMapa.pontos = []; renderEditor(); });
$("redesenharAmbiente").addEventListener("click", () => { adminMapa.pontos = []; atualizarPontos(); });
$("seletorPlantaAdmin").addEventListener("change", (e) => e.target.value && carregarPlanta(e.target.value).catch((falha) => aviso(falha.message, true)));
$("excluirPlanta").addEventListener("click", async () => { if (!confirm(`Excluir a planta “${adminMapa.planta.nome}” e seus ambientes?`)) return; await apiMapa(`/api/mapas/${adminMapa.planta.id}`, { method: "DELETE" }); location.reload(); });

(async () => { await protegerPagina(true); await carregarListas(); })().catch((falha) => aviso(falha.message, true));
