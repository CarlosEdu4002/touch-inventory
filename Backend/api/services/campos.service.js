// =====================
// Dependências e configurações
// =====================

const camposModel = require("../models/campos.model");
const tiposAtivoModel = require("../models/tiposAtivo.model");
const { NOMES_RESERVADOS } = require("./validacaoCampos.service");

const TIPOS_PERMITIDOS = new Set([
    "texto",
    "numero",
    "data",
    "booleano",
    "selecao",
    "select",
    "textarea"
]);

// =====================
// Validações e regras de negócio
// =====================

// Função: Cria um erro de campos dinâmicos com mensagem e status HTTP para tratamento uniforme pelas camadas superiores.
function criarErro(mensagem, status) {
    const erro = new Error(mensagem);
    erro.status = status;
    return erro;
}

// Função: Converte e valida o identificador de campos dinâmicos, rejeitando valores que não sejam inteiros positivos.
function validarId(valor, campo = "ID do campo") {
    const id = Number(valor);

    if (!Number.isInteger(id) || id <= 0) {
        throw criarErro(`${campo} inválido`, 400);
    }

    return id;
}

// Função: Confirma que o tipo de ativo existe antes de consultar ou cadastrar seus campos.
async function validarTipoAtivo(tipoAtivoId) {
    const existe = await camposModel.tipoAtivoExiste(tipoAtivoId);

    if (!existe) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }
}

// Função: Confirma que o usuário pode administrar o tipo ao qual o campo dinâmico pertence.
async function validarTipoGerenciavel(tipoAtivoId, usuario) {
    await validarTipoAtivo(tipoAtivoId);
    const permitido = await tiposAtivoModel.usuarioPodeGerenciar(
        tipoAtivoId,
        usuario
    );

    if (!permitido) {
        throw criarErro(
            "Tipo de ativo não encontrado ou sem permissão",
            404
        );
    }
}

// Função: Mantém valores booleanos válidos ou aplica o valor padrão configurado.
function normalizarBooleano(valor, padrao) {
    return typeof valor === "boolean" ? valor : padrao;
}

// Função: Valida e normaliza toda a definição recebida para um campo dinâmico.
function normalizarDados(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw criarErro("Definição do campo inválida", 400);
    for (const chave of ["nome", "label", "tipo"]) {
        if (typeof body[chave] !== "string") throw criarErro(`${chave} deve ser um texto`, 400);
    }
    for (const chave of ["obrigatorio", "editavel", "visivel"]) {
        if (body[chave] !== undefined && typeof body[chave] !== "boolean") throw criarErro(`${chave} deve ser booleano`, 400);
    }
    if (NOMES_RESERVADOS.has(body.nome.trim().toLowerCase())) throw criarErro("Nome reservado para campos do sistema", 400);
    if (body.opcoes !== undefined && (!Array.isArray(body.opcoes) || body.opcoes.some(opcao => typeof opcao !== "string"))) {
        throw criarErro("Opções devem ser uma lista de textos", 400);
    }
    const tipoAtivoId = validarId(
        body.tipo_ativo_id,
        "ID do tipo de ativo"
    );
    const nome = body.nome?.trim();
    const label = body.label?.trim();
    const tipo = body.tipo?.trim().toLowerCase();
    const ordem = body.ordem === undefined ? 0 : Number(body.ordem);
    const opcoesInformadas = Array.isArray(body.opcoes)
        ? body.opcoes
        : [];
    const opcoes = [
        ...new Set(
            opcoesInformadas
                .map((opcao) => String(opcao).trim())
                .filter(Boolean)
        )
    ];

    if (!nome || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(nome)) {
        throw criarErro(
            "Nome deve começar com uma letra e conter apenas letras, números e _",
            400
        );
    }

    if (!label) {
        throw criarErro("Label do campo é obrigatório", 400);
    }

    if (!TIPOS_PERMITIDOS.has(tipo)) {
        throw criarErro(
            `Tipo inválido. Use: ${[...TIPOS_PERMITIDOS].join(", ")}`,
            400
        );
    }

    if (["select", "selecao"].includes(tipo) && opcoes.length === 0) throw criarErro("Informe ao menos uma opção para o campo de seleção", 400);

    if (!Number.isInteger(ordem) || ordem < 0) {
        throw criarErro(
            "Ordem deve ser um número inteiro maior ou igual a zero",
            400
        );
    }

    return {
        revisao: body.revisao,
        tipo_ativo_id: tipoAtivoId,
        nome,
        label,
        tipo,
        opcoes,
        obrigatorio: normalizarBooleano(body.obrigatorio, false),
        editavel: normalizarBooleano(body.editavel, true),
        visivel: normalizarBooleano(body.visivel, true),
        ordem
    };
}

// Função: Aplica as regras de acesso e devolve a lista de campos dinâmicos disponível ao usuário.
async function listarCampos(tipoAtivoIdInformado, usuario) {
    const tipoAtivoId = validarId(
        tipoAtivoIdInformado,
        "ID do tipo de ativo"
    );

    await validarTipoAtivo(tipoAtivoId);
    if (!(await tiposAtivoModel.usuarioPodeVisualizar(
        tipoAtivoId,
        usuario
    ))) {
        throw criarErro("Tipo de ativo não encontrado", 404);
    }
    return camposModel.listarPorTipo(tipoAtivoId);
}

// Função: Valida a consulta e devolve o registro correspondente de campos dinâmicos.
async function buscarCampo(idInformado, usuario) {
    const id = validarId(idInformado);
    const campo = await camposModel.buscarPorId(id);

    if (!campo) {
        throw criarErro("Campo não encontrado", 404);
    }

    if (!(await tiposAtivoModel.usuarioPodeVisualizar(campo.tipo_ativo_id, usuario))) {
        throw criarErro("Campo não encontrado", 404);
    }

    return campo;
}

// Função: Valida os dados e permissões antes de criar o registro de campos dinâmicos.
async function criarCampo(body, usuario) {
    const dados = normalizarDados(body);
    await validarTipoGerenciavel(dados.tipo_ativo_id, usuario);
    return camposModel.criar(dados,usuario);
}

// Função: Valida dados e permissões antes de atualizar o registro de campos dinâmicos.
async function atualizarCampo(idInformado, body, usuario) {
    const id = validarId(idInformado);
    const dados = normalizarDados(body);
    const campoAtual = await camposModel.buscarPorId(id);

    if (!campoAtual) {
        throw criarErro("Campo não encontrado", 404);
    }

    await validarTipoGerenciavel(
        campoAtual.tipo_ativo_id,
        usuario
    );
    await validarTipoGerenciavel(dados.tipo_ativo_id, usuario);

    const campo = await camposModel.atualizar(id, dados,usuario);

    if (!campo) {
        throw criarErro("Campo não encontrado", 404);
    }

    return campo;
}

// Função: Confere existência e permissão antes de remover o registro de campos dinâmicos.
async function removerCampo(idInformado, usuario, body={}) {
    const id = validarId(idInformado);
    const campoAtual = await camposModel.buscarPorId(id);

    if (!campoAtual) {
        throw criarErro("Campo não encontrado", 404);
    }

    await validarTipoGerenciavel(
        campoAtual.tipo_ativo_id,
        usuario
    );
    const campo = await camposModel.remover(id,usuario,body.revisao);

    if (!campo) {
        throw criarErro("Campo não encontrado", 404);
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    listarCampos,
    buscarCampo,
    criarCampo,
    atualizarCampo,
    removerCampo
};
