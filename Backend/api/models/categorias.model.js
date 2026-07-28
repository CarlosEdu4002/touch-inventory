const pool = require("../database/connection");

async function listar(usuario) {
    const resultado = await pool.query(
        `
        SELECT id, nome, setor_id, created_at
        FROM categorias
        WHERE $1 = 'admin' OR setor_id = $2
        ORDER BY nome
        `,
        [usuario.perfil, usuario.setor_id]
    );

    return resultado.rows;
}

async function buscarPorId(id, usuario) {
    const resultado = await pool.query(
        `
        SELECT id, nome, setor_id, created_at
        FROM categorias
        WHERE id = $1
          AND ($2 = 'admin' OR setor_id = $3)
        `,
        [id, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

async function criar(nome, setorId) {
    const resultado = await pool.query(
        `
        INSERT INTO categorias (nome, setor_id)
        VALUES ($1, $2)
        RETURNING id, nome, setor_id, created_at
        `,
        [nome, setorId]
    );

    return resultado.rows[0];
}

async function atualizar(id, nome, usuario) {
    const resultado = await pool.query(
        `
        UPDATE categorias
        SET nome = $1
        WHERE id = $2
          AND ($3 = 'admin' OR setor_id = $4)
        RETURNING id, nome, setor_id, created_at
        `,
        [nome, id, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

async function remover(id, usuario) {
    const resultado = await pool.query(
        `
        DELETE FROM categorias
        WHERE id = $1
          AND ($2 = 'admin' OR setor_id = $3)
        RETURNING id
        `,
        [id, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

module.exports = {
    listar,
    buscarPorId,
    criar,
    atualizar,
    remover
};
