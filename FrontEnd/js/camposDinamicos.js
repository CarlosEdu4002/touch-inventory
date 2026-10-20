// =====================
// Estado e configurações da interface
// =====================

const cacheContextoTipos = new Map();

// =====================
// Funções da interface
// =====================

// Função: Converte o nome do tipo em texto sem espaços externos e em minúsculas para permitir comparações consistentes.
function normalizarNomeTipo(valor) {
    return String(valor || "")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

// Função: Converte a resposta HTTP em JSON e lança uma mensagem compreensível quando a requisição não é bem-sucedida.
async function lerResposta(response, mensagemPadrao) {
    const dados = await response.json().catch(() => ({}));

    if (!response.ok) {
        const erro = new Error(dados.erro || mensagemPadrao);
        erro.status = response.status;
        erro.codigo = dados.codigo;
        throw erro;
    }

    return dados;
}

// Função: Localiza o tipo de ativo solicitado, seus campos dinâmicos e seus status, reutilizando o resultado armazenado em cache.
async function obterContextoTipo(nomeTipo) {
    const chave = normalizarNomeTipo(nomeTipo);

    if (cacheContextoTipos.has(chave)) {
        return cacheContextoTipos.get(chave);
    }

    // Função: Agrupa e armazena em cache as consultas necessárias para montar o contexto completo do tipo de ativo.
    const promessa = (async () => {
        const responseTipos = await fetch("/api/tipos");
        const tipos = await lerResposta(
            responseTipos,
            "Erro ao carregar tipos de ativo"
        );

        const tiposEncontrados = tipos.filter(
            (item) =>
                /^\d+$/.test(String(nomeTipo)) ? String(item.id)===String(nomeTipo)
                    : normalizarNomeTipo(item.nome)===chave
        );
        if (tiposEncontrados.length>1) throw new Error("Nome de tipo ambíguo. Abra o tipo pela página inicial.");
        const tipoEncontrado=tiposEncontrados[0];

        if (!tipoEncontrado) {
            throw new Error(`Tipo de ativo "${nomeTipo}" não encontrado`);
        }

        const responseCampos = await fetch(
            `/api/tipos/${tipoEncontrado.id}/campos`
        );
        const camposConfigurados = await lerResposta(
            responseCampos,
            "Erro ao carregar campos do tipo de ativo"
        );

        const patrimonio = {
            nome: "patrimonio",
            label: "Patrimônio",
            tipo: "texto",
            obrigatorio: true,
            editavel: false,
            visivel: true,
            ordem: -1,
            campo_sistema: true
        };

        const usuario = await obterUsuarioAtual();
        const responseSetores = await fetch("/api/setores");
        const setores = await lerResposta(
            responseSetores,
            "Erro ao carregar setores"
        );
        const campoSetor = {
            nome: "setor_id",
            label: "Setor de alocação",
            tipo: "select",
            opcoes: setores.map((setor) => ({
                valor: setor.id,
                label: setor.nome
            })),
            obrigatorio: true,
            editavel: false,
            visivel: true,
            ordem: 0,
            campo_sistema: true
        };
        const responseStatus = await fetch(
            "/api/gestao/status?apenasAtivos=true"
        );
        const status = await lerResposta(
            responseStatus,
            "Erro ao carregar status"
        );
        const campoStatus = {
            nome: "status",
            label: "Status",
            tipo: "select",
            opcoes: status.map((item) => ({
                valor: item.codigo,
                label: item.nome
            })),
            obrigatorio: true,
            editavel: true,
            visivel: true,
            ordem: 1,
            campo_sistema: true
        };

        return {
            tipo: tipoEncontrado,
            campos: [
                patrimonio,
                campoSetor,
                campoStatus,
                ...camposConfigurados.filter(
                    (campo) =>
                        ![
                            "patrimonio",
                            "setor",
                            "setor_id",
                            "status"
                        ].includes(
                            campo.nome
                        )
                )
            ]
        };
    })();

    cacheContextoTipos.set(chave, promessa);

    try {
        return await promessa;
    } catch (erro) {
        cacheContextoTipos.delete(chave);
        throw erro;
    }
}

// Função: Filtra a configuração e devolve somente os campos marcados para exibição.
function camposVisiveis(campos) {
    return campos.filter((campo) => campo.visivel !== false);
}

// Função: Traduz o tipo lógico do campo para o tipo de controle HTML usado no formulário.
function tipoInput(campo) {
    const tipos = {
        texto: "text",
        numero: "number",
        data: "date",
        booleano: "checkbox",
        selecao: "select",
        select: "select",
        textarea: "textarea"
    };

    return tipos[campo.tipo] || "text";
}

// Função: Converte o valor armazenado para um texto amigável conforme o tipo e as opções configuradas do campo.
function formatarValorCampo(campo, valor) {
    if (valor === undefined || valor === null || valor === "") {
        return "";
    }

    if (campo.tipo === "booleano") {
        return valor === true ? "Sim" : "Não";
    }

    if (["select", "selecao"].includes(campo.tipo)) {
        const opcao = (campo.opcoes || []).find((item) =>
            typeof item === "object"
                ? String(item.valor) === String(valor)
                : String(item) === String(valor)
        );

        if (opcao && typeof opcao === "object") {
            return opcao.label;
        }
    }

    if (campo.tipo === "data") {
        const partes = String(valor).split("-");

        if (partes.length === 3) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
    }

    return String(valor);
}
