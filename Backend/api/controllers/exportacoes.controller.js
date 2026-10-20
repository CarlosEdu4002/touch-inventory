"use strict";

const { ZipArchive } = require("archiver");
const exportacoesModel = require("../models/exportacoes.model");
const exportacoesService = require("../services/exportacoes.service");
const { contentDisposition, nomeArquivo } = require("../utils/arquivo");

const PREFIXOS = {
    inventario: "inventario-ativos",
    setores: "relatorio-setor",
    tipos: "relatorio-tipo",
    categorias: "relatorio-categoria",
    status: "relatorio-status",
    emprestimos: "relatorio-emprestimos",
    historico: "relatorio-historico-movimentacoes",
    checklist: "historico-checklist"
};

function responderErro(res, erro) {
    console.error(erro);
    if (res.headersSent) return res.end();
    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : "Não foi possível gerar a exportação"
    });
}

function headersDownload(res, tipo, nome) {
    res.set({
        "Content-Type": tipo,
        "Content-Disposition": contentDisposition(nome),
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff"
    });
}

async function opcoes(req, res) {
    try {
        const dados = await exportacoesModel.listarOpcoes(req.usuario);
        return res.json({
            ...dados,
            perfil: req.usuario.perfil,
            setor_id: req.usuario.setor_id,
            setor_nome: req.usuario.setor_nome,
            permite_exportacao_completa: req.usuario.perfil === "admin"
        });
    } catch (erro) {
        return responderErro(res, erro);
    }
}

async function relatorio(req, res) {
    try {
        const { relatorio: nomeRelatorio, formato } = req.params;
        const resultado = await exportacoesService.gerarRelatorio(
            nomeRelatorio,
            formato,
            req.query,
            req.usuario
        );
        const detalhe = nomeRelatorio === "checklist" ? req.query.patrimonio
            : nomeRelatorio === "emprestimos" && req.query.situacao && req.query.situacao !== "todos"
                ? req.query.situacao : "";
        const arquivo = nomeArquivo(PREFIXOS[nomeRelatorio] || "relatorio", formato, detalhe);
        headersDownload(
            res,
            formato === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
            arquivo
        );
        res.set("X-Total-Registros", String(resultado.total));
        return res.send(resultado.conteudo);
    } catch (erro) {
        return responderErro(res, erro);
    }
}

async function completa(req, res) {
    try {
        const exportacao = await exportacoesService.gerarExportacaoCompleta(req.usuario);
        const arquivo = nomeArquivo("inventario-exportacao-completa", "zip");
        headersDownload(res, "application/zip", arquivo);
        const zip = new ZipArchive({ zlib: { level: 6 } });
        zip.on("warning", (erro) => console.warn("Aviso ao gerar ZIP:", erro));
        zip.on("error", (erro) => res.destroy(erro));
        zip.pipe(res);
        exportacao.arquivos.forEach((item) => {
            zip.append(item.conteudo, { name: item.nome });
        });
        await zip.finalize();
    } catch (erro) {
        return responderErro(res, erro);
    }
}

module.exports = { completa, opcoes, relatorio };
