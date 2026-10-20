const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const model = require('../models/mapas.model');
const service = require('../services/mapas.service');

test('cadastro PDF preserva o original, mantém a URL e remove o arquivo ao excluir a planta', async () => {
    const criar = model.criarPlanta, remover = model.removerPlanta;
    const documentos = new Map();
    model.criarPlanta = async dados => { const planta = { ...dados, id: documentos.size + 1 }; documentos.set(planta.id, planta); return planta; };
    model.removerPlanta = async id => { const planta = documentos.get(id); documentos.delete(id); return planta; };
    const diretorio = path.resolve(__dirname, '../../../uploads/plantas');
    try {
        const bytes = Buffer.from('%PDF-1.7\nconteudo original da planta\n%%EOF');
        const planta = await service.criar({ nome: 'Teste PDF', imagem: 'data:application/pdf;base64,' + bytes.toString('base64'), largura: 1200, altura: 800 }, { id: 1 });
        assert.match(planta.imagem_url, /^\/uploads\/plantas\/[\w-]+\.pdf$/);
        assert.deepEqual(await fs.readFile(path.join(diretorio, planta.arquivo)), bytes);
        await service.remover(planta.id);
        await assert.rejects(fs.access(path.join(diretorio, planta.arquivo)), { code: 'ENOENT' });

        // O suporte a PDF não deve permitir formatos disfarçados nem exceder o limite atual.
        const base = { nome: 'Inválido', largura: 1200, altura: 800 };
        await assert.rejects(service.criar({ ...base, imagem: 'data:application/pdf;base64,' + Buffer.from('nao e PDF').toString('base64') }, { id: 1 }), /não corresponde/);
        const grande = Buffer.alloc(10 * 1024 * 1024 + 1); grande.write('%PDF-');
        await assert.rejects(service.criar({ ...base, imagem: 'data:application/pdf;base64,' + grande.toString('base64') }, { id: 1 }), /10 MB/);
        // Confirme também o fluxo existente de imagens.
        const png = Buffer.from('89504e470d0a1a0a', 'hex');
        const imagem = await service.criar({ ...base, imagem: 'data:image/png;base64,' + png.toString('base64') }, { id: 1 });
        assert.match(imagem.arquivo, /\.png$/); await service.remover(imagem.id);
    } finally {
        for (const planta of documentos.values()) await fs.unlink(path.join(diretorio, planta.arquivo)).catch(() => {});
        model.criarPlanta = criar; model.removerPlanta = remover;
    }
});
