const ativosService = require("../services/ativos.service");

// =====================
// Tratamento de erros
// =====================

// Função: Converte falhas das operações de ativos em respostas HTTP, incluindo conflito de patrimônio.
function responderErro(res, erro, mensagemPadrao) {
    console.error(erro);

    if (erro.code === "23505") {
        return res.status(400).json({
            erro: "Patrimônio já existe"
        });
    }

    return res.status(erro.status || 500).json({
        erro: erro.status ? erro.message : mensagemPadrao
    });
}

// =====================
// Controllers
// =====================

// Função: Lista os ativos do tipo solicitado que estão dentro do escopo do usuário autenticado.
async function listar(req, res) {
    try {
        const ativos = await ativosService.listarAtivos(
            req.params.tipo,
            req.usuario
        );

        return res.json(ativos);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao listar ativos"
        );
    }
}

// Função: Busca um ativo pelo tipo e patrimônio recebidos na rota e devolve seus dados completos.
async function buscar(req, res) {
    try {
        const ativo = await ativosService.buscarAtivo(
            req.params.tipo,
            req.params.id,
            req.usuario
        );

        return res.json(ativo);
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao buscar ativo"
        );
    }
}

// Função: Encaminha os dados recebidos para cadastrar um ativo e responde com a confirmação da criação.
async function criar(req, res) {
    try {
        await ativosService.criarAtivo(
            req.params.tipo,
            req.body,
            req.usuario
        );

        return res.status(201).json({
            mensagem: "Ativo cadastrado com sucesso"
        });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao cadastrar ativo"
        );
    }
}

// Função: Atualiza o ativo identificado pelo tipo e patrimônio e confirma a operação ao cliente.
async function atualizar(req, res) {
    try {
        await ativosService.atualizarAtivo(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );

        return res.json({
            mensagem: "Ativo atualizado com sucesso"
        });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao atualizar ativo"
        );
    }
}

// Função: Remove o ativo identificado na rota após as validações realizadas pelo serviço.
async function remover(req, res) {
    try {
        await ativosService.buscarAtivo(req.params.tipo,req.params.id,req.usuario);
        if (req.body?.confirmar_exclusao !== true) {
            const erro=new Error("Confirme a exclusão recuperável por 30 dias"); erro.status=400; throw erro;
        }
        await ativosService.removerAtivo(
            req.params.tipo,
            req.params.id,
            req.usuario, req.body
        );

        return res.json({ mensagem: "Ativo enviado à lixeira. Recuperação disponível por 30 dias." });
    } catch (erro) {
        return responderErro(
            res,
            erro,
            "Erro ao remover ativo"
        );
    }
}

// Função: Carrega e devolve a linha do tempo de alterações do ativo solicitado.
async function historico(req, res) {
    try {
        return res.json(
            await ativosService.listarHistorico(
                req.params.tipo,
                req.params.id,
                req.usuario
            )
        );
    } catch (erro) {
        return responderErro(res, erro, "Erro ao carregar histórico");
    }
}

// Função: Solicita a transferência do ativo para outro setor e devolve a confirmação ao cliente.
async function transferir(req, res) {
    try {
        await ativosService.transferirAtivo(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );
        return res.json({ mensagem: "Ativo transferido com sucesso" });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao transferir ativo");
    }
}

// Função: Registra a retirada ou devolução de uma chave e devolve a ação e o novo estado resultantes.
async function movimentarChave(req, res) {
    try {
        const resultado = await ativosService.movimentarChave(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );
        return res.json({
            mensagem: resultado.acao === "saida"
                ? "Saída da chave registrada"
                : "Devolução da chave registrada",
            ...resultado
        });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao movimentar chave");
    }
}

// Função: Registra a retirada ou devolução de uma ferramenta e devolve a ação e o novo estado resultantes.
async function movimentarFerramenta(req, res) {
    try {
        const resultado = await ativosService.movimentarFerramenta(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );
        return res.json({
            mensagem: resultado.acao === "saida"
                ? "Saída da ferramenta registrada"
                : "Devolução da ferramenta registrada",
            ...resultado
        });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao movimentar ferramenta");
    }
}

// Função: Registra a retirada ou devolução de um tipo configurado como emprestável.
async function movimentarEmprestimo(req, res) {
    try {
        const resultado = await ativosService.movimentarEmprestimo(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );
        return res.json({
            mensagem: resultado.acao === "saida"
                ? "Empréstimo registrado"
                : "Devolução registrada",
            ...resultado
        });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao movimentar empréstimo");
    }
}

// Função: Atualiza o prazo previsto de um empréstimo aberto e devolve seus dados resultantes.
async function prorrogarEmprestimo(req, res) {
    try {
        const resultado = await ativosService.prorrogarEmprestimo(
            req.params.tipo,
            req.params.id,
            req.body,
            req.usuario
        );
        return res.json({ mensagem: "Prazo prorrogado", ...resultado });
    } catch (erro) {
        return responderErro(res, erro, "Erro ao prorrogar empréstimo");
    }
}

module.exports = {
    listar,
    buscar,
    criar,
    atualizar,
    remover,
    historico,
    transferir,
    movimentarChave,
    movimentarFerramenta,
    movimentarEmprestimo,
    prorrogarEmprestimo
};
