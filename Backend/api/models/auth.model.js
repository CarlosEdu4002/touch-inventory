const pool = require("../database/connection");

async function contarUsuarios(client = pool) {
    const resultado = await client.query(
        "SELECT COUNT(*)::INTEGER AS total FROM usuarios"
    );
    return resultado.rows[0].total;
}

async function buscarUsuarioPorLogin(login) {
    const resultado = await pool.query(
        `
        SELECT
            u.id,
            u.login,
            u.nome,
            u.senha_hash,
            u.perfil,
            u.setor_id,
            s.nome AS setor_nome,
            u.ativo
        FROM usuarios u
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE LOWER(u.login) = LOWER($1)
        `,
        [login]
    );

    return resultado.rows[0];
}

async function configurarUsuariosIniciais(usuarios) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE usuarios IN EXCLUSIVE MODE");

        if ((await contarUsuarios(client)) > 0) {
            const erro = new Error(
                "A configuração inicial já foi concluída"
            );
            erro.status = 409;
            throw erro;
        }

        const setores = await client.query(
            "SELECT id, nome FROM setores"
        );
        const setorPorNome = new Map(
            setores.rows.map((setor) => [setor.nome, setor.id])
        );

        for (const usuario of usuarios) {
            await client.query(
                `
                INSERT INTO usuarios (
                    login,
                    nome,
                    senha_hash,
                    perfil,
                    setor_id
                )
                VALUES ($1, $2, $3, $4, $5)
                `,
                [
                    usuario.login,
                    usuario.nome,
                    usuario.senha_hash,
                    usuario.perfil,
                    usuario.setor_nome
                        ? setorPorNome.get(usuario.setor_nome)
                        : null
                ]
            );
        }

        await client.query("COMMIT");
    } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;
    } finally {
        client.release();
    }
}

async function criarSessao(tokenHash, usuarioId, horas = 8) {
    await pool.query(
        `
        INSERT INTO sessoes (token_hash, usuario_id, expira_em)
        VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 hour'))
        `,
        [tokenHash, usuarioId, horas]
    );
    await pool.query(
        "UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = $1",
        [usuarioId]
    );
}

async function buscarSessao(tokenHash) {
    const resultado = await pool.query(
        `
        SELECT
            u.id,
            u.login,
            u.nome,
            u.perfil,
            u.setor_id,
            s.nome AS setor_nome
        FROM sessoes se
        INNER JOIN usuarios u ON u.id = se.usuario_id
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE se.token_hash = $1
          AND se.expira_em > NOW()
          AND u.ativo = TRUE
        `,
        [tokenHash]
    );

    return resultado.rows[0];
}

async function removerSessao(tokenHash) {
    await pool.query(
        "DELETE FROM sessoes WHERE token_hash = $1",
        [tokenHash]
    );
}

async function limparSessoesExpiradas() {
    await pool.query("DELETE FROM sessoes WHERE expira_em <= NOW()");
}

module.exports = {
    contarUsuarios,
    buscarUsuarioPorLogin,
    configurarUsuariosIniciais,
    criarSessao,
    buscarSessao,
    removerSessao,
    limparSessoesExpiradas
};
