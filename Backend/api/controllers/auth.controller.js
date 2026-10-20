// =====================
// Dependências e configurações
// =====================

const authService = require("../services/auth.service");
const authModel = require("../models/auth.model");
const { NOME_COOKIE } = require("../middlewares/auth.middleware");

const tentativas = new Map();

// =====================
// Controladores das requisições
// =====================

// Função: Monta o cookie HTTP protegido que transporta o token da sessão autenticada.
function cookieSessao(token) {
    const partes = [
        `${NOME_COOKIE}=${encodeURIComponent(token)}`,
        "HttpOnly",
        "SameSite=Lax",
        "Path=/",
        "Max-Age=28800"
    ];

    if (process.env.NODE_ENV === "production") {
        partes.push("Secure");
    }

    return partes.join("; ");
}

// Função: Converte falhas de autenticação em respostas HTTP seguras para o cliente.
function responderErro(res, erro) {
    return res.status(erro.status || 500).json({
        erro: erro.status
            ? erro.message
            : "Erro interno de autenticação"
    });
}

// Função: Registra tentativas por endereço e bloqueia temporariamente excesso de autenticações.
function verificarLimite(req) {
    const chave = req.ip || "local";
    const agora = Date.now();
    const registro = tentativas.get(chave) || {
        quantidade: 0,
        inicio: agora
    };

    if (agora - registro.inicio > 15 * 60 * 1000) {
        registro.quantidade = 0;
        registro.inicio = agora;
    }

    if (registro.quantidade >= 10) {
        const erro = new Error(
            "Muitas tentativas. Aguarde alguns minutos"
        );
        erro.status = 429;
        throw erro;
    }

    registro.quantidade += 1;
    tentativas.set(chave, registro);
    return chave;
}

// Função: Informa ao cliente se a configuração inicial de usuários já foi concluída.
async function status(req, res) {
    try {
        return res.json(await authService.statusConfiguracao());
    } catch (erro) {
        return responderErro(res, erro);
    }
}

// Função: Recebe as senhas iniciais, cria as contas padrão e confirma a configuração do acesso.
async function configurar(req, res) {
    try {
        await authService.configurar(req.body);
        return res.status(201).json({
            mensagem: "Acesso inicial configurado com sucesso"
        });
    } catch (erro) {
        return responderErro(res, erro);
    }
}

// Função: Valida o limite e as credenciais, grava o cookie de sessão e devolve o usuário autenticado.
async function login(req, res) {
    try {
        const chaveLimite = verificarLimite(req);
        const resultado = await authService.login(
            req.body.login,
            req.body.senha
        );

        tentativas.delete(chaveLimite);
        res.setHeader("Set-Cookie", cookieSessao(resultado.token));
        return res.json({ usuario: resultado.usuario });
    } catch (erro) {
        return responderErro(res, erro);
    }
}

// Função: Devolve os dados públicos do usuário associado à sessão atual.
async function me(req, res) {
    return res.json({
        usuario: authService.apresentarUsuario(req.usuario)
    });
}

// Função: Remove a sessão atual, expira o cookie e confirma o encerramento do acesso.
async function logout(req, res) {
    try {
        await authModel.removerSessao(req.tokenSessaoHash);
        res.setHeader(
            "Set-Cookie",
            `${NOME_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
        );
        return res.json({ mensagem: "Sessão encerrada" });
    } catch (erro) {
        return responderErro(res, erro);
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    status,
    configurar,
    login,
    me,
    logout
};
