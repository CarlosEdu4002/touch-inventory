const contexto = require("../database/contexto-unidade");

const CABECALHO = "X-Inventario-Contexto";

function chaveAtual(usuario) {
    return [usuario.unidade_id, usuario.setor_id || 0, usuario.contexto_versao].join(":");
}
function conferirContexto(req, res, next) {
    if (process.env.INVENTARIO_TEST_SCHEMA) return next();
    const usuario = req.usuario;
    if (!usuario?.unidade_id || !usuario.schema_nome) {
        return res.status(409).json({ codigo: "UNIDADE_NAO_SELECIONADA", erro: "Selecione uma unidade antes de continuar" });
    }
    if (usuario.perfil !== "admin" && !usuario.setores_ids?.includes(usuario.setor_id)) {
        return res.status(403).json({ erro: "Setor não autorizado nesta unidade" });
    }
    const informada = req.originalUrl.startsWith("/uploads/")
        ? req.query.contexto : req.get(CABECALHO);
    if (typeof informada !== "string" || !/^[1-9][0-9]*:[0-9]+:[0-9]+$/.test(informada)) {
        return res.status(428).json({ codigo: "CONTEXTO_OBRIGATORIO", erro: "Atualize a página para informar a unidade e o setor desta operação" });
    }
    if (informada !== chaveAtual(usuario)) {
        return res.status(409).json({
            codigo: "CONTEXTO_ALTERADO",
            erro: "A unidade ou o setor desta sessão mudou. Nenhum dado foi alterado; seu formulário continua nesta aba."
        });
    }
    req.chaveContexto = informada;
    return next();
}
function exigirUnidade(req, res, next) {
    if (process.env.INVENTARIO_TEST_SCHEMA) return next();
    conferirContexto(req, res, () => {
        try { return contexto.executar(req.usuario.schema_nome, () => next(), req.chaveContexto); }
        catch (erro) { return next(erro); }
    });
}
module.exports = { exigirUnidade, conferirContexto, chaveAtual };
