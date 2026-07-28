const crypto = require("crypto");
const authModel = require("../models/auth.model");
const {
    criarHashSenha,
    verificarSenha
} = require("../utils/senha");

const CONTA_ADMINISTRADOR = {
    login: "admin",
    nome: "Administrador",
    perfil: "admin",
    setor_nome: null
};

function criarErro(mensagem, status) {
    const erro = new Error(mensagem);
    erro.status = status;
    return erro;
}

function validarSenha(senha, nomeConta) {
    if (typeof senha !== "string" || senha.length < 8) {
        throw criarErro(
            `A senha de ${nomeConta} deve possuir pelo menos 8 caracteres`,
            400
        );
    }
}

async function statusConfiguracao() {
    return {
        configurado: (await authModel.contarUsuarios()) > 0
    };
}

async function configurar(senha) {
    validarSenha(senha, CONTA_ADMINISTRADOR.nome);
    await authModel.configurarUsuariosIniciais([
        {
            ...CONTA_ADMINISTRADOR,
            senha_hash: await criarHashSenha(senha)
        }
    ]);
}

async function login(loginInformado, senha) {
    const login = String(loginInformado || "").trim();

    if (!login || !senha) {
        throw criarErro("Informe login e senha", 400);
    }

    const usuario = await authModel.buscarUsuarioPorLogin(login);

    if (
        !usuario ||
        !usuario.ativo ||
        !(await verificarSenha(senha, usuario.senha_hash))
    ) {
        throw criarErro("Login ou senha inválidos", 401);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    await authModel.criarSessao(tokenHash, usuario.id);

    return {
        token,
        usuario: apresentarUsuario(usuario)
    };
}

function apresentarUsuario(usuario) {
    return {
        id: usuario.id,
        login: usuario.login,
        nome: usuario.nome,
        perfil: usuario.perfil,
        setor_id: usuario.setor_id,
        setor_nome: usuario.setor_nome
    };
}

module.exports = {
    statusConfiguracao,
    configurar,
    login,
    apresentarUsuario
};
