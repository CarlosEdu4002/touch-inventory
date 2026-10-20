const ativosModel = require("../models/ativos.model");
const setoresModel = require("../models/setores.model");
const historicoModel = require("../models/historico.model");
const gestaoModel = require("../models/gestao.model");
const vinculosModel = require("../models/vinculos.model");
const imagens = require("./imagens.service");
const transacao = require("../database/transacao");
const camposModel = require("../models/campos.model");
const validacaoCampos = require("./validacaoCampos.service");

function urlImagem(nome) {
    return nome ? require("../database/contexto-unidade").urlArquivo(`/uploads/ativos/${encodeURIComponent(nome)}`) : null;
}

// =====================
// Regras de negócio
// =====================

// Função: Confere o acesso ao ativo e devolve seu histórico de alterações em ordem cronológica inversa.
async function listarAtivos(tipo, usuario) {
    const ativos = await ativosModel.listarPorTipo(tipo, usuario);

    return ativos.map((ativo) => ({
        ...(ativo.dados || {}),
        patrimonio: ativo.patrimonio,
        id: ativo.id,
        tipo_ativo_id: ativo.tipo_ativo_id,
        setor_id: ativo.setor_id,
        setor: ativo.setor_nome,
        status: ativo.status,
        imagem_url: urlImagem(ativo.imagem),
        revisao: ativo.revisao, tipo_revisao: ativo.tipo_revisao, atualizado_em: ativo.updated_at
    }));
}

// Função: Valida a consulta e devolve o registro correspondente de ativos.
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
        ...(ativo.dados || {}),
        patrimonio: ativo.patrimonio,
        id: ativo.id,
        tipo_ativo_id: ativo.tipo_ativo_id,
        setor_id: ativo.setor_id,
        setor: ativo.setor_nome,
        status: ativo.status,
        imagem_url: urlImagem(ativo.imagem),
        grupo_esperado: ativo.grupo_esperado, revisao: ativo.revisao, tipo_revisao: ativo.tipo_revisao, atualizado_em: ativo.updated_at
    };
}

// Função: Determina o setor do ativo conforme o perfil do usuário e valida permissões administrativas.
async function definirSetor(body, usuario, cliente) {
    const setorId = Number(body.setor_id);

    if (!Number.isInteger(setorId) || setorId <= 0) {
        const erro = new Error("Setor é obrigatório");
        erro.status = 400;
        throw erro;
    }

    if (!(await setoresModel.buscarPorId(setorId,cliente))) {
        const erro = new Error("Setor não encontrado");
        erro.status = 404;
        throw erro;
    }

    return setorId;
}

// Função: Confere se o código informado corresponde a um status ativo permitido.
async function validarStatus(codigo, cliente) {
    const status = (await gestaoModel.listarStatus(true,cliente)).find(
        (item) => item.codigo === codigo
    );
    if (!status) {
        const erro = new Error("Status inválido ou desativado");
        erro.status = 400;
        throw erro;
    }
    return codigo;
}

// Função: Compara os estados anterior e novo e devolve somente as chaves cujo valor foi modificado.
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

// Função: Seleciona e organiza os dados do ativo que devem compor um registro de histórico.
function dadosHistorico(ativo) {
    return {
        ...(ativo.dados || {}),
        patrimonio: ativo.patrimonio,
        setor_id: ativo.setor_id,
        status: ativo.status,
        imagem: ativo.imagem || null
    };
}

function falha(mensagem, status = 404) {
    const erro = new Error(mensagem); erro.status = status; return erro;
}
function eventoBase(ativo, usuario, acao) {
    return { ativo_id: ativo.id, patrimonio: ativo.patrimonio, tipo_ativo_id: ativo.tipo_ativo_id,
        usuario_id: usuario.id, usuario_nome: usuario.nome, acao };
}
async function comImagemPreparada(valor, operacao) {
    const nova = valor ? await imagens.preparar(valor) : null;
    let resultado;
    try { resultado = await operacao(nova); }
    catch (erro) { await imagens.compensar(nova); throw erro; }
    // A limpeza acontece depois do COMMIT; qualquer falha fica pendente sem invalidar o sucesso.
    if (resultado?.limpar?.length) await imagens.tentarLimpeza(resultado.limpar);
}

async function criarAtivo(tipo, body, usuario) {
    validacaoCampos.validarPedido(body);
    const { patrimonio, setor_id, status = "em_uso", imagem } = body;
    if (!patrimonio) throw falha("Patrimônio é obrigatório", 400);
    const tipoEncontrado = await ativosModel.buscarTipoPorNome(tipo, usuario);
    if (!tipoEncontrado) throw falha("Tipo não encontrado");
    const setorId = await definirSetor({ setor_id }, usuario);
    if (status === "emprestado") throw falha("Use a ação Empréstimo para informar o prazo e o responsável", 400);
    await validarStatus(status);
    await comImagemPreparada(imagem, nova => transacao.executar(async cliente => {
        const definicao=await ativosModel.bloquearDefinicao(tipoEncontrado.id,usuario,cliente);
        require("../database/concorrencia").conferir(body.tipo_revisao,definicao?.revisao);
        await definirSetor({setor_id:setorId},usuario,cliente);await validarStatus(status,cliente);
        const campos = await camposModel.listarPorTipo(tipoEncontrado.id, cliente);
        const dados = validacaoCampos.validarCampos(body, campos);
        const ativo = await ativosModel.criar(tipoEncontrado.id, setorId, patrimonio, status, dados, usuario.id, usuario, cliente);
        if (nova) { await ativosModel.atualizarImagem(ativo.id, nova, cliente); ativo.imagem = nova; }
        await historicoModel.registrar({ ...eventoBase(ativo, usuario, "criacao"),
            setor_novo_id: ativo.setor_id, status_novo: ativo.status, dados_novos: dadosHistorico(ativo),
            campos_alterados: ["patrimonio", "setor_id", "status", ...Object.keys(dados), ...(nova ? ["imagem"] : [])]
        }, cliente);
    }));
}

async function atualizarAtivo(tipo, patrimonioAtual, body, usuario, ativoId = null) {
    validacaoCampos.validarPedido(body);
    const { patrimonio, setor_id, status = "em_uso", imagem, remover_imagem = false } = body;
    if (!patrimonio) throw falha("Patrimônio é obrigatório", 400);
    if (!(await ativosModel.buscarTipoPorNome(tipo, usuario))) throw falha("Tipo não encontrado");
    const setorId = await definirSetor({ setor_id }, usuario);
    await validarStatus(status);
    await comImagemPreparada(imagem, nova => transacao.executar(async cliente => {
        const anterior = ativoId ? await ativosModel.bloquearPorId(ativoId,usuario,cliente)
            : await ativosModel.bloquearContexto(tipo, patrimonioAtual, usuario, cliente);
        if (!anterior) throw falha("Ativo não encontrado");
        await definirSetor({setor_id:setorId},usuario,cliente);await validarStatus(status,cliente);
        const campos = await camposModel.listarPorTipo(anterior.tipo_ativo_id, cliente);
        const dados = validacaoCampos.validarCampos(body, campos, anterior.dados || {});
        const grupo = await vinculosModel.buscarGrupoPorAtivo(anterior.id, usuario, cliente);
        if (grupo && Number(anterior.setor_id) !== Number(setorId)) {
            throw falha("Use Mover de setor para transferir todos os ativos vinculados", 409);
        }
        if (patrimonio !== anterior.patrimonio) throw falha("Patrimônio não pode ser alterado na edição", 400);
        if (Number(anterior.setor_id) !== setorId) throw falha("Use Mover de setor para transferir o ativo", 400);
        if (anterior.status !== status && (anterior.status === "emprestado" || status === "emprestado")) {
            throw falha("Use a ação Empréstimo para retirar ou devolver o ativo", 400);
        }
        require("../database/concorrencia").conferir(body.revisao,anterior.revisao);
        require("../database/concorrencia").conferir(body.tipo_revisao,anterior.tipo_revisao);
        const ativo = await ativosModel.atualizar(anterior.tipo_ativo_id, setorId, anterior.patrimonio, patrimonio, status, dados, usuario, cliente);
        if (!ativo) throw falha("Ativo não encontrado");
        ativo.imagem = anterior.imagem;
        const mudouImagem = Boolean(imagem) || remover_imagem === true;
        if (mudouImagem) {
            await ativosModel.atualizarImagem(ativo.id, nova, cliente); ativo.imagem = nova;
            await imagens.agendar(anterior.imagem, cliente);
        }
        await historicoModel.registrar({ ...eventoBase(ativo, usuario, "edicao"),
            setor_anterior_id: anterior.setor_id, setor_novo_id: ativo.setor_id,
            status_anterior: anterior.status, status_novo: ativo.status,
            dados_anteriores: dadosHistorico(anterior), dados_novos: dadosHistorico(ativo),
            campos_alterados: camposAlterados(dadosHistorico(anterior), dadosHistorico(ativo))
        }, cliente);
        return { limpar: mudouImagem && anterior.imagem ? [anterior.imagem] : [] };
    }));
}

async function removerAtivo(tipo, patrimonio, usuario, body={}) {
    const ativo=await ativosModel.buscarPorPatrimonio(tipo,patrimonio,usuario);
    if (!ativo) throw falha("Ativo não encontrado");
    return require("./lixeira.service").excluir(ativo.id,usuario,body.revisao);
}

// Função: Aplica as regras de acesso e devolve a lista de ativos disponível ao usuário.
async function listarHistorico(tipo, patrimonio, usuario) {
    const tipoEncontrado = await ativosModel.buscarTipoPorNome(tipo, usuario);
    if (!tipoEncontrado) {
        const erro = new Error("Tipo não encontrado");
        erro.status = 404;
        throw erro;
    }
    const ativo=await ativosModel.buscarPorPatrimonio(String(tipoEncontrado.id),patrimonio,usuario);
    if (!ativo) return [];
    return historicoModel.listarPorAtivo(
        tipoEncontrado.id,
        patrimonio,
        usuario, ativo.id
    );
}

async function transferirAtivo(tipo, patrimonio, body, usuario) {
    const novoSetorId = Number(body.setor_id);
    if (!(await setoresModel.buscarPorId(novoSetorId))) throw falha("Setor de destino inválido", 400);
    return transacao.executar(async cliente => {
        const anterior = await ativosModel.bloquearContexto(tipo, patrimonio, usuario, cliente);
        if (!anterior) throw falha("Ativo não encontrado");
        require("../database/concorrencia").conferir(body.revisao,anterior.revisao);
        await definirSetor({setor_id:novoSetorId},usuario,cliente);
        if (Number(anterior.setor_id) === novoSetorId) throw falha("O ativo já pertence a esse setor", 400);
        const grupo = await vinculosModel.buscarGrupoPorAtivo(anterior.id, usuario, cliente);
        if (!Object.prototype.hasOwnProperty.call(body,'grupo_esperado') ||
            (grupo ? Number(body.grupo_esperado?.id) !== grupo.id : body.grupo_esperado !== null)) {
            throw falha("O grupo do ativo mudou. Reabra a transferência e confira os integrantes.",409);
        }
        if (grupo) require("../database/concorrencia").conferir(body.grupo_esperado?.revisao,grupo.revisao);
        if (grupo) {
            await ativosModel.transferirGrupo(grupo.membros.map(m => m.ativo_id), novoSetorId, usuario,
                String(body.observacao || "").trim(), cliente);
            return { grupo_id: grupo.id, total: grupo.membros.length };
        }
        const ativo = await ativosModel.transferir(anterior.id, novoSetorId, usuario, cliente);
        await historicoModel.registrar({ ...eventoBase(ativo, usuario, "transferencia"),
            descricao: String(body.observacao || "").trim() || null,
            setor_anterior_id: anterior.setor_id, setor_novo_id: novoSetorId,
            status_anterior: anterior.status, status_novo: anterior.status,
            dados_anteriores: dadosHistorico(anterior), dados_novos: dadosHistorico({ ...anterior, setor_id: novoSetorId }),
            campos_alterados: ["setor_id"]
        }, cliente);
    });
}

// Função: Normaliza um valor textual opcional e limita seu tamanho antes de persistir.
function limparTexto(valor, limite) {
    const texto = String(valor || "").trim();
    return texto ? texto.slice(0, limite) : "";
}

// Função: Valida e normaliza a data prevista de devolução quando ela é informada ou obrigatória.
function validarPrazoInformado(valor, obrigatorio = false) {
    if (!valor && !obrigatorio) return null;
    const prazo = new Date(valor);
    if (
        !valor ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(valor) ||
        Number.isNaN(prazo.getTime())
    ) {
        const erro = new Error(
            "Informe uma data e hora válidas para a devolução"
        );
        erro.status = 400;
        throw erro;
    }
    return prazo.toISOString();
}

// Função: Valida os dados comuns e solicita ao modelo a retirada ou devolução do ativo lido.
async function movimentarAtivoLido(tipo, patrimonio, body, usuario, tipoMovimentacao) {
    const ativoVinculado = await ativosModel.buscarPorPatrimonio(tipo, patrimonio, usuario);
    if (ativoVinculado && await vinculosModel.buscarGrupoPorAtivo(ativoVinculado.id, usuario)) {
        const erro = new Error("Desvincule o ativo antes de realizar uma retirada individual");
        erro.status = 409;
        throw erro;
    }
    if (!["saida","devolucao"].includes(body.acao_esperada)) throw falha("Confirme se deseja emprestar ou devolver o ativo",409);
    const prazo = validarPrazoInformado(body.prazo_devolucao);
    const setorResponsavelId = body.setor_responsavel_id
        ? Number(body.setor_responsavel_id)
        : null;
    let setorResponsavel = null;
    if (setorResponsavelId !== null) {
        if (!Number.isInteger(setorResponsavelId) || setorResponsavelId <= 0) {
            const erro = new Error("Setor inválido");
            erro.status = 400;
            throw erro;
        }
        setorResponsavel = await setoresModel.buscarPorId(setorResponsavelId);
        if (!setorResponsavel) {
            const erro = new Error("Setor não encontrado ou inativo");
            erro.status = 400;
            throw erro;
        }
    }

    return ativosModel.movimentarAtivoLido(
        tipo,
        patrimonio,
        usuario,
        {
            revisao: body.revisao,
            acao_esperada: ["saida", "devolucao"].includes(
                body.acao_esperada
            )
                ? body.acao_esperada
                : "",
            responsavel: limparTexto(body.responsavel, 150),
            setor_responsavel_id: setorResponsavel?.id || null,
            setor_responsavel_nome: setorResponsavel?.nome || "",
            observacao: limparTexto(body.observacao, 1000),
            prazo_devolucao: prazo
        },
        tipoMovimentacao
    );
}

// Função: Registra a retirada ou devolução no fluxo específico de chaves.
function movimentarChave(tipo, patrimonio, body, usuario) {
    return movimentarAtivoLido(tipo, patrimonio, body, usuario, "chaves");
}

// Função: Registra a retirada ou devolução no fluxo específico de ferramentas.
function movimentarFerramenta(tipo, patrimonio, body, usuario) {
    return movimentarAtivoLido(tipo, patrimonio, body, usuario, "ferramentas");
}

// Função: Registra a retirada ou devolução para qualquer tipo configurado como emprestável.
function movimentarEmprestimo(tipo, patrimonio, body, usuario) {
    return movimentarAtivoLido(tipo, patrimonio, body, usuario, null);
}

// Função: Valida e atualiza o prazo de um empréstimo ainda aberto.
function prorrogarEmprestimo(tipo, patrimonio, body, usuario) {
    return ativosModel.prorrogarEmprestimo(
        tipo,
        patrimonio,
        usuario,
        validarPrazoInformado(body.prazo_devolucao, true), body.revisao
    );
}

module.exports = {
    listarAtivos,
    buscarAtivo,
    criarAtivo,
    atualizarAtivo,
    removerAtivo,
    listarHistorico,
    transferirAtivo,
    movimentarChave,
    movimentarFerramenta,
    movimentarEmprestimo,
    prorrogarEmprestimo
};
