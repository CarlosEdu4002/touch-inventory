// =====================
// Dependências e configurações
// =====================

const crypto = require("crypto");
const authModel = require("../models/auth.model");

const NOME_COOKIE = "inventario_sessao";

// =====================
// Validação das requisições
// =====================

// Função: Interpreta o cabeçalho de cookies e devolve seus pares de nomes e valores decodificados.
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

// Função: Gera o resumo SHA-256 usado para localizar uma sessão sem armazenar o token original.
function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

// Função: Valida o cookie de sessão, carrega o usuário autenticado na requisição e bloqueia acessos inválidos.
async function exigirAutenticacao(req, res, next) {
    try {
        const token = lerCookies(req)[NOME_COOKIE];

        if (!token) {
            return res.status(401).json({
                erro: "Autenticação necessária"
            });
        }

        const tokenHash = hashToken(token);
        const usuario = await authModel.buscarSessao(tokenHash);

        if (!usuario) {
            return res.status(401).json({
                erro: "Sessão inválida ou expirada"
            });
        }

        req.usuario = usuario;
        req.tokenSessaoHash = tokenHash;
        return next();
    } catch (erro) {
        return next(erro);
    }
}

// Função: Permite a continuação da requisição somente quando o usuário autenticado possui perfil administrativo.
function exigirAdmin(req, res, next) {
    if (req.usuario?.perfil !== "admin") {
        return res.status(403).json({
            erro: "Acesso restrito ao administrador"
        });
    }

    return next();
}

// =====================
// Exportações
// =====================

module.exports = {
    NOME_COOKIE,
    exigirAutenticacao,
    exigirAdmin
};
