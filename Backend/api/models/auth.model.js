const pool = require("../database/connection");
const teste = Boolean(process.env.INVENTARIO_TEST_SCHEMA);
const global = teste ? "" : "public.";

async function contarUsuarios(cliente = pool) {
    const resultado = await cliente.query("SELECT COUNT(*)::INTEGER AS total FROM " + global + "usuarios");
    return resultado.rows[0].total;
}
async function buscarUsuarioPorLogin(login) {
    const resultado = await pool.query(
        "SELECT id, login, nome, senha_hash, perfil, setor_id, ativo FROM " +
        global + "usuarios WHERE LOWER(login) = LOWER($1)", [login]
    );
    return resultado.rows[0];
}
async function configurarUsuariosIniciais(usuarios) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await cliente.query("LOCK TABLE " + global + "usuarios IN EXCLUSIVE MODE");
        if ((await contarUsuarios(cliente)) > 0) {
            const erro = new Error("A configuração inicial já foi concluída");
            erro.status = 409;
            throw erro;
        }
        for (const usuario of usuarios) {
            await cliente.query(
                "INSERT INTO " + global + "usuarios (login,nome,senha_hash,perfil,setor_id) VALUES ($1,$2,$3,$4,$5)",
                [usuario.login, usuario.nome, usuario.senha_hash, usuario.perfil, null]
            );
        }
        await cliente.query("COMMIT");
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw erro;
    } finally { cliente.release(); }
}
async function criarSessao(tokenHash, usuarioId, horas = 8) {
    await pool.query(
        "INSERT INTO " + global + "sessoes (token_hash,usuario_id,expira_em) VALUES ($1,$2,NOW()+($3*INTERVAL '1 hour'))",
        [tokenHash, usuarioId, horas]
    );
    await pool.query("UPDATE " + global + "usuarios SET ultimo_acesso=NOW() WHERE id=$1", [usuarioId]);
}
async function buscarSessao(tokenHash) {
    if (teste) {
        const r = await pool.query(
            "SELECT u.id,u.login,u.nome,u.perfil,u.setor_id,s.nome AS setor_nome FROM sessoes se " +
            "JOIN usuarios u ON u.id=se.usuario_id LEFT JOIN setores s ON s.id=u.setor_id " +
            "WHERE se.token_hash=$1 AND se.expira_em>NOW() AND u.ativo=TRUE", [tokenHash]
        );
        return r.rows[0];
    }
    const r = await pool.query(
        "SELECT u.id,u.login,u.nome,u.perfil,se.unidade_id,se.setor_id,se.contexto_versao,un.nome AS unidade_nome," +
        "un.schema_nome, COALESCE((SELECT array_agg(DISTINCT uu.setor_id) FROM public.usuario_unidades uu " +
        "WHERE uu.usuario_id=u.id AND uu.unidade_id=se.unidade_id),ARRAY[]::integer[]) AS setores_ids " +
        "FROM public.sessoes se JOIN public.usuarios u ON u.id=se.usuario_id " +
        "LEFT JOIN public.unidades un ON un.id=se.unidade_id AND un.ativo=TRUE " +
        "WHERE se.token_hash=$1 AND se.expira_em>NOW() AND u.ativo=TRUE " +
        "AND (se.unidade_id IS NULL OR un.id IS NOT NULL) " +
        "AND (u.perfil='admin' OR se.unidade_id IS NULL OR EXISTS " +
        "(SELECT 1 FROM public.usuario_unidades uu WHERE uu.usuario_id=u.id " +
        "AND uu.unidade_id=se.unidade_id AND uu.setor_id=se.setor_id))",
        [tokenHash]
    );
    const usuario=r.rows[0];
    if(usuario?.setor_id && usuario.schema_nome) {
        if(!/^public$|^unidade_[1-9][0-9]*$/.test(usuario.schema_nome))return null;
        const setor=await pool.query('SELECT nome FROM "'+usuario.schema_nome+'".setores WHERE id=$1 AND ativo=TRUE',[usuario.setor_id]);
        if(!setor.rows[0])return null;
        usuario.setor_nome=setor.rows[0].nome;
    }
    return usuario;
}
async function removerSessao(tokenHash) {
    await pool.query("DELETE FROM " + global + "sessoes WHERE token_hash=$1", [tokenHash]);
}
async function limparSessoesExpiradas() {
    await pool.query("DELETE FROM " + global + "sessoes WHERE expira_em<=NOW()");
}
module.exports = { contarUsuarios,buscarUsuarioPorLogin,configurarUsuariosIniciais,criarSessao,
    buscarSessao,removerSessao,limparSessoesExpiradas };
