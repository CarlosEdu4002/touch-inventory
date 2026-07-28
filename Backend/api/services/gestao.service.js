const gestaoModel = require("../models/gestao.model");
const { criarHashSenha } = require("../utils/senha");

function erro(mensagem, status = 400) {
    const e = new Error(mensagem);
    e.status = status;
    return e;
}

function codigoStatus(nome) {
    return String(nome || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

async function salvarStatus(codigoInformado, body) {
    const nome = String(body.nome || "").trim();
    if (!nome) throw erro("Nome do status é obrigatório");
    const codigo = codigoInformado || codigoStatus(nome);
    const ordem = Number(body.ordem || 0);
    return gestaoModel.salvarStatus(codigo, {
        nome,
        cor: /^#[0-9a-f]{6}$/i.test(body.cor)
            ? body.cor
            : "#64748b",
        ativo: body.ativo !== false,
        ordem: Number.isInteger(ordem) ? ordem : 0
    });
}

async function atualizarUsuario(id, body, usuarioAtual) {
    const usuarioId = Number(id);
    if (!Number.isInteger(usuarioId)) throw erro("Usuário inválido");
    if (usuarioId === usuarioAtual.id && body.ativo === false) {
        throw erro("Você não pode bloquear sua própria conta");
    }
    let senhaHash = null;
    if (body.senha) {
        if (String(body.senha).length < 8) {
            throw erro("A nova senha deve possuir pelo menos 8 caracteres");
        }
        senhaHash = await criarHashSenha(String(body.senha));
    }
    const atualizado = await gestaoModel.atualizarUsuario(usuarioId, {
        nome: body.nome ? String(body.nome).trim() : null,
        ativo:
            typeof body.ativo === "boolean" ? body.ativo : null,
        senha_hash: senhaHash
    });
    if (!atualizado) throw erro("Usuário não encontrado", 404);
    if (senhaHash || body.ativo === false) {
        await gestaoModel.encerrarSessoes(usuarioId);
    }
    return atualizado;
}

async function criarUsuario(body) {
    const login = String(body.login || "").trim();
    const nome = String(body.nome || "").trim();
    const senha = String(body.senha || "");
    const perfil = body.perfil === "admin" ? "admin" : "setor";
    const setorId = perfil === "setor" ? Number(body.setor_id) : null;

    if (!/^[a-z0-9._-]{3,60}$/i.test(login)) {
        throw erro(
            "O login deve ter entre 3 e 60 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado"
        );
    }
    if (!nome) throw erro("Nome do usuário é obrigatório");
    if (senha.length < 8) {
        throw erro("A senha deve possuir pelo menos 8 caracteres");
    }
    if (perfil === "setor" && !Number.isInteger(setorId)) {
        throw erro("Selecione o setor do usuário");
    }
    if (await gestaoModel.buscarUsuarioPorLogin(login)) {
        throw erro("Este login já está em uso", 409);
    }

    return gestaoModel.criarUsuario({
        login,
        nome,
        senha_hash: await criarHashSenha(senha),
        perfil,
        setor_id: setorId
    });
}

module.exports = { salvarStatus, criarUsuario, atualizarUsuario };
