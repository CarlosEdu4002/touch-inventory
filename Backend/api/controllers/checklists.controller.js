const service = require("../services/checklists.service");
const model = require("../models/checklists.model");
const fs = require("node:fs/promises");
const path = require("node:path");
const DIRETORIO_IMAGENS = path.resolve(__dirname, "../../../uploads/ativos");

function responder(res, erro, padrao) {
    console.error(padrao, erro);
    return res.status(erro.status || 500).json({ erro: erro.message || padrao, ...(erro.codigo ? { codigo: erro.codigo } : {}) });
}

async function listar(req, res) {
    try { return res.json(await service.listar(req.usuario)); }
    catch (erro) { return responder(res, erro, "Erro ao listar checklists"); }
}

async function detalhar(req, res) {
    try {
        return res.json(await service.detalhar(
            req.params.tipo, req.params.patrimonio, req.usuario
        ));
    } catch (erro) { return responder(res, erro, "Erro ao carregar checklist"); }
}

async function executar(req, res) {
    try {
        const execucao = await service.executar(
            req.params.tipo, req.params.patrimonio, req.body, req.usuario
        );
        return res.status(201).json({ mensagem: "Checklist registrado com sucesso", execucao });
    } catch (erro) { return responder(res, erro, "Erro ao registrar checklist"); }
}

async function imagem(req, res) {
    try {
        const { execucao, nome } = req.params;
        if (!/^[1-9]\d*$/.test(execucao) || !/^[A-Za-z0-9_-]+\.(?:jpg|png)$/i.test(nome) ||
            !(await model.imagemPermitida(execucao, nome, req.usuario))) {
            return res.status(404).json({ erro: "Imagem não encontrada" });
        }
        const arquivo = path.join(DIRETORIO_IMAGENS, nome);
        const info = await fs.lstat(arquivo);
        if (!info.isFile() || info.isSymbolicLink() ||
            path.dirname(await fs.realpath(arquivo)) !== await fs.realpath(DIRETORIO_IMAGENS)) {
            return res.status(404).json({ erro: "Imagem não encontrada" });
        }
        res.set("X-Content-Type-Options", "nosniff");
        return res.sendFile(nome, { root: DIRETORIO_IMAGENS, cacheControl:false, lastModified:false, etag:false });
    } catch (erro) {
        if (erro.code === "ENOENT") return res.status(404).json({ erro: "Imagem não encontrada" });
        return responder(res, erro, "Erro ao consultar imagem");
    }
}

module.exports = { listar, detalhar, executar, imagem };
