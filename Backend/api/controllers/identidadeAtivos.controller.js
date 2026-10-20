const lixeira=require("../services/lixeira.service");
const identidade=require("../services/identidadeAtivos.service");

// Função: Encaminha a operação pelo ID permanente e traduz erros conhecidos.
function atender(operacao) {
    return async (req,res) => {
        try { return res.json(await operacao(req)); }
        catch (erro) { console.error(erro); return res.status(erro.status||500).json({erro:erro.status?erro.message:"Erro ao processar ativo"}); }
    };
}
module.exports={
    listarLixeira:atender(req=>lixeira.listar(req.usuario)),
    listarLog:atender(req=>lixeira.listarLog(req.usuario)),
    detalhes:atender(req=>identidade.detalhes(req.params.ativoId,req.usuario,req.query.unidade)),
    buscar:atender(req=>identidade.buscar(req.params.ativoId,req.usuario)),
    atualizar:atender(req=>identidade.atualizar(req.params.ativoId,req.body,req.usuario)),
    historico:atender(req=>identidade.listarHistorico(req.params.ativoId,req.usuario)),
    excluir:atender(req=>identidade.excluir(req.params.ativoId,req.body,req.usuario)),
    restaurar:atender(req=>identidade.restaurar(req.params.ativoId,req.usuario,req.body))
};
