const { isDeepStrictEqual } = require("node:util");

const CAMPOS_SISTEMA = new Set(["patrimonio", "setor", "setor_id", "status", "imagem", "remover_imagem", "revisao", "tipo_revisao"]);
const NOMES_RESERVADOS = new Set([...CAMPOS_SISTEMA, "id", "tipo_ativo_id", "dados", "imagem_url",
    "atualizado_em", "created_at", "updated_at", "excluido_em", "recuperavel_ate", "excluido_por", "excluido_por_nome", "__proto__", "constructor", "prototype"]);

function falha(mensagem) {
    const erro = new Error(mensagem);
    erro.status = 400;
    throw erro;
}

// Função: Confere o formato do pedido e os controles próprios do cadastro de ativos.
function validarPedido(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) falha("Dados do ativo devem ser um objeto");
    if (typeof body.patrimonio !== "string" || !body.patrimonio.trim() || body.patrimonio.length > 50) {
        falha("Patrimônio deve ser um texto de 1 a 50 caracteres");
    }
    if (!["string", "number"].includes(typeof body.setor_id) ||
        !Number.isSafeInteger(Number(body.setor_id)) || Number(body.setor_id) <= 0) falha("Setor inválido");
    if (body.status !== undefined && (typeof body.status !== "string" || !body.status.trim())) falha("Status inválido");
    if (body.setor !== undefined && typeof body.setor !== "string") falha("Setor deve ser um texto");
    if (body.imagem !== undefined && typeof body.imagem !== "string") falha("Imagem inválida");
    if (body.remover_imagem !== undefined && typeof body.remover_imagem !== "boolean") falha("Remover imagem deve ser booleano");
    if (body.imagem && body.remover_imagem === true) falha("Escolha enviar ou remover a imagem");
}

// Função: Valida sem conversões permissivas; números em texto mantêm compatibilidade com o formulário.
function validarValor(campo, valor) {
    const nome = campo.label || campo.nome;
    const vazio = valor === undefined || valor === null || (typeof valor === "string" && !valor.trim());
    if (vazio) {
        if (campo.obrigatorio === true) falha(`${nome} é obrigatório`);
        return;
    }
    let valido = false;
    switch (campo.tipo) {
        case "texto": case "textarea": valido = typeof valor === "string"; break;
        case "numero":
            valido = (typeof valor === "number" && Number.isFinite(valor)) ||
                (typeof valor === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(valor.trim()) && Number.isFinite(Number(valor)));
            break;
        case "booleano": valido = typeof valor === "boolean"; break;
        case "data": {
            if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) && valor.slice(0, 4) !== "0000") {
                const data = new Date(`${valor}T00:00:00.000Z`);
                valido = !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
            }
            break;
        }
        case "select": case "selecao":
            valido = ["string", "number"].includes(typeof valor) && (campo.opcoes || []).some(opcao => {
                const permitido = opcao && typeof opcao === "object" ? opcao.valor : opcao;
                return ["string", "number"].includes(typeof permitido) && String(permitido) === String(valor);
            });
            break;
    }
    if (!valido) falha(`${nome}: valor inválido para o tipo ${campo.tipo}`);
}

// Função: Aceita a representação numérica da tela ao comparar um campo bloqueado já gravado como número.
function mesmoValor(campo, recebido, anterior) {
    if (isDeepStrictEqual(recebido, anterior)) return true;
    if (campo.tipo !== "numero") return false;
    if ([recebido, anterior].some(valor => valor === undefined || valor === null || (typeof valor === "string" && !valor.trim()))) return false;
    try {
        validarValor(campo, recebido);
        validarValor(campo, anterior);
        return Number(recebido) === Number(anterior);
    } catch { return false; }
}

// Função: Aplica a definição do tipo, preservando campos omitidos e dados antigos sem aceitar novas chaves desconhecidas.
function validarCampos(body, campos, anteriores) {
    const configurados = campos.filter(campo => !CAMPOS_SISTEMA.has(campo.nome));
    const nomes = new Set(configurados.map(campo => campo.nome));
    for (const chave of Object.keys(body)) {
        if (!CAMPOS_SISTEMA.has(chave) && (!nomes.has(chave) || NOMES_RESERVADOS.has(chave))) falha(`Campo desconhecido: ${chave}`);
    }
    const dados = { ...(anteriores || {}) };
    for (const campo of configurados) {
        if (NOMES_RESERVADOS.has(campo.nome)) continue;
        const informado = Object.hasOwn(body, campo.nome);
        if (anteriores !== undefined && campo.editavel === false) {
            if (informado && !mesmoValor(campo, body[campo.nome], anteriores[campo.nome])) falha(`${campo.label || campo.nome} não pode ser alterado`);
            continue;
        }
        const valor = informado ? body[campo.nome] : dados[campo.nome];
        validarValor(campo, valor);
        if (informado) dados[campo.nome] = valor;
    }
    return dados;
}

module.exports = { validarPedido, validarCampos, NOMES_RESERVADOS };
