// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");

// =====================
// Consultas ao banco de dados
// =====================

// Função: Lista os status pela ordem configurada, podendo restringir o resultado aos registros ativos.
async function listarStatus(apenasAtivos = true, cliente = pool) {
    const resultado = await cliente.query(
        `SELECT codigo, nome, cor, ativo, ordem
         FROM status_ativos
         WHERE ($1 = FALSE OR ativo = TRUE)
         ORDER BY ordem, nome ${cliente===pool ? "" : "FOR SHARE"}`,
        [apenasAtivos]
    );
    return resultado.rows;
}

// Função: Cria ou atualiza no banco o status identificado pelo código informado.
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

// Contas são globais; vínculos de setores pertencem à unidade selecionada.
async function listarUsuarios(unidadeId) {
    if (process.env.INVENTARIO_TEST_SCHEMA) {
        const r=await pool.query("SELECT u.id,u.login,u.nome,u.perfil,u.setor_id,s.nome AS setor_nome,u.ativo,u.ultimo_acesso,COUNT(se.token_hash)::INTEGER AS sessoes_ativas FROM usuarios u LEFT JOIN setores s ON s.id=u.setor_id LEFT JOIN sessoes se ON se.usuario_id=u.id AND se.expira_em>NOW() GROUP BY u.id,s.nome ORDER BY u.perfil,u.nome");
        return r.rows;
    }
    const r=await pool.query(
        "SELECT u.id,u.login,u.nome,u.perfil,u.ativo,u.ultimo_acesso," +
        "COALESCE(array_agg(DISTINCT x.setor_id) FILTER (WHERE x.setor_id IS NOT NULL),ARRAY[]::integer[]) AS setores_ids," +
        "COUNT(DISTINCT se.token_hash)::integer AS sessoes_ativas " +
        "FROM public.usuarios u LEFT JOIN public.usuario_unidades x ON x.usuario_id=u.id AND x.unidade_id=$1 " +
        "LEFT JOIN public.sessoes se ON se.usuario_id=u.id AND se.expira_em>NOW() " +
        "GROUP BY u.id ORDER BY u.perfil,u.nome", [unidadeId]
    );
    return r.rows;
}
async function buscarSetorAtivo(id) {
    const r=await pool.query("SELECT id FROM setores WHERE id=$1 AND ativo=TRUE",[id]);
    return r.rows[0];
}
async function criarUsuario(dados) {
    if (process.env.INVENTARIO_TEST_SCHEMA) {
        const r=await pool.query("INSERT INTO usuarios(login,nome,senha_hash,perfil,setor_id,ativo) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,login,nome,perfil,setor_id,ativo,ultimo_acesso",
            [dados.login,dados.nome,dados.senha_hash,dados.perfil,dados.setor_id,dados.ativo]);
        return r.rows[0];
    }
    const cliente=await pool.connect();
    try {
        await cliente.query("BEGIN");
        const r=await cliente.query("INSERT INTO public.usuarios(login,nome,senha_hash,perfil,ativo) VALUES($1,$2,$3,$4,$5) RETURNING id,login,nome,perfil,ativo,ultimo_acesso",
            [dados.login,dados.nome,dados.senha_hash,dados.perfil,dados.ativo]);
        for (const acesso of dados.acessos || []) {
            for (const setorId of acesso.setores_ids) {
                await cliente.query("INSERT INTO public.usuario_unidades(usuario_id,unidade_id,setor_id) VALUES($1,$2,$3)",
                    [r.rows[0].id,acesso.unidade_id,setorId]);
            }
        }
        await cliente.query("COMMIT");
        return r.rows[0];
    } catch(e) { await cliente.query("ROLLBACK");throw e; }
    finally { cliente.release(); }
}
async function atualizarUsuario(id,dados) {
    if (process.env.INVENTARIO_TEST_SCHEMA) {
        const r=await pool.query("UPDATE usuarios SET nome=COALESCE($1,nome),ativo=COALESCE($2,ativo),senha_hash=COALESCE($3,senha_hash) WHERE id=$4 RETURNING id,login,nome,perfil,setor_id,ativo,ultimo_acesso",
            [dados.nome,dados.ativo,dados.senha_hash,id]);
        return r.rows[0];
    }
    const cliente=await pool.connect();
    try {
        await cliente.query("BEGIN");
        const r=await cliente.query("UPDATE public.usuarios SET nome=COALESCE($1,nome),ativo=COALESCE($2,ativo),senha_hash=COALESCE($3,senha_hash) WHERE id=$4 RETURNING id,login,nome,perfil,ativo,ultimo_acesso",
            [dados.nome,dados.ativo,dados.senha_hash,id]);
        if(r.rows[0] && dados.acessos) {
            await cliente.query("DELETE FROM public.usuario_unidades WHERE usuario_id=$1",[id]);
            for(const acesso of dados.acessos) for(const setorId of acesso.setores_ids) {
                await cliente.query("INSERT INTO public.usuario_unidades(usuario_id,unidade_id,setor_id) VALUES($1,$2,$3)",
                    [id,acesso.unidade_id,setorId]);
            }
            await cliente.query("DELETE FROM public.sessoes WHERE usuario_id=$1",[id]);
        }
        await cliente.query("COMMIT");
        return r.rows[0];
    } catch(e) { await cliente.query("ROLLBACK");throw e; }
    finally { cliente.release(); }
}
async function encerrarSessoes(usuarioId) {
    await pool.query("DELETE FROM " + (process.env.INVENTARIO_TEST_SCHEMA ? "" : "public.") + "sessoes WHERE usuario_id=$1",[usuarioId]);
}
async function acessosUsuario(id) {
    const r=await pool.query("SELECT unidade_id,array_agg(setor_id ORDER BY setor_id) AS setores_ids FROM public.usuario_unidades WHERE usuario_id=$1 GROUP BY unidade_id ORDER BY unidade_id",[id]);
    return r.rows;
}
async function unidadePorId(id) {
    const r=await pool.query("SELECT id,schema_nome,ativo FROM public.unidades WHERE id=$1",[id]);
    return r.rows[0];
}
async function setoresAtivosDaUnidade(schema,ids) {
    if (!/^public$|^unidade_[1-9][0-9]*$/.test(schema)) throw new Error("Esquema inválido");
    const r=await pool.query('SELECT id FROM "'+schema+'".setores WHERE id=ANY($1::int[]) AND ativo=TRUE',[ids]);
    return r.rows.map(x=>x.id);
}

// Função: Calcula no banco os indicadores do painel respeitando o setor visível ao usuário.
async function dashboard(usuario) {
    const params = [usuario.perfil, usuario.setor_id];
    const resumo = await pool.query(
        `SELECT
            COUNT(*)::INTEGER AS total,
            COUNT(*) FILTER (WHERE a.status = 'em_uso')::INTEGER AS em_uso,
            COUNT(*) FILTER (WHERE t.permite_emprestimo)::INTEGER
                AS ativos_emprestaveis,
            COUNT(*) FILTER (WHERE a.status IN ('em_manutencao', 'extraviado'))::INTEGER
                AS exigem_atencao,
            COUNT(*) FILTER (WHERE a.status = 'em_manutencao')::INTEGER
                AS em_manutencao,
            COUNT(*) FILTER (WHERE a.status = 'extraviado')::INTEGER
                AS extraviados
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE a.excluido_em IS NULL AND ($1 = 'admin' OR c.setor_id = $2)`,
        params
    );
    const porStatus = await pool.query(
        `WITH visiveis AS (
            SELECT a.id, a.status
            FROM ativos a
            INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
            INNER JOIN categorias c ON c.id = t.categoria_id
            WHERE a.excluido_em IS NULL AND ($1 = 'admin' OR c.setor_id = $2)
        )
        SELECT s.codigo, s.nome, COUNT(v.id)::INTEGER AS total
        FROM status_ativos s
        LEFT JOIN visiveis v ON v.status = s.codigo
        GROUP BY s.codigo, s.nome, s.ordem
        ORDER BY s.ordem, s.nome`,
        params
    );
    const porSetor = await pool.query(
        `SELECT COALESCE(s.nome, 'Sem setor') AS nome,
                COUNT(a.id)::INTEGER AS total
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         WHERE a.excluido_em IS NULL AND ($1 = 'admin' OR c.setor_id = $2)
         GROUP BY s.id, s.nome
         ORDER BY total DESC, nome`,
        params
    );
    const porCategoria = await pool.query(
        `SELECT c.id, c.nome, COUNT(a.id)::INTEGER AS total
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE a.excluido_em IS NULL AND ($1 = 'admin' OR c.setor_id = $2)
         GROUP BY c.id, c.nome
         ORDER BY total DESC, c.nome`,
        params
    );
    const porTipo = await pool.query(
        `SELECT t.id, t.nome, COUNT(a.id)::INTEGER AS total
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE a.excluido_em IS NULL AND ($1 = 'admin' OR c.setor_id = $2)
         GROUP BY t.id, t.nome
         ORDER BY total DESC, t.nome`,
        params
    );
    const indicadores = resumo.rows[0];

    return {
        ...indicadores,
        possui_ativos_emprestaveis: indicadores.ativos_emprestaveis > 0,
        por_status: porStatus.rows,
        por_setor: porSetor.rows,
        por_categoria: porCategoria.rows,
        por_tipo: porTipo.rows
    };
}

// Função: Lista empréstimos abertos e ativos antigos emprestados sem prazo, por prioridade.
async function listarEmprestimos(usuario) {
    const resultado = await pool.query(
        `SELECT a.id AS ativo_id, a.revisao, a.patrimonio, t.id AS tipo_id,
                t.nome AS tipo_nome, c.nome AS categoria_nome,
                s.nome AS setor_nome, e.id AS emprestimo_id,
                e.responsavel, e.emprestado_em, e.prazo_devolucao,
                CASE
                    WHEN e.id IS NULL THEN 'sem_prazo'
                    WHEN e.prazo_devolucao < NOW() THEN 'vencido'
                    WHEN e.prazo_devolucao <= NOW() + INTERVAL '24 hours'
                        THEN 'proximo'
                    ELSE 'no_prazo'
                END AS situacao
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         LEFT JOIN emprestimos_ativos e
            ON e.ativo_id = a.id AND e.devolvido_em IS NULL
         WHERE a.excluido_em IS NULL AND a.status = 'emprestado'
           AND ($1 = 'admin' OR c.setor_id = $2)
         ORDER BY CASE
            WHEN e.prazo_devolucao < NOW() THEN 0
            WHEN e.prazo_devolucao <= NOW() + INTERVAL '24 hours' THEN 1
            WHEN e.id IS NULL THEN 2
            ELSE 3
         END, e.prazo_devolucao ASC NULLS LAST, a.patrimonio`,
        [usuario.perfil, usuario.setor_id]
    );
    return resultado.rows;
}

// =====================
// Exportações
// =====================

module.exports = {
    listarStatus,
    salvarStatus,
    listarUsuarios,
    acessosUsuario,
    unidadePorId,
    setoresAtivosDaUnidade,
    buscarSetorAtivo,
    criarUsuario,
    atualizarUsuario,
    encerrarSessoes,
    dashboard,
    listarEmprestimos
};
