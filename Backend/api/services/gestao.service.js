// =====================
// Dependências e configurações
// =====================

const gestaoModel = require("../models/gestao.model");
const { criarHashSenha } = require("../utils/senha");

// =====================
// Validações e regras de negócio
// =====================

// Função: Cria um erro de dados de gestão com mensagem e status HTTP para tratamento uniforme pelas camadas superiores.
function erro(mensagem, status = 400) {
    const e = new Error(mensagem);
    e.status = status;
    return e;
}

// Função: Normaliza o nome visível do status para produzir seu código interno estável.
function codigoStatus(nome) {
    return String(nome || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

// Função: Valida e normaliza os dados antes de criar ou atualizar um status de ativo.
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

async function validarAcessos(acessos) {
    if (!Array.isArray(acessos) || !acessos.length) throw erro("Selecione ao menos uma unidade e um setor");
    const unidades=new Set();
    const resultado=[];
    for(const item of acessos) {
        const unidadeId=Number(item.unidade_id);
        const ids=(item.setores_ids || []).map(Number);
        if(!Number.isInteger(unidadeId) || unidades.has(unidadeId) || !ids.length ||
            ids.some(id=>!Number.isInteger(id) || id<1) || new Set(ids).size!==ids.length)
            throw erro("Seleção de unidades e setores inválida");
        unidades.add(unidadeId);
        const unidade=await gestaoModel.unidadePorId(unidadeId);
        if(!unidade?.ativo)throw erro("Unidade inválida ou inativa");
        const validos=await gestaoModel.setoresAtivosDaUnidade(unidade.schema_nome,ids);
        if(validos.length!==ids.length)throw erro("Há setor inválido ou inativo na seleção");
        resultado.push({unidade_id:unidadeId,setores_ids:ids});
    }
    return resultado;
}
async function criarUsuario(body) {
    const nome=String(body.nome || "").trim();
    const login=String(body.login || "").trim().toLowerCase();
    const perfil=String(body.perfil || "").trim().toLowerCase();
    const senha=String(body.senha || "");
    if(!nome || nome.length>100)throw erro("Informe o nome (até 100 caracteres)");
    if(!/^[a-z0-9._-]{3,60}$/.test(login))throw erro("Login inválido");
    if(!["admin","setor"].includes(perfil))throw erro("Perfil inválido");
    if(senha.length<8)throw erro("A senha deve possuir pelo menos 8 caracteres");
    let acessos=[];
    let setorId=null;
    if(perfil==="setor") {
        if(process.env.INVENTARIO_TEST_SCHEMA) {
            setorId=Number(body.setor_id);
            if(!Number.isInteger(setorId) || !(await gestaoModel.buscarSetorAtivo(setorId)))
                throw erro("Setor inválido ou inativo");
        } else acessos=await validarAcessos(body.acessos);
    }
    try {
        return await gestaoModel.criarUsuario({
            nome,login,perfil,senha_hash:await criarHashSenha(senha),
            ativo:body.ativo!==false,acessos,setor_id:setorId
        });
    } catch(e) {
        if(e.code==="23505")throw erro("Já existe um usuário com esse login",409);
        throw e;
    }
}

// Função: Atualiza dados e senha do usuário, impedindo autobloqueio e encerrando sessões quando necessário.
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
    let acessos;
    if(!process.env.INVENTARIO_TEST_SCHEMA && body.acessos !== undefined) {
        const usuario = (await gestaoModel.listarUsuarios(usuarioAtual.unidade_id))
            .find(u=>u.id===usuarioId);
        if(!usuario)throw erro("Usuário não encontrado",404);
        acessos=usuario.perfil==="admin" ? [] : await validarAcessos(body.acessos);
    }
    const atualizado = await gestaoModel.atualizarUsuario(usuarioId, {
        acessos,
        nome: body.nome ? String(body.nome).trim() : null,
        ativo:
            typeof body.ativo === "boolean" ? body.ativo : null,
        senha_hash: senhaHash
    });
    if (!atualizado) throw erro("Usuário não encontrado", 404);
    if (senhaHash || body.ativo === false || acessos) {
        await gestaoModel.encerrarSessoes(usuarioId);
    }
    return atualizado;
}

// =====================
// Exportações
// =====================

module.exports = { salvarStatus, criarUsuario, atualizarUsuario };
