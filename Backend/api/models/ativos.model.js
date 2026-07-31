const pool = require("../database/connection");

// =====================
// Consultas de ativos
// =====================

async function buscarTipoPorNome(tipo) {
    const resultado = await pool.query(
        `
        SELECT id
        FROM tipos_ativo
        WHERE id::TEXT = $1
           OR LOWER(nome) = LOWER($1)
        `,
        [tipo]
    );

    return resultado.rows[0];
}

async function listarPorTipo(tipo, usuario) {
    const resultado = await pool.query(
        `
        SELECT
            a.id,
            a.tipo_ativo_id,
            a.patrimonio,
            a.dados,
            a.setor_id,
            a.status,
            a.imagem,
            a.updated_at,
            s.nome AS setor_nome
        FROM ativos a
        INNER JOIN tipos_ativo t
            ON t.id = a.tipo_ativo_id
        INNER JOIN categorias c
            ON c.id = t.categoria_id
        LEFT JOIN setores s ON s.id = a.setor_id
        WHERE (t.id::TEXT = $1
           OR LOWER(t.nome) = LOWER($1))
          AND ($2 = 'admin' OR c.setor_id = $3)
        ORDER BY a.patrimonio
        `,
        [tipo, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows;
}

async function buscarPorPatrimonio(tipo, patrimonio, usuario) {
    const resultado = await pool.query(
        `
        SELECT
            a.id,
            a.tipo_ativo_id,
            a.patrimonio,
            a.dados,
            a.setor_id,
            a.status,
            a.imagem,
            a.updated_at,
            s.nome AS setor_nome
        FROM ativos a
        INNER JOIN tipos_ativo t
            ON t.id = a.tipo_ativo_id
        INNER JOIN categorias c
            ON c.id = t.categoria_id
        LEFT JOIN setores s ON s.id = a.setor_id
        WHERE (t.id::TEXT = $1
           OR LOWER(t.nome) = LOWER($1))
          AND a.patrimonio = $2
          AND ($3 = 'admin' OR c.setor_id = $4)
        `,
        [tipo, patrimonio, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

async function criar(tipoId, setorId, patrimonio, status, dados) {
    const resultado = await pool.query(
        `
        INSERT INTO ativos (
            tipo_ativo_id,
            setor_id,
            patrimonio,
            status,
            dados
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, tipo_ativo_id, setor_id, patrimonio, status, dados
        `,
        [tipoId, setorId, patrimonio, status, dados]
    );

    return resultado.rows[0];
}

async function atualizar(
    tipoId,
    setorId,
    patrimonioAtual,
    novoPatrimonio,
    status,
    dados,
    usuario
) {
    const resultado = await pool.query(
        `
        UPDATE ativos
        SET patrimonio = $1,
            dados = $2,
            setor_id = $3,
            status = $4,
            updated_at = NOW()
        WHERE patrimonio = $5
          AND tipo_ativo_id = $6
          AND (
              $7 = 'admin'
              OR EXISTS (
                  SELECT 1
                  FROM tipos_ativo t
                  INNER JOIN categorias c ON c.id = t.categoria_id
                  WHERE t.id = ativos.tipo_ativo_id
                    AND c.setor_id = $8
              )
          )
        RETURNING id, tipo_ativo_id, setor_id, patrimonio, status, dados
        `,
        [
            novoPatrimonio,
            dados,
            setorId,
            status,
            patrimonioAtual,
            tipoId,
            usuario.perfil,
            usuario.setor_id
        ]
    );

    return resultado.rows[0];
}

async function atualizarImagem(id, imagem) {
    const resultado = await pool.query(
        `UPDATE ativos
         SET imagem = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING imagem`,
        [imagem, id]
    );
    return resultado.rows[0];
}

async function remover(tipoId, patrimonio, usuario) {
    const resultado = await pool.query(
        `
        DELETE FROM ativos
        WHERE patrimonio = $1
          AND tipo_ativo_id = $2
          AND (
              $3 = 'admin'
              OR EXISTS (
                  SELECT 1
                  FROM tipos_ativo t
                  INNER JOIN categorias c ON c.id = t.categoria_id
                  WHERE t.id = ativos.tipo_ativo_id
                    AND c.setor_id = $4
              )
          )
        RETURNING id, tipo_ativo_id, setor_id, patrimonio, status, dados, imagem
        `,
        [patrimonio, tipoId, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

async function buscarPublico(tipo, patrimonio) {
    const resultado = await pool.query(
        `SELECT
            a.id, a.tipo_ativo_id, a.patrimonio, a.dados, a.imagem,
            a.setor_id, a.status, a.updated_at,
            s.nome AS setor_nome,
            t.nome AS tipo_nome,
            c.nome AS categoria_nome
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         WHERE (t.id::TEXT = $1 OR LOWER(t.nome) = LOWER($1))
           AND a.patrimonio = $2`,
        [tipo, patrimonio]
    );
    return resultado.rows[0];
}

async function transferir(id, novoSetorId) {
    const resultado = await pool.query(
        `UPDATE ativos
         SET setor_id = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, tipo_ativo_id, setor_id, patrimonio, status, dados`,
        [novoSetorId, id]
    );
    return resultado.rows[0];
}

module.exports = {
    buscarTipoPorNome,
    listarPorTipo,
    buscarPorPatrimonio,
    buscarPublico,
    criar,
    atualizar,
    atualizarImagem,
    remover,
    transferir
};
