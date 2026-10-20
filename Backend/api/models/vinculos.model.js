const pool = require("../database/connection");

const COLUNAS_MEMBRO = `a.id AS ativo_id, a.revisao, a.patrimonio, a.status, a.setor_id,
    t.id AS tipo_ativo_id, t.nome AS tipo_nome, t.categoria_id, t.permite_vinculo,
    c.nome AS categoria_nome, c.setor_id AS categoria_setor_id,
    s.nome AS setor_nome`;

async function buscarGrupoPorAtivo(ativoId, usuario, cliente = pool) {
    const grupo = await cliente.query(
        `SELECT g.id, g.revisao, g.nome, g.created_at, g.updated_at
         FROM grupos_ativos g
         INNER JOIN grupos_ativos_membros gm ON gm.grupo_id = g.id
         INNER JOIN ativos a ON a.id = gm.ativo_id
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE gm.ativo_id = $1
           AND ($2 = 'admin' OR c.setor_id = $3)`,
        [ativoId, usuario.perfil, usuario.setor_id]
    );
    if (!grupo.rows[0]) return null;
    const membros = await listarMembros(grupo.rows[0].id, usuario, cliente);
    return { ...grupo.rows[0], membros };
}

async function listarMembros(grupoId, usuario, cliente = pool) {
    const resultado = await cliente.query(
        `SELECT ${COLUNAS_MEMBRO}
         FROM grupos_ativos_membros gm
         INNER JOIN ativos a ON a.id = gm.ativo_id
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         WHERE gm.grupo_id = $1
           AND ($2 = 'admin' OR c.setor_id = $3)
         ORDER BY t.nome, a.patrimonio`,
        [grupoId, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows;
}

async function buscarAtivo(tipo, patrimonio, usuario) {
    const encontrado=await require("./ativos.model").buscarTipoPorNome(String(tipo),usuario);
    if (!encontrado) return null;
    tipo=String(encontrado.id);
    const resultado = await pool.query(
        `SELECT ${COLUNAS_MEMBRO}
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         WHERE a.excluido_em IS NULL AND t.id::TEXT=$1
           AND a.patrimonio = $2
           AND ($3 = 'admin' OR c.setor_id = $4)`,
        [tipo, patrimonio, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows[0];
}

async function buscarAtivos(ids, usuario, cliente = pool) {
    const resultado = await cliente.query(
        `SELECT ${COLUNAS_MEMBRO}, gm.grupo_id, EXISTS(SELECT 1 FROM emprestimos_ativos e WHERE e.ativo_id=a.id AND e.devolvido_em IS NULL) AS emprestimo_aberto
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         LEFT JOIN grupos_ativos_membros gm ON gm.ativo_id = a.id
         WHERE a.excluido_em IS NULL AND a.id = ANY($1::INTEGER[])
           AND ($2 = 'admin' OR c.setor_id = $3)`,
        [ids, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows;
}

async function candidatos(termo, usuario) {
    const cliente=pool;
    const busca = `%${termo || ""}%`;
    const resultado = await pool.query(
        `SELECT ${COLUNAS_MEMBRO}, gm.grupo_id
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         LEFT JOIN grupos_ativos_membros gm ON gm.ativo_id = a.id
         WHERE a.excluido_em IS NULL AND t.permite_vinculo = TRUE
           AND a.status <> 'emprestado'
           AND ($1 = 'admin' OR c.setor_id = $2)
           AND (a.patrimonio ILIKE $3 OR t.nome ILIKE $3 OR COALESCE(s.nome, '') ILIKE $3)
         ORDER BY a.patrimonio
         LIMIT 50`,
        [usuario.perfil, usuario.setor_id, busca]
    );
    return resultado.rows;
}

async function listarGrupos(usuario, categoriaId = null) {
    const resultado = await pool.query(
        `SELECT g.id, g.revisao, g.nome, g.created_at, g.updated_at,
                COUNT(gm.ativo_id)::INTEGER AS total_membros,
                JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'ativo_id', a.id, 'revisao',a.revisao,
                        'patrimonio', a.patrimonio,
                        'tipo_ativo_id', t.id,
                        'tipo_nome', t.nome,
                        'categoria_id', c.id,
                        'categoria_nome', c.nome,
                        'setor_id', a.setor_id,
                        'setor_nome', s.nome,
                        'status', a.status
                    ) ORDER BY t.nome, a.patrimonio
                ) AS membros
         FROM grupos_ativos g
         INNER JOIN grupos_ativos_membros gm ON gm.grupo_id = g.id
         INNER JOIN ativos a ON a.id = gm.ativo_id
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         WHERE ($1 = 'admin' OR c.setor_id = $2)
           AND (
               $3::INTEGER IS NULL
               OR EXISTS (
                   SELECT 1
                   FROM grupos_ativos_membros filtro_gm
                   INNER JOIN ativos filtro_a ON filtro_a.id = filtro_gm.ativo_id
                   INNER JOIN tipos_ativo filtro_t ON filtro_t.id = filtro_a.tipo_ativo_id
                   WHERE filtro_gm.grupo_id = g.id
                     AND filtro_t.categoria_id = $3
               )
           )
         GROUP BY g.id
         ORDER BY g.nome, g.id`,
        [usuario.perfil, usuario.setor_id, categoriaId]
    );
    return resultado.rows;
}

async function salvar(id, nome, ids, usuario, setorId, revisao, revisoes) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        await cliente.query(
            `SELECT pg_advisory_xact_lock(
                hashtext(LOWER(BTRIM($1)) || ':' || COALESCE($2::TEXT, 'sem-setor'))
             )`,
            [nome, setorId]
        );
        const duplicado = await cliente.query(
            `SELECT g.id
             FROM grupos_ativos g
             INNER JOIN grupos_ativos_membros gm ON gm.grupo_id = g.id
             INNER JOIN ativos a ON a.id = gm.ativo_id
             WHERE LOWER(BTRIM(g.nome)) = LOWER(BTRIM($1))
               AND a.setor_id IS NOT DISTINCT FROM $2
               AND ($3::INTEGER IS NULL OR g.id <> $3)
             LIMIT 1`,
            [nome, setorId, id]
        );
        if (duplicado.rows[0]) {
            const erro = new Error("Já existe um grupo com este nome neste setor. Selecione o grupo existente.");
            erro.status = 409;
            throw erro;
        }
        const anteriores=id ? (await cliente.query("SELECT ativo_id FROM grupos_ativos_membros WHERE grupo_id=$1 ORDER BY ativo_id",[id])).rows.map(m=>m.ativo_id) : [];
        const afetados=[...new Set([...anteriores,...ids])].sort((a,b)=>a-b);
        await cliente.query("SELECT id FROM ativos WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",[afetados]);
        const autorizados=await buscarAtivos(afetados,usuario,cliente);
        if(autorizados.length!==afetados.length) {const erro=new Error("Um integrante foi excluído ou deixou de pertencer ao seu setor");erro.status=409;throw erro;}
        for(const ativo of autorizados.filter(a=>ids.includes(a.ativo_id))) require("../database/concorrencia").conferir(revisoes?.[ativo.ativo_id],ativo.revisao);
        let grupoId = id;
        if (grupoId) {
            const atual = await cliente.query(
                `SELECT id,revisao FROM grupos_ativos WHERE id = $1 FOR UPDATE`, [grupoId]
            );
            if (!atual.rows[0]) {
                const erro = new Error("Grupo não encontrado");
                erro.status = 404;
                throw erro;
            }
            require("../database/concorrencia").conferir(revisao,atual.rows[0].revisao);
            await cliente.query(
                `UPDATE grupos_ativos SET nome = $2, updated_at = NOW() WHERE id = $1`,
                [grupoId, nome]
            );
            await cliente.query(
                `DELETE FROM grupos_ativos_membros WHERE grupo_id = $1`, [grupoId]
            );
        } else {
            const novo = await cliente.query(
                `INSERT INTO grupos_ativos (nome, criado_por)
                 VALUES ($1, $2) RETURNING id`,
                [nome, usuario.id]
            );
            grupoId = novo.rows[0].id;
        }
        const bloqueados=await cliente.query(
            `SELECT a.id FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
             WHERE a.id=ANY($1::integer[]) AND a.excluido_em IS NULL AND ($2='admin' OR c.setor_id=$3)
             ORDER BY a.id FOR UPDATE OF a`,[ids,usuario.perfil,usuario.setor_id]);
        if (bloqueados.rows.length!==ids.length) {const erro=new Error("Ativo excluído ou sem permissão. Recarregue o grupo.");erro.status=409;throw erro;}
        await require("../services/vinculos.service").validarMembros(ids,usuario,id,cliente);
        await cliente.query(
            `INSERT INTO grupos_ativos_membros (grupo_id, ativo_id)
             SELECT $1, UNNEST($2::INTEGER[])`,
            [grupoId, ids]
        );
        await registrarHistoricoGrupo(cliente,afetados,usuario,`Grupo ${nome}: composição atualizada`,grupoId);
        await cliente.query("COMMIT");
        return grupoId;
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally { cliente.release(); }
}

async function desvincular(grupoId, ativoId, usuario, revisao) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const grupo=(await cliente.query("SELECT revisao FROM grupos_ativos WHERE id=$1 FOR UPDATE",[grupoId])).rows[0];
        require("../database/concorrencia").conferir(revisao,grupo?.revisao);
        const membros=await listarMembros(grupoId,usuario,cliente);
        if(!membros.some(m=>Number(m.ativo_id)===ativoId)) {const erro=new Error("Vínculo não encontrado");erro.status=404;throw erro;}
        await cliente.query("SELECT id FROM ativos WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",[membros.map(m=>m.ativo_id)]);
        await cliente.query("UPDATE grupos_ativos SET updated_at=NOW() WHERE id=$1",[grupoId]);
        const removido = await cliente.query(
            `DELETE FROM grupos_ativos_membros
             WHERE grupo_id = $1 AND ativo_id = $2 RETURNING ativo_id`,
            [grupoId, ativoId]
        );
        const total = await cliente.query(
            `SELECT COUNT(*)::INTEGER AS total FROM grupos_ativos_membros WHERE grupo_id = $1`,
            [grupoId]
        );
        if ((total.rows[0]?.total || 0) < 2) {
            await cliente.query(`DELETE FROM grupos_ativos WHERE id = $1`, [grupoId]);
        }
        await registrarHistoricoGrupo(cliente,membros.map(m=>m.ativo_id),usuario,"Integrante desvinculado do grupo",grupoId);
        await cliente.query("COMMIT");
        return Boolean(removido.rows[0]);
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally { cliente.release(); }
}

module.exports = {
    buscarGrupoPorAtivo, listarMembros, buscarAtivo, buscarAtivos,
    candidatos, listarGrupos, salvar, desvincular
};

async function registrarHistoricoGrupo(cliente,ids,usuario,descricao,grupoId) {
    for(const id of ids) {
        await cliente.query(`INSERT INTO historico_ativos(ativo_id,patrimonio,tipo_ativo_id,usuario_id,usuario_nome,acao,descricao,dados_novos,campos_alterados)
        SELECT a.id,a.patrimonio,a.tipo_ativo_id,$2,$3,'vinculo',$4,jsonb_build_object('grupo_id',gm.grupo_id),'["grupo_id"]'::jsonb
        FROM ativos a LEFT JOIN grupos_ativos_membros gm ON gm.ativo_id=a.id WHERE a.id=$1`,[id,usuario.id,usuario.nome,descricao]);
    }
}
