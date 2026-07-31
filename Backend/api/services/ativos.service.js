const ativosModel = require("../models/ativos.model");
const setoresModel = require("../models/setores.model");
const historicoModel = require("../models/historico.model");
const gestaoModel = require("../models/gestao.model");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DIRETORIO_IMAGENS = path.join(__dirname, "../../../uploads/ativos");
const TIPOS_IMAGEM = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};

function urlImagem(nome) {
    return nome ? `/uploads/ativos/${encodeURIComponent(nome)}` : null;
}

async function salvarImagem(valor) {
    const correspondencia =
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
            String(valor || "")
        );
    if (!correspondencia || !TIPOS_IMAGEM[correspondencia[1]]) {
        const erro = new Error("Imagem inválida. Use JPG, PNG ou WebP");
        erro.status = 400;
        throw erro;
    }
    const conteudo = Buffer.from(correspondencia[2], "base64");
    if (!conteudo.length || conteudo.length > 2 * 1024 * 1024) {
        const erro = new Error("A imagem deve ter no máximo 2 MB");
        erro.status = 400;
        throw erro;
    }
    await fs.mkdir(DIRETORIO_IMAGENS, { recursive: true });
    const nome = `${crypto.randomUUID()}.${TIPOS_IMAGEM[correspondencia[1]]}`;
    await fs.writeFile(path.join(DIRETORIO_IMAGENS, nome), conteudo, { flag: "wx" });
    return nome;
}

async function excluirImagem(nome) {
    if (!nome) return;
    await fs.unlink(path.join(DIRETORIO_IMAGENS, path.basename(nome))).catch((erro) => {
        if (erro.code !== "ENOENT") throw erro;
    });
}

// =====================
// Regras de negócio
// =====================

async function listarAtivos(tipo, usuario) {
    const ativos = await ativosModel.listarPorTipo(tipo, usuario);

    return ativos.map((ativo) => ({
        patrimonio: ativo.patrimonio,
        ...(ativo.dados || {}),
        setor_id: ativo.setor_id,
        setor: ativo.setor_nome,
        status: ativo.status,
        imagem_url: urlImagem(ativo.imagem),
        atualizado_em: ativo.updated_at
    }));
}

async function buscarAtivo(tipo, patrimonio, usuario) {
    const ativo = await ativosModel.buscarPorPatrimonio(
        tipo,
        patrimonio,
        usuario
    );

    if (!ativo) {
        const erro = new Error("Ativo não encontrado");
        erro.status = 404;
        throw erro;
    }

    return {
        patrimonio: ativo.patrimonio,
        ...(ativo.dados || {}),
        setor_id: ativo.setor_id,
        setor: ativo.setor_nome,
        status: ativo.status,
        imagem_url: urlImagem(ativo.imagem),
        atualizado_em: ativo.updated_at
    };
}

async function definirSetor(body, usuario) {
    const setorId = Number(body.setor_id);

    if (!Number.isInteger(setorId) || setorId <= 0) {
        const erro = new Error("Setor é obrigatório");
        erro.status = 400;
        throw erro;
    }

    if (!(await setoresModel.buscarPorId(setorId))) {
        const erro = new Error("Setor não encontrado");
        erro.status = 404;
        throw erro;
    }

    return setorId;
}

async function validarStatus(codigo) {
    const status = (await gestaoModel.listarStatus(true)).find(
        (item) => item.codigo === codigo
    );
    if (!status) {
        const erro = new Error("Status inválido ou desativado");
        erro.status = 400;
        throw erro;
    }
    return codigo;
}

function camposAlterados(anterior, novo) {
    const chaves = new Set([
        ...Object.keys(anterior || {}),
        ...Object.keys(novo || {})
    ]);
    return [...chaves].filter(
        (chave) =>
            JSON.stringify(anterior?.[chave]) !==
            JSON.stringify(novo?.[chave])
    );
}

async function criarAtivo(tipo, body, usuario) {
    const {
        patrimonio,
        setor_id,
        setor,
        status = "em_uso",
        imagem,
        ...dados
    } = body;

    if (!patrimonio) {
        const erro = new Error("Patrimônio é obrigatório");
        erro.status = 400;
        throw erro;
    }

    const tipoEncontrado = await ativosModel.buscarTipoPorNome(tipo);

    if (!tipoEncontrado) {
        const erro = new Error("Tipo não encontrado");
        erro.status = 404;
        throw erro;
    }

    const setorId = await definirSetor({ setor_id }, usuario);

    const ativo = await ativosModel.criar(
        tipoEncontrado.id,
        setorId,
        patrimonio,
        await validarStatus(status),
        dados
    );
    if (imagem) {
        const nomeImagem = await salvarImagem(imagem);
        try {
            await ativosModel.atualizarImagem(ativo.id, nomeImagem);
        } catch (erro) {
            await excluirImagem(nomeImagem);
            throw erro;
        }
        ativo.imagem = nomeImagem;
    }
    await historicoModel.registrar({
        ativo_id: ativo.id,
        patrimonio: ativo.patrimonio,
        tipo_ativo_id: ativo.tipo_ativo_id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "criacao",
        setor_novo_id: ativo.setor_id,
        status_novo: ativo.status,
        dados_novos: ativo.dados,
        campos_alterados: ["patrimonio", "setor", "status", ...Object.keys(dados)]
    });
}

async function atualizarAtivo(tipo, patrimonioAtual, body, usuario) {
    const {
        patrimonio,
        setor_id,
        setor,
        status = "em_uso",
        imagem,
        remover_imagem = false,
        ...dados
    } = body;

    if (!patrimonio) {
        const erro = new Error("Patrimônio é obrigatório");
        erro.status = 400;
        throw erro;
    }

    const tipoEncontrado = await ativosModel.buscarTipoPorNome(tipo);

    if (!tipoEncontrado) {
        const erro = new Error("Tipo não encontrado");
        erro.status = 404;
        throw erro;
    }

    const setorId = await definirSetor({ setor_id }, usuario);
    const anterior = await ativosModel.buscarPorPatrimonio(
        tipo,
        patrimonioAtual,
        usuario
    );
    if (!anterior) {
        const erro = new Error("Ativo não encontrado");
        erro.status = 404;
        throw erro;
    }

    const ativoAtualizado = await ativosModel.atualizar(
        tipoEncontrado.id,
        setorId,
        patrimonioAtual,
        patrimonio,
        await validarStatus(status),
        dados,
        usuario
    );

    if (!ativoAtualizado) {
        const erro = new Error("Ativo não encontrado");
        erro.status = 404;
        throw erro;
    }

    if (imagem || remover_imagem === true) {
        const imagemAnterior = anterior.imagem;
        const novaImagem = imagem ? await salvarImagem(imagem) : null;
        try {
            await ativosModel.atualizarImagem(ativoAtualizado.id, novaImagem);
            ativoAtualizado.imagem = novaImagem;
            await excluirImagem(imagemAnterior);
        } catch (erro) {
            await excluirImagem(novaImagem);
            throw erro;
        }
    } else {
        ativoAtualizado.imagem = anterior.imagem;
    }

    const alterados = camposAlterados(
        {
            patrimonio: anterior.patrimonio,
            setor_id: anterior.setor_id,
            status: anterior.status,
            ...anterior.dados
        },
        {
            patrimonio: ativoAtualizado.patrimonio,
            setor_id: ativoAtualizado.setor_id,
            status: ativoAtualizado.status,
            ...ativoAtualizado.dados
        }
    );
    await historicoModel.registrar({
        ativo_id: ativoAtualizado.id,
        patrimonio: ativoAtualizado.patrimonio,
        tipo_ativo_id: ativoAtualizado.tipo_ativo_id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "edicao",
        setor_anterior_id: anterior.setor_id,
        setor_novo_id: ativoAtualizado.setor_id,
        status_anterior: anterior.status,
        status_novo: ativoAtualizado.status,
        dados_anteriores: anterior.dados,
        dados_novos: ativoAtualizado.dados,
        campos_alterados: alterados
    });
}

async function removerAtivo(tipo, patrimonio, usuario) {
    const tipoEncontrado = await ativosModel.buscarTipoPorNome(tipo);

    if (!tipoEncontrado) {
        const erro = new Error("Tipo não encontrado");
        erro.status = 404;
        throw erro;
    }

    const ativoRemovido = await ativosModel.remover(
        tipoEncontrado.id,
        patrimonio,
        usuario
    );

    if (!ativoRemovido) {
        const erro = new Error("Ativo não encontrado");
        erro.status = 404;
        throw erro;
    }
    await excluirImagem(ativoRemovido.imagem);
    await historicoModel.registrar({
        ativo_id: null,
        patrimonio: ativoRemovido.patrimonio,
        tipo_ativo_id: ativoRemovido.tipo_ativo_id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "exclusao",
        setor_anterior_id: ativoRemovido.setor_id,
        status_anterior: ativoRemovido.status,
        dados_anteriores: ativoRemovido.dados,
        campos_alterados: []
    });
}

async function listarHistorico(tipo, patrimonio, usuario) {
    const tipoEncontrado = await ativosModel.buscarTipoPorNome(tipo);
    if (!tipoEncontrado) {
        const erro = new Error("Tipo não encontrado");
        erro.status = 404;
        throw erro;
    }
    return historicoModel.listarPorAtivo(
        tipoEncontrado.id,
        patrimonio,
        usuario
    );
}

async function transferirAtivo(tipo, patrimonio, body, usuario) {
    const novoSetorId = Number(body.setor_id);
    if (!(await setoresModel.buscarPorId(novoSetorId))) {
        const erro = new Error("Setor de destino inválido");
        erro.status = 400;
        throw erro;
    }
    const anterior = await ativosModel.buscarPorPatrimonio(
        tipo,
        patrimonio,
        usuario
    );
    if (!anterior) {
        const erro = new Error("Ativo não encontrado");
        erro.status = 404;
        throw erro;
    }
    if (anterior.setor_id === novoSetorId) {
        const erro = new Error("O ativo já pertence a esse setor");
        erro.status = 400;
        throw erro;
    }
    const atualizado = await ativosModel.transferir(
        anterior.id,
        novoSetorId
    );
    await historicoModel.registrar({
        ativo_id: atualizado.id,
        patrimonio: atualizado.patrimonio,
        tipo_ativo_id: atualizado.tipo_ativo_id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "transferencia",
        descricao: String(body.observacao || "").trim() || null,
        setor_anterior_id: anterior.setor_id,
        setor_novo_id: novoSetorId,
        status_anterior: anterior.status,
        status_novo: anterior.status,
        dados_anteriores: anterior.dados,
        dados_novos: anterior.dados,
        campos_alterados: ["setor"]
    });
}

module.exports = {
    listarAtivos,
    buscarAtivo,
    criarAtivo,
    atualizarAtivo,
    removerAtivo,
    listarHistorico,
    transferirAtivo
};
