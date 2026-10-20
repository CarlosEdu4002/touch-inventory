// =====================
// Dependências e configurações
// =====================

const gestaoModel = require("../models/gestao.model");
const gestaoService = require("../services/gestao.service");

// =====================
// Controladores das requisições
// =====================

// Função: Converte falhas de dados de gestão em uma resposta HTTP apropriada, preservando mensagens conhecidas e ocultando erros internos.
function responder(res, erro, padrao) {
    console.error(erro);
    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : padrao
    });
}

// Função: Carrega os indicadores consolidados da gestão e os envia ao painel do usuário.
async function dashboard(req, res) {
    try {
        return res.json(await gestaoModel.dashboard(req.usuario));
    } catch (erro) {
        return responder(res, erro, "Erro ao carregar dashboard");
    }
}

// Função: Lista empréstimos ainda abertos na ordem de prioridade calculada pelo banco.
async function listarEmprestimos(req, res) {
    try {
        return res.json(await gestaoModel.listarEmprestimos(req.usuario));
    } catch (erro) {
        return responder(res, erro, "Erro ao carregar empréstimos");
    }
}

// Função: Lista os status disponíveis, ocultando os inativos para usuários sem acesso administrativo.
async function listarStatus(req, res) {
    try {
        const apenasAtivos =
            req.usuario.perfil !== "admin" ||
            req.query.apenasAtivos === "true";

        return res.json(
            await gestaoModel.listarStatus(apenasAtivos)
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao listar status");
    }
}

// Função: Recebe os dados do status, solicita sua gravação e devolve o registro atualizado.
async function salvarStatus(req, res) {
    try {
        return res.json(
            await gestaoService.salvarStatus(
                req.params.codigo,
                req.body
            )
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao salvar status");
    }
}

// Função: Carrega os usuários cadastrados e os envia ao painel administrativo.
async function listarUsuarios(req, res) {
    try {
        return res.json(await gestaoModel.listarUsuarios(req.usuario.unidade_id));
    } catch (erro) {
        return responder(res, erro, "Erro ao listar usuários");
    }
}

async function acessosUsuario(req,res) {
    try { return res.json(await gestaoModel.acessosUsuario(Number(req.params.id))); }
    catch(erro) { return responder(res,erro,"Erro ao consultar acessos"); }
}

// Função: Recebe os dados do formulário, cria o usuário e devolve o cadastro sem informações sensíveis.
async function criarUsuario(req, res) {
    try {
        return res.status(201).json(
            await gestaoService.criarUsuario(req.body)
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao criar usuário");
    }
}

// Função: Atualiza nome, estado ou senha do usuário indicado, considerando a identidade do administrador atual.
async function atualizarUsuario(req, res) {
    try {
        return res.json(
            await gestaoService.atualizarUsuario(
                req.params.id,
                req.body,
                req.usuario
            )
        );
    } catch (erro) {
        return responder(res, erro, "Erro ao atualizar usuário");
    }
}

// Função: Atende a solicitação administrativa e encerra as sessões do usuário indicado.
async function encerrarSessoes(req, res) {
    try {
        await gestaoModel.encerrarSessoes(Number(req.params.id));
        return res.json({ mensagem: "Sessões encerradas" });
    } catch (erro) {
        return responder(res, erro, "Erro ao encerrar sessões");
    }
}

// =====================
// Exportações
// =====================

module.exports = {
    dashboard,
    listarEmprestimos,
    listarStatus,
    salvarStatus,
    listarUsuarios,
    acessosUsuario,
    criarUsuario,
    atualizarUsuario,
    encerrarSessoes
};
