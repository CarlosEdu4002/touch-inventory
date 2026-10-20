// =====================
// Dependências e configurações
// =====================

const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

// =====================
// Funções de segurança
// =====================

// Função: Gera um salt aleatório e cria o hash scrypt usado para armazenar a senha com segurança.
async function criarHashSenha(senha) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(senha, salt, 64);

    return `scrypt$${salt}$${hash.toString("hex")}`;
}

// Função: Recalcula o hash da senha informada e compara seu conteúdo de forma resistente a ataques de tempo.
async function verificarSenha(senha, hashArmazenado) {
    const [algoritmo, salt, hashHex] = String(
        hashArmazenado || ""
    ).split("$");

    if (algoritmo !== "scrypt" || !salt || !hashHex) {
        return false;
    }

    const hashEsperado = Buffer.from(hashHex, "hex");
    const hashInformado = await scrypt(
        senha,
        salt,
        hashEsperado.length
    );

    return crypto.timingSafeEqual(hashEsperado, hashInformado);
}

// =====================
// Exportações
// =====================

module.exports = {
    criarHashSenha,
    verificarSenha
};
