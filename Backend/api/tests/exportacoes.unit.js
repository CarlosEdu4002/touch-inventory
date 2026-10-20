"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { gerarCsv, neutralizarFormula } = require("../utils/csv");
const { nomeArquivo } = require("../utils/arquivo");
const { gerarPdf } = require("../utils/pdf");
const {
    colunasAtivos,
    gerarRelatorio,
    normalizarFiltros
} = require("../services/exportacoes.service");
const exportacoesModel = require("../models/exportacoes.model");

test("CSV usa BOM, ponto e vírgula, cabeçalho e UTF-8", () => {
    const csv = gerarCsv([{ chave: "nome", label: "Descrição" }], []);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /^\uFEFF"Descrição"\r\n$/);
});

test("CSV escapa aspas, separadores, quebras e acentos", () => {
    const csv = gerarCsv([{ chave: "valor", label: "Valor" }], [
        { valor: 'ação; "linha"\ncontinuação' }
    ]);
    assert.match(csv, /"ação; ""linha""\ncontinuação"/);
});

test("CSV neutraliza Formula Injection inclusive após espaços", () => {
    ["=1+1", "+cmd", "-2+3", "@SOMA(A1)", "  =HIPERLINK()"].forEach((valor) => {
        assert.equal(neutralizarFormula(valor).startsWith("'"), true);
    });
    assert.equal(neutralizarFormula("texto"), "texto");
});

test("campos personalizados formam união e evitam colisão de labels", () => {
    const colunas = colunasAtivos([
        { tipo_ativo_id: 1, tipo_nome: "Notebook", nome: "serie", label: "Identificação" },
        { tipo_ativo_id: 2, tipo_nome: "Chave", nome: "porta", label: "Identificação" }
    ]);
    const personalizadas = colunas.slice(8);
    assert.deepEqual(personalizadas.map((item) => item.label), [
        "Identificação (Notebook)", "Identificação (Chave)"
    ]);
    assert.equal(personalizadas[0].valor({ tipo_id: 1, dados: { serie: "ABC" } }), "ABC");
    assert.equal(personalizadas[0].valor({ tipo_id: 2, dados: { serie: "ABC" } }), "");
});

test("usuário de setor não pode forçar outro setor", () => {
    assert.throws(
        () => normalizarFiltros({ setor_id: "22" }, { perfil: "setor", setor_id: 11 }, "inventario"),
        (erro) => erro.status === 403
    );
});

test("normalização aceita combinação de filtros válida", () => {
    const filtros = normalizarFiltros({
        patrimonio: "ABC", categoria_id: "2", tipo_id: "3,4", setor_id: "1",
        status: "em_uso", data_inicial: "2026-01-01", data_final: "2026-12-31"
    }, { perfil: "admin", setor_id: null }, "inventario");
    assert.deepEqual(filtros.tipo_ids, [3, 4]);
    assert.equal(filtros.categoria_id, 2);
    assert.equal(filtros.status, "em_uso");
});

test("histórico de checklist exige ativo identificado", () => {
    assert.throws(() => normalizarFiltros({}, { perfil: "admin" }, "checklist"),
        (erro) => erro.status === 400);
});

test("histórico de checklist inclui cada resposta e observação no CSV e gera PDF", async () => {
    const listarOpcoes = exportacoesModel.listarOpcoes;
    const listarChecklist = exportacoesModel.listarChecklist;
    exportacoesModel.listarOpcoes = async () => ({
        categorias: [], tipos: [], setores: [], status: [], usuarios: []
    });
    exportacoesModel.listarChecklist = async () => ({
        ativo: { patrimonio: "AT-1", tipo_nome: "Notebook" },
        registros: [{
            executado_em: new Date("2026-10-14T14:00:00Z"), data_prevista: "2026-10-14",
            proxima_data: "2026-11-14", resultado: "nao_conforme",
            usuario_nome: "Técnico", observacao: "Bateria viciada", modelo_versao: 2,
            respostas: [{ item: "Bateria", resposta: "nao_conforme" }, { item: "Teclado", resposta: "conforme" }]
        }]
    });
    try {
        const usuario = { perfil: "admin", nome: "Admin", login: "admin" };
        const query = { tipo_checklist_id: "1", patrimonio: "AT-1" };
        const csv = await gerarRelatorio("checklist", "csv", query, usuario);
        assert.equal(csv.total, 1);
        assert.match(csv.conteudo, /Bateria/);
        assert.match(csv.conteudo, /Teclado/);
        assert.match(csv.conteudo, /Bateria viciada/);
        assert.match(csv.conteudo, /Não conforme/);
        const pdf = await gerarRelatorio("checklist", "pdf", query, usuario);
        assert.equal(pdf.total, 1);
        assert.equal(pdf.conteudo.subarray(0, 4).toString(), "%PDF");
    } finally {
        exportacoesModel.listarOpcoes = listarOpcoes;
        exportacoesModel.listarChecklist = listarChecklist;
    }
});

test("nome de arquivo é descritivo e compatível com Windows", () => {
    const nome = nomeArquivo("Relatório: Setor / Almoxarifado", "pdf", "Ação");
    assert.match(nome, /^relatorio-setor-almoxarifado-acao-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.doesNotMatch(nome, /[<>:"/\\|?*]/);
});

test("PDF extenso é válido, paginado e suporta textos longos", async () => {
    const registros = Array.from({ length: 180 }, (_, indice) => ({
        patrimonio: `PAT-${indice + 1}`,
        descricao: `Descrição acentuada ${indice + 1}: ` + "texto longo com çãõ ".repeat(12)
    }));
    const pdf = await gerarPdf({
        titulo: "Relatório de Validação",
        nome: "Paginação e textos longos",
        usuario: "Usuário de Teste",
        filtros: "Nenhum",
        resumo: [{ label: "Total", valor: registros.length }],
        tabela: {
            colunas: [
                { chave: "patrimonio", label: "Patrimônio", peso: 1 },
                { chave: "descricao", label: "Descrição", peso: 4 }
            ],
            registros
        }
    });
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const paginas = (pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
    assert.ok(paginas > 1, `esperava mais de uma página, obteve ${paginas}`);
});
