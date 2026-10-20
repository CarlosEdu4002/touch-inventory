"use strict";

const PDFDocument = require("pdfkit");
const { formatarData } = require("./csv");

const CORES = {
    azul: "#12345b",
    destaque: "#1f65bd",
    texto: "#172033",
    suave: "#64748b",
    borda: "#dce6f2",
    fundo: "#f3f7fc",
    branco: "#ffffff"
};

function textoSeguro(valor) {
    if (valor === null || valor === undefined || valor === "") return "-";
    if (typeof valor === "object") return JSON.stringify(valor);
    return String(valor);
}

function gerarPdf(relatorio) {
    return new Promise((resolve, reject) => {
        const orientacao = relatorio.orientacao === "paisagem"
            ? "landscape"
            : "portrait";
        const doc = new PDFDocument({
            size: "A4",
            layout: orientacao,
            margins: { top: 72, right: 34, bottom: 58, left: 34 },
            bufferPages: true,
            info: {
                Title: relatorio.titulo,
                Author: "Touch Inventory",
                Subject: relatorio.nome
            }
        });
        const partes = [];
        doc.on("data", (parte) => partes.push(parte));
        doc.on("error", reject);
        doc.on("end", () => resolve(Buffer.concat(partes)));

        const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        // A folga adicional impede que o PDFKit crie uma página automática
        // durante a fragmentação de células com texto longo.
        const limiteInferior = () => doc.page.height - doc.page.margins.bottom - 64;

        function desenharCabecalhoPagina() {
            doc.font("Helvetica").fontSize(7.5).fillColor(CORES.suave)
                .text("Touch Inventory - Exportações e Relatórios", 34, 24, {
                    lineBreak: false
                });
            doc.moveTo(34, 40).lineTo(doc.page.width - 34, 40)
                .lineWidth(0.5).strokeColor(CORES.borda).stroke();
            doc.y = doc.page.margins.top;
        }

        function novaPagina() {
            doc.addPage({ size: "A4", layout: orientacao, margins: doc.options.margins });
            desenharCabecalhoPagina();
        }

        function garantirEspaco(altura) {
            if (doc.y + altura > limiteInferior()) novaPagina();
        }

        function tituloSecao(titulo) {
            garantirEspaco(30);
            doc.moveDown(0.45)
                .font("Helvetica-Bold")
                .fontSize(11)
                .fillColor(CORES.azul)
                .text(titulo, { width: largura });
            doc.moveDown(0.35);
        }

        function pares(itens) {
            itens.forEach((item) => {
                garantirEspaco(20);
                const y = doc.y;
                doc.font("Helvetica-Bold").fontSize(8.5).fillColor(CORES.suave)
                    .text(`${item.label}:`, doc.page.margins.left, y, { width: 150 });
                doc.font("Helvetica").fillColor(CORES.texto)
                    .text(textoSeguro(item.valor), doc.page.margins.left + 155, y, {
                        width: largura - 155
                    });
                doc.y = Math.max(doc.y, y + 16);
            });
        }

        function imagens(itens) {
            if (!itens?.length) return;
            const larguraImagem = Math.min(260, (largura - 12) / 2);
            itens.forEach((item, indice) => {
                if (indice % 2 === 0) garantirEspaco(200);
                const coluna = indice % 2;
                const x = doc.page.margins.left + coluna * (larguraImagem + 12);
                const y = coluna ? doc.y - 190 : doc.y;
                doc.font("Helvetica-Bold").fontSize(8).fillColor(CORES.suave)
                    .text(item.rotulo || `Imagem ${indice + 1}`, x, y, { width: larguraImagem });
                try {
                    doc.image(item.arquivo, x, y + 14, { fit: [larguraImagem, 165] });
                } catch (_) {
                    doc.font("Helvetica-Oblique").fontSize(8).fillColor(CORES.suave)
                        .text("Imagem indisponível", x, y + 20, { width: larguraImagem });
                }
                doc.y = coluna ? y + 190 : y + 190;
            });
        }

        function desenharCabecalhoTabela(colunas, y) {
            const soma = colunas.reduce((total, coluna) => total + (coluna.peso || 1), 0);
            let x = doc.page.margins.left;
            doc.rect(x, y, largura, 24).fill(CORES.azul);
            colunas.forEach((coluna) => {
                const w = largura * (coluna.peso || 1) / soma;
                doc.font("Helvetica-Bold").fontSize(7.2).fillColor(CORES.branco)
                    .text(coluna.label, x + 4, y + 7, { width: w - 8, height: 12, ellipsis: true });
                x += w;
            });
            doc.y = y + 24;
        }

        function tabela(colunas, registros) {
            if (!registros.length) {
                garantirEspaco(38);
                doc.font("Helvetica-Oblique").fontSize(9).fillColor(CORES.suave)
                    .text("Nenhum registro encontrado para os filtros informados.", {
                        width: largura
                    });
                return;
            }
            desenharCabecalhoTabela(colunas, doc.y);
            const soma = colunas.reduce((total, coluna) => total + (coluna.peso || 1), 0);
            let linhasNaPagina = 0;
            registros.forEach((registro, indice) => {
                const altura = 22;
                if (linhasNaPagina >= 12 || doc.y + altura > limiteInferior()) {
                    novaPagina();
                    desenharCabecalhoTabela(colunas, doc.y);
                    linhasNaPagina = 0;
                }
                const y = doc.y;
                const margemInferior = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;
                if (indice % 2 === 1) {
                    doc.rect(doc.page.margins.left, y, largura, altura)
                        .fill(CORES.fundo);
                }
                let x = doc.page.margins.left;
                colunas.forEach((coluna) => {
                    const w = largura * (coluna.peso || 1) / soma;
                    const valor = typeof coluna.valor === "function"
                        ? coluna.valor(registro)
                        : registro[coluna.chave];
                    let texto = textoSeguro(valor).replace(/\s+/g, " ");
                    doc.font("Helvetica").fontSize(7.2);
                    if (doc.widthOfString(texto) > w - 8) {
                        while (texto.length > 1 && doc.widthOfString(`${texto}...`) > w - 8) {
                            texto = texto.slice(0, -1);
                        }
                        texto = `${texto.trimEnd()}...`;
                    }
                    doc.font("Helvetica").fontSize(7.2).fillColor(CORES.texto)
                        .text(texto, x + 4, y + 7, {
                            lineBreak: false
                        });
                    x += w;
                });
                doc.page.margins.bottom = margemInferior;
                doc.moveTo(doc.page.margins.left, y + altura)
                    .lineTo(doc.page.margins.left + largura, y + altura)
                    .lineWidth(0.4).strokeColor(CORES.borda).stroke();
                doc.y = y + altura;
                linhasNaPagina += 1;
            });
        }

        desenharCabecalhoPagina();
        doc.font("Helvetica-Bold").fontSize(18).fillColor(CORES.azul)
            .text(relatorio.titulo, { width: largura });
        doc.font("Helvetica").fontSize(10).fillColor(CORES.destaque)
            .text(relatorio.nome, { width: largura });
        doc.moveDown(0.7);
        pares([
            { label: "Gerado em", valor: formatarData(relatorio.geradoEm || new Date()) },
            { label: "Gerado por", valor: relatorio.usuario },
            { label: "Filtros", valor: relatorio.filtros || "Nenhum" }
        ]);

        if (relatorio.resumo?.length) {
            tituloSecao("Resumo");
            pares(relatorio.resumo);
        }
        (relatorio.secoes || []).forEach((secao) => {
            tituloSecao(secao.titulo);
            pares(secao.itens || []);
            imagens(secao.imagens);
        });
        if (relatorio.tabela) {
            tituloSecao(relatorio.tabela.titulo || "Detalhamento");
            tabela(relatorio.tabela.colunas, relatorio.tabela.registros || []);
            if (relatorio.tabela.truncado) {
                doc.moveDown(0.5).font("Helvetica-Oblique").fontSize(8)
                    .fillColor(CORES.suave)
                    .text("A listagem detalhada foi limitada no PDF. Use o CSV para consultar todos os registros.");
            }
        }

        const intervalo = doc.bufferedPageRange();
        for (let i = 0; i < intervalo.count; i += 1) {
            doc.switchToPage(intervalo.start + i);
            const margemInferior = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            const rodape = `Página ${i + 1} de ${intervalo.count}`;
            doc.font("Helvetica").fontSize(7.5).fillColor(CORES.suave);
            doc.text(rodape, doc.page.width - 34 - doc.widthOfString(rodape),
                doc.page.height - 35, { lineBreak: false });
            doc.page.margins.bottom = margemInferior;
        }
        doc.end();
    });
}

module.exports = { gerarPdf };
