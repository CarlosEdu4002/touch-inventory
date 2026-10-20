// =====================
// Dependências e configurações
// =====================

const setoresModel = require("../models/setores.model");

// =====================
// Controladores das requisições
// =====================

// Função: Atende a rota de listagem de setores e devolve os registros permitidos ao cliente.
async function listar(req, res) {
    try {
        return res.json(
            await setoresModel.listar(
                req.usuario.perfil === "admin" &&
                    req.query.todos === "true"
            )
        );
    } catch (erro) {
        console.error(erro);
        return res.status(500).json({
            erro: "Erro ao listar setores"
        });
    }
}

// Função: Normaliza o nome do setor, exige seu preenchimento e define se o registro permanecerá ativo.
function validar(body) {
    const nome = String(body.nome || "").trim();
    if (!nome) {
        const erro = new Error("Nome do setor é obrigatório");
        erro.status = 400;
        throw erro;
    }
    return { nome, ativo: body.ativo !== false };
}

// Função: Converte falhas de setores em uma resposta HTTP apropriada, preservando mensagens conhecidas e ocultando erros internos.
function responderErro(res, erro, mensagem) {
    if (erro.code === "23505") {
        return res.status(400).json({ erro: "Esse setor já existe" });
    }
    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagem
    });
}

// Função: Recebe os dados da rota, solicita a criação de setores e devolve o resultado ao cliente.
async function criar(req, res) {
    try {
        const { nome } = validar(req.body);
        return res.status(201).json(await setoresModel.criar(nome));
    } catch (erro) {
        return responderErro(res, erro, "Erro ao criar setor");
    }
}

// Função: Recebe as alterações da rota, solicita a atualização de setores e responde ao cliente.
async function atualizar(req, res) {
    try {
        const dados = validar(req.body);
        const setor = await setoresModel.atualizar(
            Number(req.params.id),
            dados.nome,
            dados.ativo
        );
        if (!setor) {
            return res.status(404).json({ erro: "Setor não encontrado" });
        }
        return res.json(setor);
    } catch (erro) {
        return responderErro(res, erro, "Erro ao atualizar setor");
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    listar,
    criar,
    atualizar
};
