const pool = require("../database/connection");

async function listar(usuario) {
    const resultado = await pool.query(
        `
        SELECT
            ta.id,
            ta.nome,
            ta.categoria_id,
            c.nome AS categoria_nome,
            c.setor_id,
            ($1 = 'admin' OR c.setor_id = $2) AS gerenciavel,
            ta.created_at
        FROM tipos_ativo ta
        INNER JOIN categorias c
            ON c.id = ta.categoria_id
        WHERE (
            $1 = 'admin'
            OR c.setor_id = $2
        )
        ORDER BY c.nome, ta.nome
        `,
        [usuario.perfil, usuario.setor_id]
    );

    return resultado.rows;
}

async function listarPorCategoria(categoriaId, usuario) {
    const resultado = await pool.query(
        `
        SELECT
            ta.id,
            ta.nome,
            ta.categoria_id,
            c.nome AS categoria_nome,
            c.setor_id,
            ($2 = 'admin' OR c.setor_id = $3) AS gerenciavel,
            ta.created_at
        FROM tipos_ativo ta
        INNER JOIN categorias c
            ON c.id = ta.categoria_id
        WHERE ta.categoria_id = $1
          AND (
              $2 = 'admin'
              OR c.setor_id = $3
          )
        ORDER BY ta.nome
        `,
        [categoriaId, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows;
}

async function buscarPorId(id, usuario) {
    const resultado = await pool.query(
        `
        SELECT
            ta.id,
            ta.nome,
            ta.categoria_id,
            c.nome AS categoria_nome,
            ta.created_at
        FROM tipos_ativo ta
        INNER JOIN categorias c
            ON c.id = ta.categoria_id
        WHERE ta.id = $1
          AND (
              $2 = 'admin'
              OR c.setor_id = $3
          )
        `,
        [id, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

async function criar(categoriaId, nome) {
    const resultado = await pool.query(
        `
        INSERT INTO tipos_ativo (
            categoria_id,
            nome
        )
        VALUES ($1, $2)
        RETURNING
            id,
            categoria_id,
            nome,
            created_at
        `,
        [categoriaId, nome]
    );

    return resultado.rows[0];
}

async function atualizar(id, categoriaId, nome) {
    const resultado = await pool.query(
        `
        UPDATE tipos_ativo
        SET
            categoria_id = $1,
            nome = $2
        WHERE id = $3
        RETURNING
            id,
            categoria_id,
            nome,
            created_at
        `,
        [categoriaId, nome, id]
    );

    return resultado.rows[0];
}

async function remover(id) {
    const resultado = await pool.query(
        `
        DELETE FROM tipos_ativo
        WHERE id = $1
        RETURNING id
        `,
        [id]
    );

    return resultado.rows[0];
}

async function categoriaExiste(categoriaId) {
    const resultado = await pool.query(
        `
        SELECT id
        FROM categorias
        WHERE id = $1
        `,
        [categoriaId]
    );

    return Boolean(resultado.rows[0]);
}

async function categoriaGerenciavel(categoriaId, usuario) {
    const resultado = await pool.query(
        `SELECT id
         FROM categorias
         WHERE id = $1
           AND ($2 = 'admin' OR setor_id = $3)`,
        [categoriaId, usuario.perfil, usuario.setor_id]
    );

    return Boolean(resultado.rows[0]);
}

async function usuarioPodeGerenciar(id, usuario) {
    const resultado = await pool.query(
        `SELECT ta.id
         FROM tipos_ativo ta
         INNER JOIN categorias c ON c.id = ta.categoria_id
         WHERE ta.id = $1
           AND ($2 = 'admin' OR c.setor_id = $3)`,
        [id, usuario.perfil, usuario.setor_id]
    );

    return Boolean(resultado.rows[0]);
}

async function usuarioPodeVisualizar(id, usuario) {
    return Boolean(await buscarPorId(id, usuario));
}

module.exports = {
    listar,
    listarPorCategoria,
    buscarPorId,
    criar,
    atualizar,
    remover,
    categoriaExiste,
    categoriaGerenciavel,
    usuarioPodeGerenciar,
    usuarioPodeVisualizar
};
