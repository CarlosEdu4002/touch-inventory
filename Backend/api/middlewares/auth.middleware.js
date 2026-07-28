const crypto = require("crypto");
const authModel = require("../models/auth.model");

const NOME_COOKIE = "inventario_sessao";

function lerCookies(req) {
    return String(req.headers.cookie || "")
        .split(";")
        .map((parte) => parte.trim().split("="))
        .reduce((cookies, [nome, ...valor]) => {
            if (nome) {
                cookies[nome] = decodeURIComponent(valor.join("="));
            }
            return cookies;
        }, {});
}

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

async function exigirAutenticacao(req, res, next) {
    try {
        const token = lerCookies(req)[NOME_COOKIE];

        if (!token) {
            return res.status(401).json({
                erro: "Autenticação necessária"
            });
        }

        const usuario = await authModel.buscarSessao(
            hashToken(token)
        );

        if (!usuario) {
            return res.status(401).json({
                erro: "Sessão inválida ou expirada"
            });
        }

        req.usuario = usuario;
        req.tokenSessaoHash = hashToken(token);
        return next();
    } catch (erro) {
        return next(erro);
    }
}

function exigirAdmin(req, res, next) {
    if (req.usuario?.perfil !== "admin") {
        return res.status(403).json({
            erro: "Acesso restrito ao administrador"
        });
    }

    return next();
}

module.exports = {
    NOME_COOKIE,
    exigirAutenticacao,
    exigirAdmin
};
