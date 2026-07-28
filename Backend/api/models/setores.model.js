const pool = require("../database/connection");

async function listar(incluirInativos = false) {
    const resultado = await pool.query(
        `
        SELECT id, nome, ativo
        FROM setores
        WHERE ($1 = TRUE OR ativo = TRUE)
        ORDER BY nome
        `,
        [incluirInativos]
    );

    return resultado.rows;
}

async function criar(nome) {
    const resultado = await pool.query(
        `INSERT INTO setores (nome)
         VALUES ($1)
         RETURNING id, nome, ativo`,
        [nome]
    );
    return resultado.rows[0];
}

async function atualizar(id, nome, ativo) {
    const resultado = await pool.query(
        `UPDATE setores
         SET nome = $1, ativo = $2
         WHERE id = $3
         RETURNING id, nome, ativo`,
        [nome, ativo, id]
    );
    return resultado.rows[0];
}

async function buscarPorId(id) {
    const resultado = await pool.query(
        `
        SELECT id, nome
        FROM setores
        WHERE id = $1
          AND ativo = TRUE
        `,
        [id]
    );

    return resultado.rows[0];
}

module.exports = {
    listar,
    buscarPorId,
    criar,
    atualizar
};
