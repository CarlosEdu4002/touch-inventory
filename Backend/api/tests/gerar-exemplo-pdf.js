"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { gerarPdf } = require("../utils/pdf");

(async () => {
    const registros = Array.from({ length: 48 }, (_, indice) => ({
        patrimonio: `PAT-${String(indice + 1).padStart(4, "0")}`,
        tipo: indice % 2 ? "Notebook" : "Ferramenta elétrica",
        setor: indice % 3 ? "Tecnologia da Informação" : "Almoxarifado",
        status: indice % 5 ? "Em uso" : "Em manutenção",
        descricao: `Descrição ${indice + 1}: equipamento com observação acentuada, número de série e texto longo para validar a quebra automática sem sobreposição.`
    }));
    const pdf = await gerarPdf({
        titulo: "Relatório de Inventário por Setor",
        nome: "Exemplo de validação visual",
        usuario: "Administrador de demonstração",
        filtros: "Setor: Tecnologia da Informação; Período: 2026-01-01 a 2026-09-24",
        orientacao: "paisagem",
        resumo: [
            { label: "Total de ativos", valor: registros.length },
            { label: "Ativos emprestados", valor: 7 },
            { label: "Empréstimos vencidos", valor: 2 }
        ],
        secoes: [
            { titulo: "Distribuição por status", itens: [
                { label: "Em uso", valor: 38 },
                { label: "Em manutenção", valor: 10 }
            ] }
        ],
        tabela: {
            titulo: "Relação detalhada dos ativos",
            colunas: [
                { chave: "patrimonio", label: "Patrimônio", peso: 1 },
                { chave: "tipo", label: "Tipo de ativo", peso: 1.2 },
                { chave: "setor", label: "Setor", peso: 1.3 },
                { chave: "status", label: "Status", peso: 1 },
                { chave: "descricao", label: "Descrição e observações", peso: 2.7 }
            ],
            registros
        }
    });
    const diretorio = path.join(__dirname, "../output/pdf");
    fs.mkdirSync(diretorio, { recursive: true });
    const destino = path.join(diretorio, "relatorio-validacao-exportacoes.pdf");
    fs.writeFileSync(destino, pdf);
    console.log(destino);
})().catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
});
