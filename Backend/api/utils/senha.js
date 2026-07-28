const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

async function criarHashSenha(senha) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scrypt(senha, salt, 64);

    return `scrypt$${salt}$${hash.toString("hex")}`;
}

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

module.exports = {
    criarHashSenha,
    verificarSenha
};
