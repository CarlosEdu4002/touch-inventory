// =====================
// Dependências e configurações
// =====================

const crypto = require("crypto");
const authModel = require("../models/auth.model");
const {
    criarHashSenha,
    verificarSenha
} = require("../utils/senha");

// =====================
// Validações e regras de negócio
// =====================

// Função: Cria um erro de autenticação e sessões com mensagem e status HTTP para tratamento uniforme pelas camadas superiores.
function criarErro(mensagem, status) {
    const erro = new Error(mensagem);
    erro.status = status;
    return erro;
}

// Função: Confere os requisitos mínimos da senha e identifica a conta correspondente na mensagem de erro.
function validarSenha(senha, nomeConta) {
    if (typeof senha !== "string" || senha.length < 8) {
        throw criarErro(
            `A senha de ${nomeConta} deve possuir pelo menos 8 caracteres`,
            400
        );
    }
}

// Função: Informa se já existem usuários e se a instalação inicial foi configurada.
async function statusConfiguracao() {
    return {
        configurado: (await authModel.contarUsuarios()) > 0
    };
}

// Função: Valida os dados e cria somente a conta administrativa no primeiro acesso.
async function configurar(dados) {
    const nome = String(dados?.nome || "").trim();
    const login = String(dados?.login || "").trim().toLowerCase();
    const senha = dados?.senha;
    if (!nome || nome.length > 100) throw criarErro("Informe o nome do administrador", 400);
    if (!/^[a-z0-9._-]{3,60}$/.test(login)) throw criarErro("Informe um login válido", 400);
    validarSenha(senha, "administrador");
    await authModel.configurarUsuariosIniciais([{
        nome, login, perfil: "admin", setor_id: null,
        senha_hash: await criarHashSenha(senha)
    }]);
}
// Função: Valida as credenciais, cria uma nova sessão e devolve o token com os dados públicos do usuário.
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

// Função: Seleciona somente os dados seguros do usuário que podem ser enviados ao navegador.
function apresentarUsuario(usuario) {
    return {
        id: usuario.id,
        login: usuario.login,
        nome: usuario.nome,
        perfil: usuario.perfil,
        setor_id: usuario.setor_id,
        setor_nome: usuario.setor_nome,
        unidade_id: usuario.unidade_id || null,
        unidade_nome: usuario.unidade_nome || null,
        contexto_versao: usuario.contexto_versao ?? null,
        setores_ids: usuario.setores_ids || []
    };
}

// =====================
// Exportações
// =====================

module.exports = {
    statusConfiguracao,
    configurar,
    login,
    apresentarUsuario
};
