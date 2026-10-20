"use strict";

const grupos = {
    gerenciais: { titulo: "RELATÓRIOS GERENCIAIS", rotulo: "RELATÓRIO GERENCIAL" },
    operacionais: { titulo: "DADOS OPERACIONAIS", rotulo: "EXPORTAÇÃO OPERACIONAL" },
    portabilidade: { titulo: "PORTABILIDADE", rotulo: "PORTABILIDADE DE DADOS" }
};

const relatorios = {
    setores: {
        grupo:"gerenciais", icone:"⌂", titulo:"Relatório por setor", curto:"Por setor",
        resumo:"Totais, distribuição e situação de cada área.", descricao:"Compare patrimônio, status, categorias, tipos e empréstimos dentro dos setores.",
        pergunta:"Qual setor deseja analisar?", ajuda:"Escolha um setor ou mantenha todos para uma visão consolidada.",
        formatos:["pdf","csv"], primarios:["setor"], avancados:["categoria","tipo","status","data_inicial","data_final","detalhado"]
    },
    tipos: {
        grupo:"gerenciais", icone:"▦", titulo:"Relatório por tipo de ativo", curto:"Por tipo de ativo",
        resumo:"Desempenho de notebooks, mesas e outros tipos.", descricao:"Analise quantidades, localização, situação e campos próprios de cada tipo.",
        pergunta:"Quais tipos deseja analisar?", ajuda:"Selecione um ou vários tipos; sem seleção, todos serão considerados.",
        formatos:["pdf","csv"], primarios:["tipo"], avancados:["categoria","setor","status","data_inicial","data_final","detalhado"]
    },
    categorias: {
        grupo:"gerenciais", icone:"◫", titulo:"Relatório por categoria", curto:"Por categoria",
        resumo:"Visão consolidada das famílias patrimoniais.", descricao:"Veja tipos vinculados e distribuições por setor, status e empréstimos.",
        pergunta:"Qual categoria deseja analisar?", ajuda:"Escolha uma categoria ou mantenha todas para comparar o conjunto.",
        formatos:["pdf","csv"], primarios:["categoria"], avancados:["tipo","setor","status","data_inicial","data_final","detalhado"]
    },
    status: {
        grupo:"gerenciais", icone:"●", titulo:"Relatório por status", curto:"Por status",
        resumo:"Ativos em uso, disponíveis ou com pendências.", descricao:"Avalie a situação atual e sua distribuição por setor, categoria e tipo.",
        pergunta:"Qual situação deseja analisar?", ajuda:"Selecione um status ou gere um comparativo entre todos.",
        formatos:["pdf","csv"], primarios:["status"], avancados:["categoria","tipo","setor","data_inicial","data_final"]
    },
    inventario: {
        grupo:"operacionais", icone:"▤", titulo:"Inventário de ativos", curto:"Inventário de ativos",
        resumo:"Base detalhada para Excel e conferência.", descricao:"Exporte os registros operacionais, incluindo campos personalizados e localização.",
        pergunta:"Deseja exportar todo o inventário?", ajuda:"Você pode gerar a base completa agora ou abrir os filtros opcionais abaixo.",
        vazio:"Por padrão, todos os ativos permitidos para o seu perfil serão incluídos.",
        formatos:["csv","pdf"], primarios:[], avancados:["patrimonio","categoria","tipo","setor","status","data_inicial","data_final","detalhado"]
    },
    emprestimos: {
        grupo:"operacionais", icone:"⇄", titulo:"Empréstimos", curto:"Empréstimos",
        resumo:"Prazos, responsáveis e devoluções.", descricao:"Acompanhe empréstimos em aberto, vencidos ou já devolvidos.",
        pergunta:"Quais empréstimos deseja consultar?", ajuda:"Comece pela situação; período, setor e responsável são refinamentos opcionais.",
        formatos:["csv","pdf"], primarios:["situacao"], avancados:["tipo","setor","data_inicial","data_final","responsavel"], pessoal:true, periodo:"Data do empréstimo"
    },
    historico: {
        grupo:"operacionais", icone:"↺", titulo:"Histórico e movimentações", curto:"Histórico e movimentações",
        resumo:"Linha do tempo para auditoria e rastreabilidade.", descricao:"Consulte ações, mudanças de setor, status e campos alterados sem modificar o histórico.",
        pergunta:"Qual período deseja auditar?", ajuda:"As datas são opcionais. Sem preenchimento, todo o histórico permitido será considerado.",
        formatos:["csv","pdf"], primarios:["data_inicial","data_final"], avancados:["patrimonio","tipo","setor","usuario","acao"], pessoal:true, periodo:"Data do evento"
    },
    checklist: {
        grupo:"operacionais", icone:"✓", titulo:"Histórico de checklist", curto:"Histórico de checklist",
        resumo:"Verificações e respostas de um ativo.", descricao:"Exporte as verificações registradas, as respostas e observações de um ativo específico.",
        pergunta:"Qual ativo deseja consultar?", ajuda:"Selecione o tipo e informe o patrimônio exato do ativo.",
        formatos:["pdf","csv"], primarios:["tipo_checklist","patrimonio"], avancados:["data_inicial","data_final"], pessoal:true, periodo:"Data da verificação"
    },
    completa: {
        grupo:"portabilidade", icone:"ZIP", titulo:"Exportação completa dos dados", curto:"Exportação completa",
        resumo:"Pacote de portabilidade com vários CSVs.", descricao:"Reúna os dados comerciais e o manifesto em um único pacote administrativo.",
        pergunta:"Gerar o pacote completo?", ajuda:"Não há filtros: todos os dados comerciais autorizados serão incluídos.",
        vazio:"O pacote contém CSVs separados e um manifesto. Senhas, sessões, segredos, imagens e UIDs NFC ficam de fora.",
        formatos:["zip"], primarios:[], avancados:[], admin:true, backup:true
    }
};

const formatos = {
    csv: { titulo:"Planilha CSV", descricao:"Dados tabulares detalhados para Excel e análise.", icone:"CSV" },
    pdf: { titulo:"Relatório PDF", descricao:"Documento organizado, paginado e pronto para impressão.", icone:"PDF" },
    zip: { titulo:"Pacote ZIP", descricao:"Vários CSVs acompanhados do manifesto da exportação.", icone:"ZIP" }
};

let opcoes;
let relatorioAtual = "setores";

function adicionarOpcoes(id, itens, texto, valor = "id") {
    const select = document.getElementById(id);
    itens.forEach((item) => select.appendChild(new Option(texto(item), item[valor])));
}

function montarTipos() {
    const lista = document.getElementById("listaTipos");
    opcoes.tipos.forEach((tipo) => {
        const label = document.createElement("label");
        label.className = "item-tipo";
        label.dataset.busca = `${tipo.nome} ${tipo.categoria_nome}`.toLocaleLowerCase("pt-BR");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = tipo.id;
        checkbox.dataset.nome = tipo.nome;
        const texto = document.createElement("span");
        const nome = document.createElement("strong");
        nome.textContent = tipo.nome;
        const categoria = document.createElement("small");
        categoria.textContent = tipo.categoria_nome;
        texto.append(nome, categoria);
        label.append(checkbox, texto);
        lista.appendChild(label);
    });
}

function montarCatalogo() {
    const lista = document.getElementById("listaRelatorios");
    Object.keys(grupos).forEach((grupoCodigo) => {
        const opcoesGrupo = Object.entries(relatorios).filter(([, relatorio]) =>
            relatorio.grupo === grupoCodigo && (!relatorio.admin || opcoes.permite_exportacao_completa));
        if (!opcoesGrupo.length) return;
        const grupo = document.createElement("section");
        grupo.className = "grupo-catalogo";
        const titulo = document.createElement("span");
        titulo.textContent = grupos[grupoCodigo].titulo;
        grupo.appendChild(titulo);
        opcoesGrupo.forEach(([codigo, relatorio]) => {
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "opcao-relatorio";
            botao.dataset.relatorio = codigo;
            botao.setAttribute("aria-pressed", "false");
            const icone = document.createElement("span");
            icone.className = "opcao-icone";
            icone.textContent = relatorio.icone;
            const texto = document.createElement("span");
            texto.className = "opcao-texto";
            const nome = document.createElement("strong");
            nome.textContent = relatorio.curto;
            const resumo = document.createElement("small");
            resumo.textContent = relatorio.resumo;
            texto.append(nome, resumo);
            const seta = document.createElement("span");
            seta.className = "opcao-seta";
            seta.textContent = "›";
            botao.append(icone, texto, seta);
            botao.addEventListener("click", () => selecionarRelatorio(codigo, true));
            grupo.appendChild(botao);
        });
        lista.appendChild(grupo);
    });
}

function controleFiltro(nome) {
    return document.querySelector(`[data-filtro="${nome}"]`);
}

function filtrosPermitidos(relatorio) {
    const permitidos = [...relatorio.primarios, ...relatorio.avancados];
    if (opcoes.perfil !== "admin") return permitidos.filter((nome) => !["responsavel", "usuario"].includes(nome));
    return permitidos;
}

function organizarFiltros(relatorio) {
    const deposito = document.getElementById("depositoFiltros");
    document.querySelectorAll("[data-filtro]").forEach((controle) => {
        controle.hidden = true;
        deposito.appendChild(controle);
    });
    const primarios = relatorio.primarios.filter((nome) => filtrosPermitidos(relatorio).includes(nome));
    const avancados = relatorio.avancados.filter((nome) => filtrosPermitidos(relatorio).includes(nome));
    primarios.forEach((nome) => {
        const controle = controleFiltro(nome);
        controle.hidden = false;
        document.getElementById("filtrosPrincipais").appendChild(controle);
    });
    avancados.forEach((nome) => {
        const controle = controleFiltro(nome);
        controle.hidden = false;
        document.getElementById("filtrosAvancados").appendChild(controle);
    });
    const refinamento = document.getElementById("refinamento");
    refinamento.hidden = !avancados.length;
    refinamento.open = false;
    const estado = document.getElementById("estadoPrincipal");
    estado.hidden = !relatorio.vazio;
    estado.textContent = relatorio.vazio || "";
    const periodo = relatorio.periodo || "Data de cadastro";
    document.getElementById("rotuloDataInicial").textContent = `${periodo} — inicial`;
    document.getElementById("rotuloDataFinal").textContent = `${periodo} — final`;
}

function renderizarFormatos(relatorio) {
    const container = document.getElementById("opcoesFormato");
    container.replaceChildren();
    relatorio.formatos.forEach((codigo, indice) => {
        const formato = formatos[codigo];
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "formato-opcao";
        botao.dataset.formato = codigo;
        botao.setAttribute("role", "radio");
        botao.setAttribute("aria-checked", indice === 0 ? "true" : "false");
        const icone = document.createElement("span");
        icone.className = "formato-icone";
        icone.textContent = formato.icone;
        const texto = document.createElement("span");
        texto.className = "formato-texto";
        const titulo = document.createElement("strong");
        titulo.textContent = formato.titulo;
        const descricao = document.createElement("small");
        descricao.textContent = formato.descricao;
        texto.append(titulo, descricao);
        const marca = document.createElement("span");
        marca.className = "formato-marca";
        marca.textContent = "✓";
        botao.append(icone, texto, marca);
        botao.addEventListener("click", () => selecionarFormato(codigo));
        container.appendChild(botao);
    });
    selecionarFormato(relatorio.formatos[0]);
}

function selecionarFormato(codigo) {
    document.getElementById("formato").value = codigo;
    document.querySelectorAll(".formato-opcao").forEach((botao) => {
        const ativo = botao.dataset.formato === codigo;
        botao.classList.toggle("ativo", ativo);
        botao.setAttribute("aria-checked", String(ativo));
    });
    const detalhado = controleFiltro("detalhado");
    if (detalhado && filtrosPermitidos(relatorios[relatorioAtual]).includes("detalhado")) {
        detalhado.hidden = codigo !== "pdf";
        if (codigo !== "pdf") document.getElementById("detalhado").checked = false;
    }
    atualizarResumo();
}

function selecionarRelatorio(codigo, rolarParaConfiguracao = false) {
    relatorioAtual = codigo;
    const relatorio = relatorios[codigo];
    document.getElementById("tipoRelatorio").value = codigo;
    document.getElementById("iconeRelatorio").textContent = relatorio.icone;
    document.getElementById("grupoRelatorio").textContent = grupos[relatorio.grupo].rotulo;
    document.getElementById("tituloRelatorio").textContent = relatorio.titulo;
    document.getElementById("descricaoRelatorio").textContent = relatorio.descricao;
    document.getElementById("perguntaPrincipal").textContent = relatorio.pergunta;
    document.getElementById("ajudaPrincipal").textContent = relatorio.ajuda;
    document.querySelectorAll(".opcao-relatorio").forEach((botao) => {
        const ativo = botao.dataset.relatorio === codigo;
        botao.classList.toggle("ativo", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
    organizarFiltros(relatorio);
    renderizarFormatos(relatorio);
    document.getElementById("avisoPrivacidade").hidden = !relatorio.pessoal;
    document.getElementById("avisoBackup").hidden = !relatorio.backup;
    document.getElementById("mensagem").textContent = "";
    atualizarResumo();
    if (rolarParaConfiguracao && window.matchMedia("(max-width: 900px)").matches) {
        requestAnimationFrame(() => document.querySelector(".painel").scrollIntoView({ behavior:"smooth", block:"start" }));
    }
}

function tiposSelecionados() {
    return [...document.querySelectorAll("#listaTipos input:checked")];
}

function atualizarResumoTipos() {
    const selecionados = tiposSelecionados();
    document.getElementById("resumoTipos").textContent = selecionados.length === 0
        ? "Todos os tipos"
        : selecionados.length === 1 ? selecionados[0].dataset.nome : `${selecionados.length} tipos selecionados`;
    atualizarResumo();
}

function textoSelecionado(id, padrao) {
    const select = document.getElementById(id);
    return select.value ? select.selectedOptions[0]?.textContent : padrao;
}

function escopoPrincipal(codigo) {
    switch (codigo) {
        case "setores": return textoSelecionado("setor", "Todos os setores");
        case "categorias": return textoSelecionado("categoria", "Todas as categorias");
        case "status": return textoSelecionado("status", "Todos os status");
        case "tipos": {
            const selecionados = tiposSelecionados();
            if (!selecionados.length) return "Todos os tipos";
            if (selecionados.length === 1) return selecionados[0].dataset.nome;
            return `${selecionados.length} tipos selecionados`;
        }
        case "emprestimos": return textoSelecionado("situacao", "Todos os empréstimos");
        case "checklist": return `${textoSelecionado("tipoChecklist", "Selecione o tipo")} · ${document.getElementById("patrimonio").value.trim() || "Informe o patrimônio"}`;
        case "historico": {
            const inicio = document.getElementById("dataInicial").value;
            const fim = document.getElementById("dataFinal").value;
            return inicio || fim ? `Período ${inicio || "início"} até ${fim || "hoje"}` : "Todo o período";
        }
        case "completa": return "Todos os dados comerciais autorizados";
        default: return "Todos os ativos autorizados";
    }
}

function filtroPreenchido(nome) {
    if (nome === "tipo") return tiposSelecionados().length > 0;
    if (nome === "detalhado") return document.getElementById("detalhado").checked;
    const mapa = { patrimonio:"patrimonio", tipo_checklist:"tipoChecklist", categoria:"categoria", setor:"setor", status:"status", data_inicial:"dataInicial", data_final:"dataFinal", situacao:"situacao", responsavel:"responsavel", usuario:"usuario", acao:"acao" };
    const valor = document.getElementById(mapa[nome])?.value;
    return Boolean(valor && !(nome === "situacao" && valor === "todos"));
}

function atualizarResumo() {
    if (!opcoes) return;
    const relatorio = relatorios[relatorioAtual];
    const formato = document.getElementById("formato").value || relatorio.formatos[0];
    const avancados = relatorio.avancados.filter((nome) => filtrosPermitidos(relatorio).includes(nome) && filtroPreenchido(nome));
    const contador = document.getElementById("contagemFiltros");
    contador.hidden = avancados.length === 0;
    contador.textContent = `${avancados.length} ${avancados.length === 1 ? "filtro ativo" : "filtros ativos"}`;
    document.getElementById("resumoRelatorio").textContent = `${relatorio.titulo} · ${escopoPrincipal(relatorioAtual)}`;
    document.getElementById("resumoDescricao").textContent = `${formatos[formato].descricao}${avancados.length ? ` ${avancados.length} refinamento(s) aplicado(s).` : " Sem refinamentos adicionais."}`;
    const acao = relatorioAtual === "completa" ? "Gerar exportação completa" : relatorio.grupo === "gerenciais" ? `Gerar ${relatorio.titulo.toLocaleLowerCase("pt-BR")} em ${formato.toUpperCase()}` : `Exportar ${relatorio.curto.toLocaleLowerCase("pt-BR")} em ${formato.toUpperCase()}`;
    document.getElementById("gerar").textContent = acao;
}

function parametrosFormulario() {
    const params = new URLSearchParams();
    const ativos = filtrosPermitidos(relatorios[relatorioAtual]);
    const simples = {
        patrimonio:["patrimonio","patrimonio"], tipo_checklist:["tipo_checklist_id","tipoChecklist"], categoria:["categoria_id","categoria"], setor:["setor_id","setor"],
        status:["status","status"], data_inicial:["data_inicial","dataInicial"], data_final:["data_final","dataFinal"],
        situacao:["situacao","situacao"], responsavel:["responsavel","responsavel"], usuario:["usuario_id","usuario"], acao:["acao","acao"]
    };
    Object.entries(simples).forEach(([filtro,[nome,id]]) => {
        if (!ativos.includes(filtro)) return;
        const valor = document.getElementById(id).value;
        if (valor && !(filtro === "situacao" && valor === "todos")) params.set(nome, valor);
    });
    if (ativos.includes("tipo")) {
        const tipos = tiposSelecionados().map((item) => item.value);
        if (tipos.length) params.set("tipo_id", tipos.join(","));
    }
    if (ativos.includes("detalhado") && document.getElementById("formato").value === "pdf" && document.getElementById("detalhado").checked) params.set("detalhado", "true");
    return params;
}

function nomeResposta(response, padrao) {
    const disposicao = response.headers.get("Content-Disposition") || "";
    const utf8 = disposicao.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8) return decodeURIComponent(utf8[1]);
    return disposicao.match(/filename="([^"]+)"/i)?.[1] || padrao;
}

async function gerar(evento) {
    evento.preventDefault();
    if (relatorioAtual === "checklist" && (!document.getElementById("tipoChecklist").value || !document.getElementById("patrimonio").value.trim())) {
        const mensagem = document.getElementById("mensagem");
        mensagem.className = "mensagem erro";
        mensagem.textContent = "Selecione o tipo e informe o patrimônio do ativo.";
        return;
    }
    const botao = document.getElementById("gerar");
    const mensagem = document.getElementById("mensagem");
    const formato = document.getElementById("formato").value;
    const url = relatorioAtual === "completa"
        ? "/api/exportacoes/completa.zip"
        : `/api/exportacoes/${relatorioAtual}.${formato}?${parametrosFormulario()}`;
    botao.disabled = true;
    botao.textContent = "Preparando arquivo...";
    mensagem.className = "mensagem";
    mensagem.textContent = "Processando os dados no servidor. Aguarde...";
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const dados = await response.json().catch(() => ({}));
            throw new Error(dados.erro || "Não foi possível gerar o arquivo");
        }
        const blob = await response.blob();
        const link = document.createElement("a");
        const objeto = URL.createObjectURL(blob);
        link.href = objeto;
        link.download = nomeResposta(response, `relatorio.${formato}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objeto), 1000);
        const total = response.headers.get("X-Total-Registros");
        mensagem.className = "mensagem sucesso";
        mensagem.textContent = total === "0" ? "Arquivo criado, mas nenhum registro corresponde à seleção." : `Arquivo gerado com sucesso${total ? ` (${total} registro(s))` : ""}.`;
    } catch (erro) {
        mensagem.className = "mensagem erro";
        mensagem.textContent = erro.message;
    } finally {
        botao.disabled = false;
        atualizarResumo();
    }
}

function configurarEventos() {
    document.getElementById("abrirTipos").addEventListener("click", () => {
        const painel = document.getElementById("painelTipos");
        painel.hidden = !painel.hidden;
        document.getElementById("abrirTipos").setAttribute("aria-expanded", String(!painel.hidden));
        if (!painel.hidden) document.getElementById("buscaTipo").focus();
    });
    document.getElementById("buscaTipo").addEventListener("input", (evento) => {
        const busca = evento.target.value.trim().toLocaleLowerCase("pt-BR");
        document.querySelectorAll(".item-tipo").forEach((item) => { item.hidden = Boolean(busca && !item.dataset.busca.includes(busca)); });
    });
    document.getElementById("listaTipos").addEventListener("change", atualizarResumoTipos);
    document.getElementById("limparTipos").addEventListener("click", () => {
        document.querySelectorAll("#listaTipos input:checked").forEach((item) => { item.checked = false; });
        atualizarResumoTipos();
    });
    document.addEventListener("click", (evento) => {
        const seletor = document.getElementById("multisseletorTipo");
        if (!seletor.contains(evento.target)) {
            document.getElementById("painelTipos").hidden = true;
            document.getElementById("abrirTipos").setAttribute("aria-expanded", "false");
        }
    });
    document.getElementById("formExportacao").addEventListener("input", atualizarResumo);
    document.getElementById("formExportacao").addEventListener("change", atualizarResumo);
    document.getElementById("formExportacao").addEventListener("submit", gerar);
}

(async () => {
    await protegerPagina();
    const response = await fetch("/api/exportacoes/opcoes");
    opcoes = await response.json();
    if (!response.ok) throw new Error(opcoes.erro || "Não foi possível carregar os filtros");
    adicionarOpcoes("categoria", opcoes.categorias, (item) => item.nome);
    adicionarOpcoes("tipoChecklist", opcoes.tipos, (item) => `${item.nome} · ${item.categoria_nome}`);
    adicionarOpcoes("setor", opcoes.setores, (item) => item.nome);
    adicionarOpcoes("status", opcoes.status, (item) => item.nome, "codigo");
    adicionarOpcoes("usuario", opcoes.usuarios, (item) => item.nome);
    adicionarOpcoes("acao", opcoes.acoes.map((acao) => ({ acao })), (item) => item.acao, "acao");
    montarTipos();
    montarCatalogo();
    configurarEventos();
    selecionarRelatorio("setores");
})().catch((erro) => {
    const mensagem = document.getElementById("mensagem");
    mensagem.className = "mensagem erro";
    mensagem.textContent = erro.message;
});
