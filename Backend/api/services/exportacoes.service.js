"use strict";

const exportacoesModel = require("../models/exportacoes.model");
const { formatarData, gerarCsv } = require("../utils/csv");
const { gerarPdf } = require("../utils/pdf");
const path = require("node:path");

const LIMITE_LINHAS_PDF = 1000;
const RELATORIOS = new Set([
    "inventario", "setores", "tipos", "categorias", "status",
    "emprestimos", "historico", "checklist"
]);

function falha(mensagem, status = 400) {
    const erro = new Error(mensagem);
    erro.status = status;
    return erro;
}

function inteiro(valor, nome) {
    if (valor === undefined || valor === null || valor === "") return null;
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero <= 0) {
        throw falha(`${nome} inválido`);
    }
    return numero;
}

function listaInteiros(valor, nome) {
    if (!valor) return [];
    const itens = (Array.isArray(valor) ? valor : String(valor).split(","))
        .filter((item) => item !== "")
        .map((item) => inteiro(item, nome));
    return [...new Set(itens)];
}

function data(valor, nome) {
    if (!valor) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
        throw falha(`${nome} deve usar o formato AAAA-MM-DD`);
    }
    const analisada = new Date(`${valor}T00:00:00Z`);
    if (Number.isNaN(analisada.getTime())) throw falha(`${nome} inválida`);
    return String(valor);
}

function normalizarFiltros(query, usuario, relatorio) {
    if (!RELATORIOS.has(relatorio)) throw falha("Relatório inválido", 404);
    const filtros = {
        patrimonio: String(query.patrimonio || "").trim().slice(0, 50),
        tipo_checklist_id: inteiro(query.tipo_checklist_id, "Tipo do ativo"),
        categoria_id: inteiro(query.categoria_id, "Categoria"),
        tipo_ids: listaInteiros(query.tipo_id || query.tipo_ids, "Tipo de ativo"),
        setor_id: inteiro(query.setor_id, "Setor"),
        status: String(query.status || "").trim().slice(0, 30),
        data_inicial: data(query.data_inicial, "Data inicial"),
        data_final: data(query.data_final, "Data final"),
        situacao: String(query.situacao || "todos").trim(),
        responsavel: String(query.responsavel || "").trim().slice(0, 150),
        usuario_id: inteiro(query.usuario_id, "Usuário"),
        acao: String(query.acao || "").trim().slice(0, 30),
        detalhado: query.detalhado === "true"
    };
    if (filtros.data_inicial && filtros.data_final && filtros.data_inicial > filtros.data_final) {
        throw falha("A data inicial não pode ser posterior à data final");
    }
    if (relatorio === "checklist" && (!filtros.tipo_checklist_id || !filtros.patrimonio)) {
        throw falha("Selecione o tipo e informe o patrimônio do ativo");
    }
    if (!["todos", "aberto", "vencido", "devolvido"].includes(filtros.situacao)) {
        throw falha("Situação do empréstimo inválida");
    }
    if (usuario.perfil === "setor") {
        if (filtros.setor_id && filtros.setor_id !== Number(usuario.setor_id)) {
            throw falha("O setor solicitado está fora do seu escopo", 403);
        }
        if (filtros.usuario_id || filtros.responsavel) {
            throw falha("Este filtro contém dados pessoais restritos ao administrador", 403);
        }
    }
    return filtros;
}

function colunasAtivos(campos = []) {
    const chavesPorLabel = new Map();
    campos.forEach((campo) => {
        const chave = String(campo.label).trim().toLocaleLowerCase("pt-BR");
        if (!chavesPorLabel.has(chave)) chavesPorLabel.set(chave, new Set());
        chavesPorLabel.get(chave).add(`${campo.tipo_ativo_id}:${campo.nome}`);
    });
    const usadas = new Set();
    const customizadas = campos.map((campo) => {
        const chaveLabel = String(campo.label).trim().toLocaleLowerCase("pt-BR");
        const colide = chavesPorLabel.get(chaveLabel).size > 1;
        let label = colide ? `${campo.label} (${campo.tipo_nome})` : campo.label;
        if (usadas.has(label.toLocaleLowerCase("pt-BR"))) {
            label = `${label} [${campo.nome}]`;
        }
        usadas.add(label.toLocaleLowerCase("pt-BR"));
        return {
            label,
            valor: (ativo) => Number(ativo.tipo_id) === Number(campo.tipo_ativo_id)
                ? ativo.dados?.[campo.nome] ?? ""
                : ""
        };
    });
    return [
        { chave: "patrimonio", label: "Patrimônio" },
        { chave: "categoria_nome", label: "Categoria" },
        { chave: "tipo_nome", label: "Tipo de ativo" },
        { chave: "setor_nome", label: "Setor" },
        { chave: "status_nome", label: "Status" },
        { label: "Data de cadastro", valor: (item) => formatarData(item.created_at) },
        { label: "Última atualização", valor: (item) => formatarData(item.updated_at) },
        { label: "Possui imagem", valor: (item) => item.imagem ? "Sim" : "Não" },
        ...customizadas
    ];
}

const COLUNAS_EMPRESTIMOS = [
    { chave: "patrimonio", label: "Patrimônio" },
    { chave: "tipo_nome", label: "Tipo de ativo" },
    { chave: "setor_ativo_nome", label: "Setor do ativo" },
    { chave: "responsavel", label: "Responsável" },
    { chave: "setor_responsavel_nome", label: "Setor responsável" },
    { label: "Data do empréstimo", valor: (item) => formatarData(item.emprestado_em) },
    { label: "Prazo de devolução", valor: (item) => formatarData(item.prazo_devolucao) },
    { label: "Data da devolução", valor: (item) => formatarData(item.devolvido_em) },
    { chave: "situacao", label: "Situação" },
    { chave: "usuario_saida_nome", label: "Registrado por" },
    { chave: "usuario_devolucao_nome", label: "Devolvido por" },
    { chave: "observacao", label: "Observação" }
];

const COLUNAS_HISTORICO = [
    { chave: "patrimonio", label: "Patrimônio" },
    { chave: "tipo_nome", label: "Tipo de ativo" },
    { chave: "acao", label: "Ação" },
    { chave: "descricao", label: "Descrição" },
    { chave: "setor_anterior_nome", label: "Setor anterior" },
    { chave: "setor_novo_nome", label: "Setor novo" },
    { chave: "status_anterior_nome", label: "Status anterior" },
    { chave: "status_novo_nome", label: "Status novo" },
    { chave: "usuario_nome", label: "Usuário responsável" },
    { label: "Data e hora", valor: (item) => formatarData(item.created_at) },
    { label: "Campos alterados", valor: (item) => (item.campos_alterados || []).join(", ") }
];

function agrupar(registros, chave, vazio = "Não informado") {
    const totais = new Map();
    registros.forEach((item) => {
        const nome = item[chave] || vazio;
        totais.set(nome, (totais.get(nome) || 0) + 1);
    });
    return [...totais.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .map(([label, valor]) => ({ label, valor }));
}

function textoFiltros(filtros, opcoes) {
    const partes = [];
    const buscar = (lista, id, chave = "id") => lista.find((item) => String(item[chave]) === String(id));
    if (filtros.patrimonio) partes.push(`Patrimônio contém "${filtros.patrimonio}"`);
    if (filtros.categoria_id) partes.push(`Categoria: ${buscar(opcoes.categorias, filtros.categoria_id)?.nome || filtros.categoria_id}`);
    if (filtros.tipo_ids.length) {
        partes.push(`Tipos: ${filtros.tipo_ids.map((id) => buscar(opcoes.tipos, id)?.nome || id).join(", ")}`);
    }
    if (filtros.setor_id) partes.push(`Setor: ${buscar(opcoes.setores, filtros.setor_id)?.nome || filtros.setor_id}`);
    if (filtros.status) partes.push(`Status: ${buscar(opcoes.status, filtros.status, "codigo")?.nome || filtros.status}`);
    if (filtros.data_inicial) partes.push(`Desde: ${filtros.data_inicial}`);
    if (filtros.data_final) partes.push(`Até: ${filtros.data_final}`);
    if (filtros.situacao !== "todos") partes.push(`Situação: ${filtros.situacao}`);
    if (filtros.responsavel) partes.push(`Responsável contém "${filtros.responsavel}"`);
    if (filtros.usuario_id) partes.push(`Usuário: ${buscar(opcoes.usuarios, filtros.usuario_id)?.nome || filtros.usuario_id}`);
    if (filtros.acao) partes.push(`Ação: ${filtros.acao}`);
    return partes.join("; ") || "Nenhum";
}

function resumoAtivos(ativos) {
    return [
        { label: "Total de ativos", valor: ativos.length },
        { label: "Ativos emprestados", valor: ativos.filter((item) => item.emprestado_aberto).length },
        { label: "Empréstimos vencidos", valor: ativos.filter((item) => item.emprestimo_vencido).length }
    ];
}

function secoesAtivos(ativos, relatorio) {
    const secoes = [];
    if (relatorio !== "setores") secoes.push({ titulo: "Distribuição por setor", itens: agrupar(ativos, "setor_nome") });
    if (relatorio !== "categorias") secoes.push({ titulo: "Distribuição por categoria", itens: agrupar(ativos, "categoria_nome") });
    if (relatorio !== "tipos") secoes.push({ titulo: "Distribuição por tipo", itens: agrupar(ativos, "tipo_nome") });
    if (relatorio !== "status") secoes.push({ titulo: "Distribuição por status", itens: agrupar(ativos, "status_nome") });
    if (relatorio === "setores") secoes.unshift({ titulo: "Totais por setor", itens: agrupar(ativos, "setor_nome") });
    if (relatorio === "tipos") secoes.unshift({ titulo: "Totais por tipo", itens: agrupar(ativos, "tipo_nome") });
    if (relatorio === "categorias") secoes.unshift({ titulo: "Totais por categoria", itens: agrupar(ativos, "categoria_nome") });
    if (relatorio === "status") secoes.unshift({ titulo: "Totais por status", itens: agrupar(ativos, "status_nome") });
    return secoes;
}

function colunasPdfAtivos() {
    return [
        { chave: "patrimonio", label: "Patrimônio", peso: 1.1 },
        { chave: "tipo_nome", label: "Tipo", peso: 1.2 },
        { chave: "categoria_nome", label: "Categoria", peso: 1.1 },
        { chave: "setor_nome", label: "Setor", peso: 1.2 },
        { chave: "status_nome", label: "Status", peso: 1 }
    ];
}

const RESULTADOS_CHECKLIST = { conforme: "Conforme", nao_conforme: "Não conforme", nao_aplica: "Não se aplica" };

function respostasChecklist(registro) {
    return Array.isArray(registro.respostas) && registro.respostas.length
        ? registro.respostas : [{ item: "Respostas não disponíveis", resposta: "" }];
}

function dataChecklist(valor) {
    if (!valor) return "";
    return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}

function linhasChecklist(registros) {
    return registros.flatMap((registro) => respostasChecklist(registro).map((resposta) => ({
        ...registro,
        pergunta: resposta.item || "Pergunta não disponível",
        resposta: RESULTADOS_CHECKLIST[resposta.resposta] || resposta.resposta || "Não registrada",
        resultado_texto: RESULTADOS_CHECKLIST[registro.resultado] || registro.resultado,
        total_imagens: (registro.imagens || []).length
    })));
}

function imagensPdf(registro) {
    return (registro.imagens || []).filter((nome) => /^[A-Za-z0-9_-]+\.(?:jpg|png)$/i.test(nome))
        .map((nome, indice) => ({
            arquivo: path.resolve(__dirname, "../../../uploads/ativos", nome),
            rotulo: `Imagem ${indice + 1}`
        }));
}

const COLUNAS_CHECKLIST = [
    { label: "Data e hora", valor: (item) => formatarData(item.executado_em) },
    { label: "Data prevista", valor: (item) => dataChecklist(item.data_prevista) },
    { chave: "resultado_texto", label: "Resultado" },
    { chave: "usuario_nome", label: "Responsável" },
    { chave: "pergunta", label: "Pergunta" },
    { chave: "resposta", label: "Resposta" },
    { chave: "observacao", label: "Observação" },
    { chave: "total_imagens", label: "Imagens anexadas" },
    { label: "Próxima data", valor: (item) => dataChecklist(item.proxima_data) },
    { chave: "modelo_versao", label: "Versão do modelo" }
];

async function gerarRelatorio(relatorio, formato, query, usuario) {
    if (!RELATORIOS.has(relatorio)) throw falha("Relatório inválido", 404);
    if (!new Set(["csv", "pdf"]).has(formato)) throw falha("Formato inválido", 404);
    const filtros = normalizarFiltros(query, usuario, relatorio);
    const opcoes = await exportacoesModel.listarOpcoes(usuario);
    const filtrosDescricao = textoFiltros(filtros, opcoes);
    const usuarioNome = `${usuario.nome} (${usuario.login})`;

    if (relatorio === "checklist") {
        const dados = await exportacoesModel.listarChecklist(usuario, filtros);
        if (!dados) throw falha("Ativo não encontrado ou fora do seu escopo", 404);
        const { ativo, registros } = dados;
        if (formato === "csv") return { conteudo: gerarCsv(COLUNAS_CHECKLIST, linhasChecklist(registros)), total: registros.length };
        const pdf = await gerarPdf({
            titulo: "Histórico de Checklist",
            nome: `${ativo.tipo_nome} · ${ativo.patrimonio}`,
            usuario: usuarioNome,
            filtros: `Ativo: ${ativo.patrimonio}; Tipo: ${ativo.tipo_nome}; ${filtrosDescricao}`,
            resumo: [{ label: "Total de verificações", valor: registros.length }],
            secoes: registros.slice(0, LIMITE_LINHAS_PDF).map((registro) => ({
                titulo: `${formatarData(registro.executado_em)} · ${RESULTADOS_CHECKLIST[registro.resultado] || registro.resultado}`,
                itens: [
                    { label: "Data prevista", valor: dataChecklist(registro.data_prevista) },
                    { label: "Responsável", valor: registro.usuario_nome },
                    { label: "Modelo", valor: registro.modelo_versao || "Legado" },
                    ...respostasChecklist(registro).map((resposta, indice) => ({ label: `Item ${indice + 1}`, valor: `${resposta.item || "Pergunta não disponível"}: ${RESULTADOS_CHECKLIST[resposta.resposta] || resposta.resposta || "Não registrada"}` })),
                    { label: "Observação", valor: registro.observacao || "Nenhuma" },
                    { label: "Próxima data", valor: dataChecklist(registro.proxima_data) }
                ],
                imagens: imagensPdf(registro)
            })).concat(registros.length > LIMITE_LINHAS_PDF ? [{
                titulo: "Continuação",
                itens: [{ label: "Limite do PDF", valor: "Use o CSV para consultar todas as verificações." }]
            }] : [])
        });
        return { conteudo: pdf, total: registros.length };
    }

    if (relatorio === "emprestimos") {
        const registros = await exportacoesModel.listarEmprestimos(usuario, filtros);
        if (formato === "csv") return { conteudo: gerarCsv(COLUNAS_EMPRESTIMOS, registros), total: registros.length };
        const pdf = await gerarPdf({
            titulo: "Relatório de Empréstimos",
            nome: "Empréstimos e devoluções",
            usuario: usuarioNome,
            filtros: filtrosDescricao,
            orientacao: "paisagem",
            resumo: [
                { label: "Total", valor: registros.length },
                { label: "Em aberto", valor: registros.filter((item) => item.situacao === "em_aberto").length },
                { label: "Vencidos", valor: registros.filter((item) => item.situacao === "vencido").length },
                { label: "Devolvidos", valor: registros.filter((item) => item.situacao === "devolvido").length }
            ],
            secoes: [{ titulo: "Privacidade", itens: [{ label: "Aviso LGPD", valor: "Este relatório pode conter dados pessoais. Restrinja o acesso e o compartilhamento." }] }],
            tabela: {
                titulo: "Relação de empréstimos",
                colunas: [
                    { chave: "patrimonio", label: "Patrimônio", peso: 1 },
                    { chave: "tipo_nome", label: "Tipo", peso: 1 },
                    { chave: "setor_ativo_nome", label: "Setor", peso: 1 },
                    { chave: "responsavel", label: "Responsável", peso: 1.25 },
                    { chave: "situacao", label: "Situação", peso: 0.85 },
                    { label: "Empréstimo", peso: 1.1, valor: (item) => formatarData(item.emprestado_em) },
                    { label: "Prazo", peso: 1.1, valor: (item) => formatarData(item.prazo_devolucao) }
                ],
                registros: registros.slice(0, LIMITE_LINHAS_PDF),
                truncado: registros.length > LIMITE_LINHAS_PDF
            }
        });
        return { conteudo: pdf, total: registros.length };
    }

    if (relatorio === "historico") {
        const registros = await exportacoesModel.listarHistorico(usuario, filtros);
        if (formato === "csv") return { conteudo: gerarCsv(COLUNAS_HISTORICO, registros), total: registros.length };
        const pdf = await gerarPdf({
            titulo: "Histórico e Movimentações",
            nome: "Auditoria imutável de ativos",
            usuario: usuarioNome,
            filtros: filtrosDescricao,
            orientacao: "paisagem",
            resumo: [{ label: "Total de eventos", valor: registros.length }],
            secoes: [{ titulo: "Eventos por ação", itens: agrupar(registros, "acao") }],
            tabela: {
                titulo: "Linha do tempo",
                colunas: [
                    { chave: "patrimonio", label: "Patrimônio", peso: 1 },
                    { chave: "tipo_nome", label: "Tipo", peso: 1 },
                    { chave: "acao", label: "Ação", peso: 1 },
                    { chave: "descricao", label: "Descrição", peso: 2 },
                    { chave: "usuario_nome", label: "Usuário", peso: 1.1 },
                    { label: "Data/hora", peso: 1.1, valor: (item) => formatarData(item.created_at) }
                ],
                registros: registros.slice(0, LIMITE_LINHAS_PDF),
                truncado: registros.length > LIMITE_LINHAS_PDF
            }
        });
        return { conteudo: pdf, total: registros.length };
    }

    const ativos = await exportacoesModel.listarAtivos(usuario, filtros);
    const campos = await exportacoesModel.listarCampos(usuario, filtros.tipo_ids);
    if (formato === "csv") {
        return { conteudo: gerarCsv(colunasAtivos(campos), ativos), total: ativos.length };
    }
    const nomes = {
        inventario: ["Inventário de Ativos", "Relação patrimonial"],
        setores: ["Relatório por Setor", "Distribuição dos ativos por setor"],
        tipos: ["Relatório por Tipo de Ativo", "Tipos, categorias e campos personalizados"],
        categorias: ["Relatório por Categoria", "Categorias e tipos vinculados"],
        status: ["Relatório por Status", "Situação atual do inventário"]
    };
    const tabelaSolicitada = filtros.detalhado || relatorio === "inventario" || relatorio === "status";
    const pdf = await gerarPdf({
        titulo: nomes[relatorio][0],
        nome: nomes[relatorio][1],
        usuario: usuarioNome,
        filtros: filtrosDescricao,
        orientacao: "paisagem",
        resumo: resumoAtivos(ativos),
        secoes: secoesAtivos(ativos, relatorio),
        ...(tabelaSolicitada && {
            tabela: {
                titulo: "Relação detalhada dos ativos",
                colunas: colunasPdfAtivos(),
                registros: ativos.slice(0, LIMITE_LINHAS_PDF),
                truncado: ativos.length > LIMITE_LINHAS_PDF
            }
        })
    });
    return { conteudo: pdf, total: ativos.length };
}

function colunasObjeto(registros, labels = {}) {
    const chaves = registros.length ? Object.keys(registros[0]) : Object.keys(labels);
    return chaves.map((chave) => ({
        chave,
        label: labels[chave] || chave.replace(/_/g, " ")
    }));
}

function colunasFixas(definicoes) {
    return definicoes.map(([chave, label]) => ({ chave, label }));
}

async function gerarExportacaoCompleta(usuario) {
    if (usuario.perfil !== "admin") throw falha("Exportação completa restrita ao administrador", 403);
    const filtros = normalizarFiltros({}, usuario, "inventario");
    const [ativos, campos, emprestimos, historico, categorias, tipos, camposTabela,
        setores, status, chaves, ferramentas] = await Promise.all([
        exportacoesModel.listarAtivos(usuario, filtros),
        exportacoesModel.listarCampos(usuario),
        exportacoesModel.listarEmprestimos(usuario, { ...filtros, situacao: "todos" }),
        exportacoesModel.listarHistorico(usuario, filtros),
        exportacoesModel.listarTabelaCompleta("categorias"),
        exportacoesModel.listarTabelaCompleta("tipos_ativos"),
        exportacoesModel.listarTabelaCompleta("campos_personalizados"),
        exportacoesModel.listarTabelaCompleta("setores"),
        exportacoesModel.listarTabelaCompleta("status"),
        exportacoesModel.listarTabelaCompleta("movimentacoes_chaves"),
        exportacoesModel.listarTabelaCompleta("movimentacoes_ferramentas")
    ]);
    const dados = {
        "ativos.csv": [colunasAtivos(campos), ativos],
        "categorias.csv": [colunasFixas([["id","ID"],["nome","Nome"],["setor_id","ID do setor"],["icone","Ícone"],["ordem","Ordem"],["created_at","Data de cadastro"]]), categorias],
        "tipos_ativos.csv": [colunasFixas([["id","ID"],["categoria_id","ID da categoria"],["nome","Nome"],["icone","Ícone"],["permite_emprestimo","Permite empréstimo"],["created_at","Data de cadastro"]]), tipos],
        "campos_personalizados.csv": [colunasFixas([["id","ID"],["tipo_ativo_id","ID do tipo"],["nome","Nome interno"],["label","Rótulo"],["tipo","Tipo do campo"],["opcoes","Opções"],["obrigatorio","Obrigatório"],["editavel","Editável"],["visivel","Visível"],["ordem","Ordem"],["created_at","Data de cadastro"]]), camposTabela],
        "setores.csv": [colunasFixas([["id","ID"],["nome","Nome"],["ativo","Ativo"],["created_at","Data de cadastro"]]), setores],
        "status.csv": [colunasFixas([["codigo","Código"],["nome","Nome"],["cor","Cor"],["ativo","Ativo"],["ordem","Ordem"],["created_at","Data de cadastro"]]), status],
        "emprestimos.csv": [COLUNAS_EMPRESTIMOS, emprestimos],
        "historico_ativos.csv": [COLUNAS_HISTORICO, historico],
        "movimentacoes_chaves.csv": [colunasFixas([["id","ID"],["ativo_id","ID do ativo"],["patrimonio","Patrimônio"],["tipo_ativo_id","ID do tipo"],["acao","Ação"],["responsavel","Responsável"],["empresa_setor","Empresa/setor"],["setor_responsavel_id","ID do setor responsável"],["observacao","Observação"],["usuario_id","ID do usuário"],["usuario_nome","Usuário"],["created_at","Data e hora"]]), chaves],
        "movimentacoes_ferramentas.csv": [colunasFixas([["id","ID"],["ativo_id","ID do ativo"],["patrimonio","Patrimônio"],["tipo_ativo_id","ID do tipo"],["acao","Ação"],["responsavel","Responsável"],["empresa_setor","Empresa/setor"],["setor_responsavel_id","ID do setor responsável"],["observacao","Observação"],["usuario_id","ID do usuário"],["usuario_nome","Usuário"],["created_at","Data e hora"]]), ferramentas]
    };
    const arquivos = Object.entries(dados).map(([nome, [colunas, registros]]) => ({
        nome,
        conteudo: gerarCsv(colunas, registros),
        quantidade: registros.length
    }));
    const manifesto = {
        sistema: "Touch Inventory",
        versao_aplicacao: require("../package.json").version || "não informada",
        exportado_em: new Date().toISOString(),
        solicitado_por: { id: usuario.id, login: usuario.login, nome: usuario.nome },
        versao_formato: "1.0",
        arquivos: arquivos.map((arquivo) => ({ nome: arquivo.nome, registros: arquivo.quantidade })),
        filtros_aplicados: {},
        seguranca: "O pacote não contém senhas, hashes de senha, tokens, sessões, cookies, credenciais, variáveis de ambiente ou arquivos secretos.",
        backup: "Esta exportação oferece portabilidade de dados comerciais e não substitui um backup completo do PostgreSQL.",
        limitacoes: [
            "Imagens de ativos e plantas baixas não estão incluídas.",
            "UIDs e vínculos físicos de NFC não estão incluídos por segurança.",
            "A restauração automática deste pacote não é suportada nesta versão."
        ]
    };
    arquivos.push({
        nome: "manifesto.json",
        conteudo: JSON.stringify(manifesto, null, 2),
        quantidade: 1
    });
    return { arquivos, manifesto };
}

module.exports = {
    COLUNAS_EMPRESTIMOS,
    COLUNAS_HISTORICO,
    LIMITE_LINHAS_PDF,
    colunasAtivos,
    gerarExportacaoCompleta,
    gerarRelatorio,
    normalizarFiltros
};
