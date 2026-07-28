const authService = require("../services/auth.service");
const authModel = require("../models/auth.model");
const { NOME_COOKIE } = require("../middlewares/auth.middleware");

const tentativas = new Map();

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

function responderErro(res, erro) {
    return res.status(erro.status || 500).json({
        erro: erro.status
            ? erro.message
            : "Erro interno de autenticação"
    });
}

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

async function status(req, res) {
    try {
        return res.json(await authService.statusConfiguracao());
    } catch (erro) {
        return responderErro(res, erro);
    }
}

async function configurar(req, res) {
    try {
        await authService.configurar(req.body.senha);
        return res.status(201).json({
            mensagem: "Acesso inicial configurado com sucesso"
        });
    } catch (erro) {
        return responderErro(res, erro);
    }
}

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

async function me(req, res) {
    return res.json({
        usuario: authService.apresentarUsuario(req.usuario)
    });
}

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

module.exports = {
    status,
    configurar,
    login,
    me,
    logout
};
