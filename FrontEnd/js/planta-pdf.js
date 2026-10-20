/* PDF.js local. A planta original é mantida; o canvas é apenas sua visualização. */
window.PlantaPDF = (() => {
    const estados = new WeakMap();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
    const abrir = (data) => pdfjsLib.getDocument({
        ...(typeof data === "string" ? { url: data } : { data }),
        isEvalSupported: false
    });
    const ehPDF = (planta) => /\.pdf(?:$|\?)/i.test(planta.imagem_url);

    async function dimensoes(arquivo) {
        const tarefa = abrir(new Uint8Array(await arquivo.arrayBuffer()));
        try {
            const documento = await tarefa.promise;
            if (documento.numPages !== 1) throw new Error("Use um PDF com uma única página. Exporte a página desejada pelo recortador.");
            const pagina = await documento.getPage(1);
            const viewport = pagina.getViewport({ scale: 4 / 3 });
            return { largura: Math.round(viewport.width), altura: Math.round(viewport.height) };
        } finally { await tarefa.destroy(); }
    }

    function montar(svg, planta, vista, falha) {
        let estado = estados.get(svg);
        if (!ehPDF(planta)) {
            if (estado) { estado.ativo = false; clearTimeout(estado.timer); estado.tarefa.destroy().catch(() => {}); estados.delete(svg); }
            return false;
        }
        if (!estado || estado.url !== planta.imagem_url) {
            if (estado) { estado.ativo = false; clearTimeout(estado.timer); estado.tarefa.destroy().catch(() => {}); }
            const camada = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            camada.style.pointerEvents = "none";
            const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
            canvas.style.display = "block"; camada.append(canvas);
            estado = { url: planta.imagem_url, tarefa: abrir(planta.imagem_url), camada, canvas, ativo: true, planta, vista, falha, revisao: 0 };
            estados.set(svg, estado);
            estado.tarefa.promise.then(async documento => {
                estado.pagina = await documento.getPage(1);
                if (estado.ativo) atualizar(svg);
            }).catch(error => { if (estado.ativo) falha("Não foi possível abrir a planta PDF: " + error.message); });
        }
        // O editor reconstrói os polígonos; reutilize o documento e a camada.
        svg.prepend(estado.camada);
        atualizar(svg);
        return true;
    }

    function atualizar(svg) {
        const estado = estados.get(svg);
        if (!estado) return;
        estado.revisao++;
        clearTimeout(estado.timer);
        estado.timer = setTimeout(() => desenhar(estado), 100);
    }

    async function desenhar(estado) {
        if (!estado.ativo || !estado.pagina) return;
        const revisao = estado.revisao;
        if (estado.render) {
            estado.render.cancel();
            await estado.render.promise.catch(() => {});
            if (revisao !== estado.revisao || !estado.ativo) return;
        }
        const { escala, x, y, viewport: area } = estado.vista();
        const { largura, altura } = estado.planta;
        // Renderize só a região visível: plantas grandes continuam nítidas no zoom.
        const margem = 80 / escala;
        const esquerda = Math.max(0, -x / escala - margem);
        const topo = Math.max(0, -y / escala - margem);
        const direita = Math.min(largura, (area.clientWidth - x) / escala + margem);
        const fundo = Math.min(altura, (area.clientHeight - y) / escala + margem);
        if (direita <= esquerda || fundo <= topo) return;
        const w = direita - esquerda, h = fundo - topo;
        const densidade = Math.min(escala * (window.devicePixelRatio || 1), Math.sqrt(16000000 / (w * h)), 16000 / w, 16000 / h);
        const base = estado.pagina.getViewport({ scale: 1 });
        const pdfViewport = estado.pagina.getViewport({ scale: largura / base.width * densidade });
        // Troque o canvas só quando a nova região estiver pronta, evitando piscar.
        const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        canvas.width = Math.ceil(w * densidade); canvas.height = Math.ceil(h * densidade);
        canvas.style.width = w + "px"; canvas.style.height = h + "px"; canvas.style.display = "block";
        estado.render = estado.pagina.render({
            canvasContext: canvas.getContext("2d"), viewport: pdfViewport,
            transform: [1, 0, 0, altura / (base.height * largura / base.width), -esquerda * densidade, -topo * densidade]
        });
        try {
            await estado.render.promise;
            if (!estado.ativo || revisao !== estado.revisao) return;
            for (const [nome, valor] of Object.entries({ x: esquerda, y: topo, width: w, height: h })) estado.camada.setAttribute(nome, valor);
            estado.camada.replaceChildren(canvas);
        } catch (error) {
            if (estado.ativo && error.name !== "RenderingCancelledException") estado.falha("Não foi possível desenhar a planta PDF: " + error.message);
        }
    }
    return { montar, atualizar, dimensoes };
})();
