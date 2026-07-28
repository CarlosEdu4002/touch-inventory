const pool = require("../database/connection");

const COLUNAS = `
    id, tipo_ativo_id, nome, label, tipo, opcoes,
    obrigatorio, editavel, visivel, ordem, created_at
`;

async function listarPorTipo(tipoAtivoId) {
    const resultado = await pool.query(
        `SELECT ${COLUNAS}
         FROM campos
         WHERE tipo_ativo_id = $1
         ORDER BY ordem, id`,
        [tipoAtivoId]
    );

    return resultado.rows;
}

async function buscarPorId(id) {
    const resultado = await pool.query(
        `SELECT ${COLUNAS} FROM campos WHERE id = $1`,
        [id]
    );

    return resultado.rows[0];
}

async function criar(dados) {
    const resultado = await pool.query(
        `INSERT INTO campos (
            tipo_ativo_id, nome, label, tipo,
            opcoes, obrigatorio, editavel, visivel, ordem
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${COLUNAS}`,
        [
            dados.tipo_ativo_id,
            dados.nome,
            dados.label,
            dados.tipo,
            JSON.stringify(dados.opcoes),
            dados.obrigatorio,
            dados.editavel,
            dados.visivel,
            dados.ordem
        ]
    );

    return resultado.rows[0];
}

async function atualizar(id, dados) {
    const resultado = await pool.query(
        `UPDATE campos
         SET tipo_ativo_id = $1,
             nome = $2,
             label = $3,
             tipo = $4,
             opcoes = $5,
             obrigatorio = $6,
             editavel = $7,
             visivel = $8,
             ordem = $9
         WHERE id = $10
         RETURNING ${COLUNAS}`,
        [
            dados.tipo_ativo_id,
            dados.nome,
            dados.label,
            dados.tipo,
            JSON.stringify(dados.opcoes),
            dados.obrigatorio,
            dados.editavel,
            dados.visivel,
            dados.ordem,
            id
        ]
    );

    return resultado.rows[0];
}

async function remover(id) {
    const resultado = await pool.query(
        "DELETE FROM campos WHERE id = $1 RETURNING id",
        [id]
    );

    return resultado.rows[0];
}

async function tipoAtivoExiste(id) {
    const resultado = await pool.query(
        "SELECT id FROM tipos_ativo WHERE id = $1",
        [id]
    );

    return Boolean(resultado.rows[0]);
}

module.exports = {
    listarPorTipo,
    buscarPorId,
    criar,
    atualizar,
    remover,
    tipoAtivoExiste
};
