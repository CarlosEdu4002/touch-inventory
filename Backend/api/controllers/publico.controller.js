const publicoService = require("../services/publico.service");

async function buscarAtivo(req, res) {
    try {
        return res.json(
            await publicoService.buscarAtivo(
                req.params.tipo,
                req.params.id
            )
        );
    } catch (erro) {
        console.error(erro);
        return res.status(erro.status || 500).json({
            erro: erro.status ? erro.message : "Erro ao consultar ativo"
        });
    }
}

module.exports = { buscarAtivo };
