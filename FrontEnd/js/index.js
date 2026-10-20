// =====================
// Estado e configurações da interface
// =====================

let emprestimosAtuais = [];
let emprestimoParaProrrogar = null;
let emprestimosHabilitados = false;

async function carregarResumoChecklists() {
    const response = await fetch("/api/checklists");
    if (!response.ok) return;
    const itens = await response.json();
    const prioritarios = itens.filter((item) => item.situacao !== "em_dia");
    const painel = document.getElementById("painelChecklists");
    painel.hidden = itens.length === 0;
    if (!itens.length) return;
    const vencidos = itens.filter((item) => item.situacao === "vencido").length;
    const proximos = itens.filter((item) => item.situacao === "proximo").length;
    document.getElementById("resumoChecklists").textContent =
        `${vencidos} vencidos · ${proximos} próximos do vencimento`;
    const lista = document.getElementById("checklistsPrioritarios");
    lista.replaceChildren();
    prioritarios.slice(0, 5).forEach((item) => {
        const link = document.createElement("a");
        const titulo = document.createElement("strong");
        const detalhe = document.createElement("span");
        link.className = `emprestimo-item ${item.situacao}`;
        link.href = "checklists.html";
        titulo.textContent = `${item.patrimonio} · ${item.tipo_nome}`;
        detalhe.textContent = `${item.setor_nome || "Sem setor"} · ${item.situacao === "vencido" ? "Vencido" : "Próximo"}`;
        link.append(titulo, detalhe);
        lista.appendChild(link);
    });
}

// Função: Formata uma data recebida da API para a data e hora locais do navegador.
function formatarDataLocal(valor) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(new Date(valor));
}

// Função: Converte uma data em valor compatível com controles datetime-local.
function valorDataHoraLocal(data) {
    const doisDigitos = (numero) => String(numero).padStart(2, "0");
    return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-` +
        `${doisDigitos(data.getDate())}T${doisDigitos(data.getHours())}:` +
        doisDigitos(data.getMinutes());
}

// Função: Monta o endereço da tela do tipo já apontando para o ativo emprestado.
function urlAtivoEmprestado(item) {
    return `exibeAtivos.html?tipo=${encodeURIComponent(
        item.tipo_id
    )}&selecionar=${encodeURIComponent(item.patrimonio)}`;
}

// Função: Cria uma linha de empréstimo com acesso direto ao ativo e opção de prorrogação.
function criarLinhaEmprestimo(item, completa = false) {
    const linha = document.createElement("div");
    const dados = document.createElement("a");
    const titulo = document.createElement("strong");
    const detalhes = document.createElement("span");
    const situacao = document.createElement("span");
    linha.className = `emprestimo-item ${item.situacao}`;
    dados.className = "emprestimo-link";
    dados.href = urlAtivoEmprestado(item);
    dados.setAttribute(
        "aria-label",
        `Abrir ${item.patrimonio} em ${item.tipo_nome}`
    );
    titulo.textContent = `${item.patrimonio} · ${item.tipo_nome}`;
    detalhes.textContent = item.responsavel
        ? `Responsável: ${item.responsavel} · ${item.setor_nome || "Sem setor"}`
        : `${item.setor_nome || "Sem setor"} · Empréstimo antigo`;
    situacao.className = "situacao-emprestimo";
    situacao.textContent = item.situacao === "sem_prazo"
        ? "Sem prazo registrado"
        : item.situacao === "vencido"
            ? `Vencido · devolução prevista: ${formatarDataLocal(item.prazo_devolucao)}`
            : item.situacao === "proximo"
                ? `Vence em até 24h · ${formatarDataLocal(item.prazo_devolucao)}`
                : `Devolução prevista: ${formatarDataLocal(item.prazo_devolucao)}`;
    dados.append(titulo, detalhes, situacao);
    linha.appendChild(dados);
    if (completa && item.emprestimo_id) {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.textContent = "Prorrogar";
        botao.addEventListener("click", () => abrirProrrogacao(item));
        linha.appendChild(botao);
    }
    return linha;
}

// Função: Preenche uma lista de empréstimos e exibe uma mensagem quando não há resultados.
function preencherListaEmprestimos(id, itens, completa = false) {
    const lista = document.getElementById(id);
    lista.replaceChildren();
    if (!itens.length) {
        const vazio = document.createElement("p");
        vazio.className = "resumo-vazio";
        vazio.textContent = "Nenhum empréstimo aberto.";
        lista.appendChild(vazio);
        return;
    }
    itens.forEach((item) => {
        lista.appendChild(criarLinhaEmprestimo(item, completa));
    });
}

// Função: Busca empréstimos abertos, atualiza os indicadores e mantém o modal sincronizado.
async function carregarEmprestimos() {
    try {
        const response = await fetch("/api/gestao/emprestimos");
        if (!response.ok) {
            throw new Error("Não foi possível carregar empréstimos");
        }
        emprestimosAtuais = await response.json();
        const vencidos = emprestimosAtuais.filter(
            (item) => item.situacao === "vencido"
        ).length;
        const proximos = emprestimosAtuais.filter(
            (item) => item.situacao === "proximo"
        ).length;
        const semPrazo = emprestimosAtuais.filter(
            (item) => item.situacao === "sem_prazo"
        ).length;
        document.getElementById("resumoEmprestimos").textContent =
            `${vencidos} vencidos · ${proximos} em até 24h · ${semPrazo} sem prazo`;
        preencherListaEmprestimos(
            "emprestimosPrioritarios", emprestimosAtuais.slice(0, 5)
        );
        if (document.getElementById("modalEmprestimos").open) {
            preencherListaEmprestimos(
                "todosEmprestimos",
                emprestimosAtuais,
                true
            );
        }
    } catch (erro) {
        document.getElementById("resumoEmprestimos").textContent =
            erro.message;
    }
}

// Função: Abre o formulário de prorrogação com os dados e limites do empréstimo escolhido.
function abrirProrrogacao(item) {
    emprestimoParaProrrogar = item;
    document.getElementById("ativoProrrogar").textContent =
        `${item.patrimonio} · prazo atual: ${formatarDataLocal(
            item.prazo_devolucao
        )}`;
    document.getElementById("erroProrrogacao").textContent = "";
    const input = document.getElementById("novoPrazo");
    input.min = valorDataHoraLocal(new Date());
    input.value = "";
    document.getElementById("modalProrrogar").showModal();
}

// Função: Exibe a distribuição completa dos ativos sem alongar a tela inicial.
function preencherResumo(id, itens) {
    const lista = document.getElementById(id);
    lista.replaceChildren();
    if (!itens?.length) {
        const vazio = document.createElement("p");
        vazio.className = "resumo-vazio";
        vazio.textContent = "Nenhum ativo nesta distribuição.";
        lista.appendChild(vazio);
        return;
    }
    itens.forEach((item) => {
        const linha = document.createElement("div");
        const nome = document.createElement("span");
        const total = document.createElement("strong");
        linha.className = "resumo-linha";
        nome.textContent = item.nome;
        total.textContent = item.total;
        linha.append(nome, total);
        lista.appendChild(linha);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("tiposAtivo");
    const instrucao = document.getElementById("instrucao");

    try {
        await protegerPagina();
        await carregarResumoChecklists();
        const dashboardResponse = await fetch("/api/gestao/dashboard");
        const dashboard = await dashboardResponse.json();
        if (dashboardResponse.ok) {
            emprestimosHabilitados = Boolean(
                dashboard.possui_ativos_emprestaveis
            );
            document.getElementById("painelEmprestimos").hidden =
                !emprestimosHabilitados;

            if (emprestimosHabilitados) {
                await carregarEmprestimos();
                window.setInterval(carregarEmprestimos, 60_000);
            }

            document.getElementById("totalAtivos").textContent =
                dashboard.total;
            document.getElementById("totalEmUso").textContent =
                dashboard.em_uso;
            document.getElementById("totalAtencao").textContent =
                dashboard.exigem_atencao;
            document.getElementById("detalheAtencao").textContent =
                `Manutenção: ${dashboard.em_manutencao} · Extraviados: ${dashboard.extraviados}`;
            preencherResumo("resumoStatus", dashboard.por_status);
            preencherResumo("resumoSetores", dashboard.por_setor);
            preencherResumo("resumoCategorias", dashboard.por_categoria);
            preencherResumo("resumoTipos", dashboard.por_tipo);
        }
        const response = await fetch("/api/tipos");
        const tipos = await response.json();

        if (!response.ok) {
            throw new Error(tipos.erro || "Erro ao carregar tipos");
        }

        container.replaceChildren();

        if (tipos.length === 0) {
            instrucao.textContent =
                "Nenhum tipo de ativo foi cadastrado.";

            const mensagem = document.createElement("p");
            mensagem.className = "mensagem-vazia";
            mensagem.textContent =
                "Cadastre uma categoria e um tipo de ativo para começar.";
            container.appendChild(mensagem);
            return;
        }

        const categorias = tipos.reduce((grupos, tipo) => {
            const nomeCategoria =
                tipo.categoria_nome || "Sem categoria";

            if (!grupos.has(nomeCategoria)) {
                grupos.set(nomeCategoria, []);
            }

            grupos.get(nomeCategoria).push(tipo);
            return grupos;
        }, new Map());

        categorias.forEach((tiposDaCategoria, categoria) => {
            const card = document.createElement("section");
            const cabecalho = document.createElement("div");
            const titulo = document.createElement("h2");
            const grupos = document.createElement("a");
            const lista = document.createElement("div");

            card.className = "categoria-card";
            cabecalho.className = "categoria-cabecalho";
            titulo.className = "categoria-titulo";
            titulo.textContent = categoria;
            grupos.className = "categoria-grupos";
            grupos.textContent = "Exibir grupos de itens";
            grupos.href = `grupos.html?categoria_id=${encodeURIComponent(
                tiposDaCategoria[0].categoria_id
            )}&categoria=${encodeURIComponent(categoria)}`;
            lista.className = "tipos-lista";

            tiposDaCategoria.forEach((tipo) => {
                const botao = document.createElement("button");
                botao.type = "button";
                botao.className = "tipo-ativo";
                botao.textContent = tipo.nome;
                botao.addEventListener("click", () => {
                    window.location.href =
                        `/exibeAtivos.html?tipo=${encodeURIComponent(
                            tipo.id
                        )}`;
                });

                lista.appendChild(botao);
            });

            cabecalho.append(titulo, grupos);
            card.appendChild(cabecalho);
            card.appendChild(lista);
            container.appendChild(card);
        });
    } catch (erro) {
        console.error(erro);
        instrucao.textContent =
            "Não foi possível carregar os tipos de ativo.";
        const mensagem = document.createElement("p");
        mensagem.className = "mensagem-vazia";
        mensagem.textContent = "Verifique se o servidor está em execução.";
        container.replaceChildren(mensagem);
    }
});

document.getElementById("verTodosEmprestimos").addEventListener("click", () => {
    preencherListaEmprestimos("todosEmprestimos", emprestimosAtuais, true);
    document.getElementById("modalEmprestimos").showModal();
});

document.getElementById("fecharEmprestimos").addEventListener("click", () => {
    document.getElementById("modalEmprestimos").close();
});

document.getElementById("cancelarProrrogacao").addEventListener("click", () => {
    document.getElementById("modalProrrogar").close();
});

document.getElementById("formProrrogar").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!emprestimoParaProrrogar) return;
    const erro = document.getElementById("erroProrrogacao");
    erro.textContent = "";
    try {
        const data = new Date(document.getElementById("novoPrazo").value);
        if (Number.isNaN(data.getTime())) {
            throw new Error("Informe uma data e hora válidas");
        }
        const response = await fetch(
            `/api/${encodeURIComponent(emprestimoParaProrrogar.tipo_id)}/` +
            `${encodeURIComponent(emprestimoParaProrrogar.patrimonio)}/prorrogar-emprestimo`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prazo_devolucao: data.toISOString() })
            }
        );
        const resultado = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(resultado.erro || "Não foi possível prorrogar o empréstimo");
        }
        document.getElementById("modalProrrogar").close();
        await carregarEmprestimos();
    } catch (falha) {
        erro.textContent = falha.message;
    }
});

document.addEventListener("visibilitychange", () => {
    if (!document.hidden && usuarioAtual && emprestimosHabilitados) {
        carregarEmprestimos();
    }
});
