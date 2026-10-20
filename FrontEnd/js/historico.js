// =====================
// Estado e configurações da interface
// =====================

const modalHistorico = document.getElementById("modalHistorico");
const modalTransferencia = document.getElementById("modalTransferencia");
let transferenciaAberta = null;

// =====================
// Funções da interface
// =====================

// Função: Interrompe a operação e orienta o usuário quando nenhum ativo da tabela está selecionado.
function exigirAtivoSelecionado() {
    if (!ativoSelecionado) {
        mostrarNotificacao(
            "Selecione um ativo para realizar esta ação.",
            "aviso"
        );
        return false;
    }
    return true;
}

// Função: Converte uma data do histórico para a representação local de data e hora.
function formatarDataHora(valor) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(new Date(valor));
}

// Função: Traduz o código interno de uma ação do histórico para um rótulo legível.
function rotuloAcao(acao) {
    const rotulos = {
        criacao: "Criação",
        edicao: "Edição",
        exclusao: "Exclusão",
        transferencia: "Transferência",
        saida_chave: "Saída da chave",
        devolucao_chave: "Devolução da chave",
        saida_ferramenta: "Saída da ferramenta",
        devolucao_ferramenta: "Devolução da ferramenta",
        saida_ativo: "Empréstimo do ativo",
        devolucao_ativo: "Devolução do ativo",
        prorrogacao_emprestimo: "Prorrogação do empréstimo",
        posicionamento_mapa: "Posicionamento no mapa"
    };
    return rotulos[acao] || acao;
}

// Função: Converte nomes antigos ou alternativos de campo para a chave usada na comparação histórica.
function normalizarCampoHistorico(campo) {
    return campo === "setor" ? "setor_id" : campo;
}

// Função: Localiza a configuração do campo correspondente ao nome registrado no histórico.
function definicaoCampoHistorico(nome) {
    return contextoTipoAtual?.campos?.find(
        (campo) => campo.nome === nome
    );
}

// Função: Obtém o rótulo amigável do campo ou cria um a partir de sua chave técnica.
function rotuloCampoHistorico(nome) {
    const sistema = {
        patrimonio: "Patrimônio",
        setor_id: "Setor de alocação",
        status: "Status",
        prazo_devolucao: "Prazo de devolução"
    };
    if (sistema[nome]) return sistema[nome];

    const definicao = definicaoCampoHistorico(nome);
    if (definicao?.label) return definicao.label;

    return String(nome)
        .replaceAll("_", " ")
        .replace(/^./, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

// Função: Recupera o valor anterior ou novo de um campo, incluindo setor e status armazenados separadamente.
function valorBrutoHistorico(registro, nome, lado) {
    const dados =
        lado === "anterior"
            ? registro.dados_anteriores || {}
            : registro.dados_novos || {};

    if (nome === "setor_id") {
        return lado === "anterior"
            ? registro.setor_anterior ?? dados.setor_id
            : registro.setor_novo ?? dados.setor_id;
    }

    if (nome === "status") {
        return lado === "anterior"
            ? registro.status_anterior_nome ??
                  registro.status_anterior ??
                  dados.status
            : registro.status_novo_nome ??
                  registro.status_novo ??
                  dados.status;
    }

    return dados[nome];
}

// Função: Formata valores históricos especiais e aplica a configuração do campo dinâmico quando disponível.
function formatarValorHistorico(nome, valor) {
    if (valor === undefined) return null;
    if (valor === null || valor === "") return "Não informado";

    if (nome === "prazo_devolucao") return formatarDataHora(valor);

    const definicao = definicaoCampoHistorico(nome);
    return definicao
        ? formatarValorCampo(definicao, valor) || "Não informado"
        : String(valor);
}

// Função: Reúne e ordena os campos que realmente participaram de uma alteração registrada.
function camposDoRegistro(registro) {
    const informados = (registro.campos_alterados || []).map(
        normalizarCampoHistorico
    );
    const dadosDisponiveis = [
        ...Object.keys(registro.dados_anteriores || {}),
        ...Object.keys(registro.dados_novos || {})
    ].map(normalizarCampoHistorico);

    const campos = informados.length ? informados : dadosDisponiveis;
    return [...new Set(campos)];
}

// Função: Cria um elemento textual do histórico com a classe e o conteúdo informados.
function criarTextoHistorico(classe, texto) {
    const elemento = document.createElement("p");
    elemento.className = classe;
    elemento.textContent = texto;
    return elemento;
}

// Função: Monta a comparação visual entre os valores anterior e novo de um campo alterado.
function criarAlteracaoHistorico(registro, nome) {
    const anterior = formatarValorHistorico(
        nome,
        valorBrutoHistorico(registro, nome, "anterior")
    );
    const novo = formatarValorHistorico(
        nome,
        valorBrutoHistorico(registro, nome, "novo")
    );
    const alteracao = document.createElement("div");
    const titulo = document.createElement("strong");

    alteracao.className = "historico-alteracao";
    titulo.textContent = rotuloCampoHistorico(nome);
    alteracao.appendChild(titulo);

    if (registro.acao === "criacao") {
        alteracao.appendChild(
            criarTextoHistorico(
                "historico-valor",
                novo ?? "Detalhe não registrado"
            )
        );
        return alteracao;
    }

    if (registro.acao === "exclusao") {
        alteracao.appendChild(
            criarTextoHistorico(
                "historico-valor",
                anterior ?? "Detalhe não registrado"
            )
        );
        return alteracao;
    }

    if (anterior === null && novo === null) {
        alteracao.appendChild(
            criarTextoHistorico(
                "historico-legado",
                "Valores não registrados nesta versão do histórico"
            )
        );
        return alteracao;
    }

    alteracao.append(
        criarTextoHistorico(
            "historico-valor historico-valor-anterior",
            `De: ${anterior ?? "Não informado"}`
        ),
        criarTextoHistorico(
            "historico-valor historico-valor-novo",
            `Para: ${novo ?? "Não informado"}`
        )
    );
    return alteracao;
}

// Função: Monta um item completo da linha do tempo conforme a ação e os dados do registro.
function criarItemHistorico(registro) {
    const item = document.createElement("article");
    const cabecalho = document.createElement("div");
    const acao = document.createElement("strong");
    const data = document.createElement("span");
    const detalhes = document.createElement("div");

    item.className = "historico-item";
    cabecalho.className = "historico-cabecalho";
    acao.textContent = rotuloAcao(registro.acao);
    data.textContent = formatarDataHora(registro.created_at);
    cabecalho.append(acao, data);

    detalhes.className = "historico-detalhes";
    camposDoRegistro(registro).forEach((campo) => {
        detalhes.appendChild(criarAlteracaoHistorico(registro, campo));
    });

    item.append(
        cabecalho,
        criarTextoHistorico(
            "historico-responsavel",
            `Responsável: ${registro.usuario_nome}`
        )
    );
    if (detalhes.childElementCount) item.appendChild(detalhes);
    if (registro.descricao) {
        item.appendChild(
            criarTextoHistorico(
                "historico-observacao",
                `Observação: ${registro.descricao}`
            )
        );
    }
    return item;
}

document.getElementById("btnHistorico").addEventListener("click", async () => {
    if (!exigirAtivoSelecionado()) return;
    try {
        const response = await fetch(
            `/api/ativos/${encodeURIComponent(ativoSelecionadoId)}/historico`
        );
        const registros = await lerResposta(
            response,
            "Erro ao carregar histórico"
        );
        const lista = document.getElementById("listaHistorico");
        lista.replaceChildren();
        if (!registros.length) {
            lista.appendChild(
                criarTextoHistorico(
                    "historico-vazio",
                    "Nenhuma movimentação registrada."
                )
            );
        }
        registros.forEach((registro) => {
            lista.appendChild(criarItemHistorico(registro));
        });
        modalHistorico.classList.remove("oculto");
    } catch (erro) {
        mostrarNotificacao(erro.message, "erro");
    }
});

document.getElementById("fecharHistorico").addEventListener("click", () => {
    modalHistorico.classList.add("oculto");
});

document.getElementById("btnTransferir").addEventListener("click", async () => {
    if (!exigirAtivoSelecionado()) return;
    try {
        const patrimonio = ativoSelecionado;
        const [setores, contexto] = await Promise.all([
            lerResposta(await fetch("/api/setores"), "Erro ao carregar setores"),
            lerResposta(await fetch(`/api/vinculos/ativo/${encodeURIComponent(tipo)}/${encodeURIComponent(patrimonio)}`),
                "Erro ao consultar o ativo e seus vínculos")
        ]);
        transferenciaAberta = {
            patrimonio: contexto.ativo.patrimonio,
            ativoId: contexto.ativo.ativo_id,
            revisao: contexto.ativo.revisao,
            grupo_esperado: contexto.grupo ? { id: contexto.grupo.id, revisao: contexto.grupo.revisao } : null
        };
        const membros = contexto.grupo?.membros?.map(item => item.patrimonio).join(", ");
        document.getElementById("resumoTransferencia").textContent = membros
            ? `Grupo ${contexto.grupo.nome}: ${membros}. Todos os integrantes serão movidos.`
            : `Ativo ${contexto.ativo.patrimonio}, sem grupo. Apenas este ativo será movido.`;
        const select = document.getElementById("setorDestino");
        const opcaoInicial = document.createElement("option");
        opcaoInicial.value = "";
        opcaoInicial.textContent = "Selecione o setor de destino";
        select.replaceChildren(opcaoInicial);
        setores.forEach((setor) => {
            const option = document.createElement("option");
            option.value = setor.id;
            option.textContent = setor.nome;
            select.appendChild(option);
        });
        modalTransferencia.classList.remove("oculto");
    } catch (erro) {
        mostrarNotificacao(erro.message, "erro");
    }
});

document
    .getElementById("cancelarTransferencia")
    .addEventListener("click", () => {
        modalTransferencia.classList.add("oculto");
        transferenciaAberta = null;
    });

document
    .getElementById("formTransferencia")
    .addEventListener("submit", async (evento) => {
        evento.preventDefault();
        try {
            if (!transferenciaAberta) throw new Error("Reabra a transferência para conferir o ativo.");
            const formulario = transferenciaAberta;
            const response = await fetch(
                `/api/${encodeURIComponent(tipo)}/${encodeURIComponent(
                    formulario.patrimonio
                )}/transferir`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        setor_id: document.getElementById("setorDestino").value,
                        observacao: document.getElementById(
                            "observacaoTransferencia"
                        ).value,
                        revisao: formulario.revisao,
                        grupo_esperado: formulario.grupo_esperado
                    })
                }
            );
            await lerResposta(response, "Erro ao transferir ativo");
            modalTransferencia.classList.add("oculto");
            transferenciaAberta = null;
            ativoSelecionado = null;
            ativoSelecionadoId = null;
            ativoSelecionadoRevisao = null;
            await carregarAtivos();
        } catch (erro) {
            if (!mostrarConflitoDeRevisao(erro,
                `/ativo.html?unidade=${encodeURIComponent(usuarioAtual.unidade_id)}&ativo=${encodeURIComponent(transferenciaAberta?.ativoId)}`)) {
                mostrarNotificacao(erro.message, "erro");
            }
        }
    });
