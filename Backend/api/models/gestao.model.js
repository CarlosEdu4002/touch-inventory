const pool = require("../database/connection");

async function listarStatus(apenasAtivos = true) {
    const resultado = await pool.query(
        `SELECT codigo, nome, cor, ativo, ordem
         FROM status_ativos
         WHERE ($1 = FALSE OR ativo = TRUE)
         ORDER BY ordem, nome`,
        [apenasAtivos]
    );
    return resultado.rows;
}

async function salvarStatus(codigo, dados) {
    const resultado = await pool.query(
        `INSERT INTO status_ativos (codigo, nome, cor, ativo, ordem)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (codigo) DO UPDATE SET
            nome = EXCLUDED.nome,
            cor = EXCLUDED.cor,
            ativo = EXCLUDED.ativo,
            ordem = EXCLUDED.ordem
         RETURNING codigo, nome, cor, ativo, ordem`,
        [codigo, dados.nome, dados.cor, dados.ativo, dados.ordem]
    );
    return resultado.rows[0];
}

async function listarUsuarios() {
    const resultado = await pool.query(
        `SELECT u.id, u.login, u.nome, u.perfil, u.setor_id,
                s.nome AS setor_nome, u.ativo, u.ultimo_acesso,
                COUNT(se.token_hash)::INTEGER AS sessoes_ativas
         FROM usuarios u
         LEFT JOIN setores s ON s.id = u.setor_id
         LEFT JOIN sessoes se
           ON se.usuario_id = u.id AND se.expira_em > NOW()
         GROUP BY u.id, s.nome
         ORDER BY u.perfil, u.nome`
    );
    return resultado.rows;
}

async function buscarUsuarioPorLogin(login) {
    const resultado = await pool.query(
        "SELECT id FROM usuarios WHERE LOWER(login) = LOWER($1)",
        [login]
    );
    return resultado.rows[0];
}

async function criarUsuario(dados) {
    const resultado = await pool.query(
        `INSERT INTO usuarios (
            login, nome, senha_hash, perfil, setor_id
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, login, nome, perfil, setor_id, ativo, ultimo_acesso`,
        [
            dados.login,
            dados.nome,
            dados.senha_hash,
            dados.perfil,
            dados.setor_id
        ]
    );
    return resultado.rows[0];
}

async function atualizarUsuario(id, dados) {
    const resultado = await pool.query(
        `UPDATE usuarios
         SET nome = COALESCE($1, nome),
             ativo = COALESCE($2, ativo),
             senha_hash = COALESCE($3, senha_hash)
         WHERE id = $4
         RETURNING id, login, nome, perfil, setor_id, ativo, ultimo_acesso`,
        [dados.nome, dados.ativo, dados.senha_hash, id]
    );
    return resultado.rows[0];
}

async function encerrarSessoes(usuarioId) {
    await pool.query("DELETE FROM sessoes WHERE usuario_id = $1", [
        usuarioId
    ]);
}

async function dashboard(usuario) {
    const params = [usuario.perfil, usuario.setor_id];
    const resumo = await pool.query(
        `SELECT
            COUNT(*)::INTEGER AS total,
            COUNT(*) FILTER (WHERE a.status = 'em_manutencao')::INTEGER
                AS em_manutencao,
            COUNT(*) FILTER (
                WHERE a.updated_at < NOW() - INTERVAL '180 days'
            )::INTEGER AS sem_atualizacao
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE $1 = 'admin' OR c.setor_id = $2`,
        params
    );
    const porTipo = await pool.query(
        `SELECT t.id, t.nome, COUNT(a.id)::INTEGER AS total
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE $1 = 'admin' OR c.setor_id = $2
         GROUP BY t.id, t.nome
         ORDER BY total DESC, t.nome
         LIMIT 8`,
        params
    );
    const recentes = await pool.query(
        `SELECT h.acao, h.patrimonio, h.usuario_nome, h.created_at
         FROM historico_ativos h
         LEFT JOIN tipos_ativo t ON t.id = h.tipo_ativo_id
         LEFT JOIN categorias c ON c.id = t.categoria_id
         WHERE $1 = 'admin' OR c.setor_id = $2
         ORDER BY h.created_at DESC
         LIMIT 6`,
        params
    );
    return {
        ...resumo.rows[0],
        por_tipo: porTipo.rows,
        movimentacoes_recentes: recentes.rows
    };
}

module.exports = {
    listarStatus,
    salvarStatus,
    listarUsuarios,
    buscarUsuarioPorLogin,
    criarUsuario,
    atualizarUsuario,
    encerrarSessoes,
    dashboard
};
