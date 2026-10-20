// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");
const iconesModel = require("./icones.model");

// =====================
// Consultas ao banco de dados
// =====================

// Função: Consulta no banco a lista de tipos de ativo visível dentro do escopo informado.
async function listar(usuario) {
    const resultado = await pool.query(
        `
        SELECT
            ta.id, ta.revisao,
            ta.nome,
            ta.icone,
            ta.permite_emprestimo,
            ta.permite_checklist,
            ta.checklist_intervalo_meses,
            ta.checklist_recorrencia,
            ta.checklist_datas_personalizadas,
            ta.checklist_alerta_dias,
            ta.checklist_modo,
            ta.checklist_itens,
            ta.permite_vinculo,
            ta.categoria_id,
            c.nome AS categoria_nome,
            c.icone AS categoria_icone,
            c.setor_id,
            ($1 = 'admin' OR c.setor_id = $2) AS gerenciavel,
            hi.usuario_nome AS icone_usuario_nome,
            hi.created_at AS icone_atualizado_em,
            ta.created_at
        FROM tipos_ativo ta
        INNER JOIN categorias c
            ON c.id = ta.categoria_id
        LEFT JOIN LATERAL (
            SELECT usuario_nome, created_at
            FROM historico_icones
            WHERE entidade = 'tipo_ativo' AND registro_id = ta.id
            ORDER BY id DESC
            LIMIT 1
        ) hi ON TRUE
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

// Função: Consulta no banco os tipos de ativo associados ao filtro informado e respeita o escopo do usuário.
async function listarPorCategoria(categoriaId, usuario) {
    const resultado = await pool.query(
        `
        SELECT
            ta.id, ta.revisao,
            ta.nome,
            ta.icone,
            ta.permite_emprestimo,
            ta.permite_checklist,
            ta.checklist_intervalo_meses,
            ta.checklist_recorrencia,
            ta.checklist_datas_personalizadas,
            ta.checklist_alerta_dias,
            ta.checklist_modo,
            ta.checklist_itens,
            ta.permite_vinculo,
            ta.categoria_id,
            c.nome AS categoria_nome,
            c.icone AS categoria_icone,
            c.setor_id,
            ($2 = 'admin' OR c.setor_id = $3) AS gerenciavel,
            hi.usuario_nome AS icone_usuario_nome,
            hi.created_at AS icone_atualizado_em,
            ta.created_at
        FROM tipos_ativo ta
        INNER JOIN categorias c
            ON c.id = ta.categoria_id
        LEFT JOIN LATERAL (
            SELECT usuario_nome, created_at
            FROM historico_icones
            WHERE entidade = 'tipo_ativo' AND registro_id = ta.id
            ORDER BY id DESC
            LIMIT 1
        ) hi ON TRUE
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

// Função: Consulta no banco um registro de tipos de ativo pela chave informada e respeita o escopo de acesso recebido.
async function buscarPorId(id, usuario) {
    const resultado = await pool.query(
        `
        SELECT
            ta.id, ta.revisao,
            ta.nome,
            ta.icone,
            ta.permite_emprestimo,
            ta.permite_checklist,
            ta.checklist_intervalo_meses,
            ta.checklist_recorrencia,
            ta.checklist_datas_personalizadas,
            ta.checklist_alerta_dias,
            ta.checklist_modo,
            ta.checklist_itens,
            ta.permite_vinculo,
            ta.categoria_id,
            c.nome AS categoria_nome,
            c.icone AS categoria_icone,
            hi.usuario_nome AS icone_usuario_nome,
            hi.created_at AS icone_atualizado_em,
            ta.created_at
        FROM tipos_ativo ta
        INNER JOIN categorias c
            ON c.id = ta.categoria_id
        LEFT JOIN LATERAL (
            SELECT usuario_nome, created_at
            FROM historico_icones
            WHERE entidade = 'tipo_ativo' AND registro_id = ta.id
            ORDER BY id DESC
            LIMIT 1
        ) hi ON TRUE
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

// Função: Insere no banco um novo registro de tipos de ativo com os dados já validados.
async function criar(
    categoriaId,
    nome,
    icone,
    permiteEmprestimo,
    configuracao,
    usuario
) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const resultado = await cliente.query(
            `INSERT INTO tipos_ativo (
                categoria_id, nome, icone, permite_emprestimo,
                permite_checklist, checklist_intervalo_meses,
                checklist_recorrencia, checklist_datas_personalizadas,
                checklist_alerta_dias, checklist_modo,
                checklist_itens, permite_vinculo
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, categoria_id, nome, icone,
                       permite_emprestimo, permite_checklist,
                       checklist_intervalo_meses, checklist_recorrencia,
                       checklist_datas_personalizadas, checklist_alerta_dias,
                       checklist_modo, checklist_itens, permite_vinculo,
                       created_at`,
            [categoriaId, nome, icone, permiteEmprestimo,
                configuracao.permite_checklist,
                configuracao.checklist_intervalo_meses,
                configuracao.checklist_recorrencia,
                JSON.stringify(configuracao.checklist_datas_personalizadas),
                configuracao.checklist_alerta_dias,
                configuracao.checklist_modo,
                JSON.stringify(configuracao.checklist_itens),
                configuracao.permite_vinculo]
        );
        const tipo = resultado.rows[0];
        const categoria = await cliente.query(
            "SELECT setor_id FROM categorias WHERE id = $1",
            [categoriaId]
        );
        await iconesModel.registrar(cliente, {
            entidade: "tipo_ativo",
            registro_id: tipo.id,
            registro_nome: tipo.nome,
            icone_anterior: null,
            icone_novo: tipo.icone,
            setor_id: categoria.rows[0]?.setor_id,
            usuario
        });
        await cliente.query("COMMIT");
        return tipo;
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

// Função: Atualiza no banco o registro de tipos de ativo identificado e devolve seus dados resultantes.
async function atualizar(
    id,
    categoriaId,
    nome,
    icone,
    permiteEmprestimo,
    configuracao,
    usuario
) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const anterior = await cliente.query(
            `SELECT ta.id, ta.revisao, ta.nome, ta.icone, ta.permite_checklist,
                    ta.checklist_intervalo_meses, ta.checklist_recorrencia,
                    ta.checklist_datas_personalizadas, ta.checklist_modo,
                    c.setor_id
             FROM tipos_ativo ta
             INNER JOIN categorias c ON c.id = ta.categoria_id
             WHERE ta.id = $1 AND ($2='admin' OR c.setor_id=$3)
             FOR UPDATE OF ta`,
            [id,usuario.perfil,usuario.setor_id]
        );
        require("../database/concorrencia").conferir(configuracao.revisao,anterior.rows[0]?.revisao);
        const impedimentos=await cliente.query(`SELECT
            EXISTS(SELECT 1 FROM emprestimos_ativos WHERE tipo_ativo_id=$1 AND devolvido_em IS NULL) AS emprestimo,
            EXISTS(SELECT 1 FROM grupos_ativos_membros gm JOIN ativos a ON a.id=gm.ativo_id WHERE a.tipo_ativo_id=$1) AS grupo`,[id]);
        if ((!permiteEmprestimo && impedimentos.rows[0].emprestimo) || (!configuracao.permite_vinculo && impedimentos.rows[0].grupo)) {
            const erro=new Error("O tipo passou a ter empréstimos ou vínculos. Consulte os dados atuais.");erro.status=409;throw erro;
        }
        if (!(await cliente.query("SELECT 1 FROM categorias WHERE id=ANY($1::integer[]) AND ($2='admin' OR setor_id=$3)",[[categoriaId],usuario.perfil,usuario.setor_id])).rows.length) {
            const erro=new Error("Categoria não encontrada ou sem permissão");erro.status=404;throw erro;
        }
        const resultado = await cliente.query(
            `UPDATE tipos_ativo
             SET categoria_id = $1, nome = $2, icone = $3,
                  permite_emprestimo = $4, permite_checklist = $5,
                  checklist_intervalo_meses = $6,
                  checklist_recorrencia = $7,
                  checklist_datas_personalizadas = $8,
                  checklist_alerta_dias = $9, checklist_modo = $10,
                  checklist_itens = $11, permite_vinculo = $12
             WHERE id = $13
             RETURNING id, categoria_id, nome, icone,
                       permite_emprestimo, permite_checklist,
                       checklist_intervalo_meses, checklist_recorrencia,
                       checklist_datas_personalizadas, checklist_alerta_dias,
                       checklist_modo, checklist_itens, permite_vinculo,
                       created_at`,
            [categoriaId, nome, icone, permiteEmprestimo,
                configuracao.permite_checklist,
                configuracao.checklist_intervalo_meses,
                configuracao.checklist_recorrencia,
                JSON.stringify(configuracao.checklist_datas_personalizadas),
                configuracao.checklist_alerta_dias,
                configuracao.checklist_modo,
                JSON.stringify(configuracao.checklist_itens),
                configuracao.permite_vinculo, id]
        );
        const tipo = resultado.rows[0];
        if (tipo.permite_checklist) await sincronizarAgenda(cliente,tipo);
        const categoria = await cliente.query(
            "SELECT setor_id FROM categorias WHERE id = $1",
            [categoriaId]
        );
        await iconesModel.registrar(cliente, {
            entidade: "tipo_ativo",
            registro_id: tipo.id,
            registro_nome: tipo.nome,
            icone_anterior: anterior.rows[0]?.icone,
            icone_novo: tipo.icone,
            setor_id: categoria.rows[0]?.setor_id,
            usuario
        });
        await cliente.query("COMMIT");
        return tipo;
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

// Função: Remove do banco o registro identificado de tipos de ativo e devolve o item afetado quando aplicável.
async function remover(id,usuario,revisao) {
    return require("../database/transacao").executar(async cliente=>{
    const atual=(await cliente.query("SELECT t.revisao FROM tipos_ativo t JOIN categorias c ON c.id=t.categoria_id WHERE t.id=$1 AND ($2='admin' OR c.setor_id=$3) FOR UPDATE OF t",[id,usuario.perfil,usuario.setor_id])).rows[0];
    require("../database/concorrencia").conferir(revisao,atual?.revisao);
    const resultado = await cliente.query(
        `
        DELETE FROM tipos_ativo
        WHERE id = $1
        RETURNING id
        `,
        [id]
    );

    return resultado.rows[0];
    });
}

// Função: Verifica se o tipo possui algum empréstimo ainda aberto antes de desativar essa função.
async function possuiEmprestimosAbertos(id) {
    const resultado = await pool.query(
        `
        SELECT EXISTS (
            SELECT 1
            FROM emprestimos_ativos
            WHERE tipo_ativo_id = $1
              AND devolvido_em IS NULL
        ) AS possui
        `,
        [id]
    );

    return resultado.rows[0].possui;
}

async function possuiVinculosAtivos(id) {
    const resultado = await pool.query(
        `SELECT EXISTS (
             SELECT 1
             FROM grupos_ativos_membros gm
             INNER JOIN ativos a ON a.id = gm.ativo_id
             WHERE a.tipo_ativo_id = $1
         ) AS possui`,
        [id]
    );
    return resultado.rows[0].possui;
}

// Função: Verifica no banco se a categoria informada existe antes de permitir operações dependentes.
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

// Função: Confere se a categoria pertence ao escopo que o usuário pode administrar.
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

// Função: Verifica se o usuário pode alterar o tipo de ativo informado conforme seu perfil e setor.
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

// Função: Verifica se o usuário pode consultar o tipo de ativo informado conforme seu perfil e setor.
async function usuarioPodeVisualizar(id, usuario) {
    return Boolean(await buscarPorId(id, usuario));
}

// =====================
// Exportações
// =====================

// Preserva pendências abertas e desconsidera datas que já tiveram ocorrência.
async function sincronizarAgenda(cliente,tipo) {
    await cliente.query(`UPDATE ativos a SET checklist_proxima_data=CASE
        WHEN $2='personalizado' THEN (
            SELECT MIN(d::date) FROM jsonb_array_elements_text($3::jsonb) agenda(d)
            WHERE d::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date
            AND NOT EXISTS(SELECT 1 FROM checklist_ocorrencias o WHERE o.ativo_id=a.id AND o.vencimento=d::date))
        WHEN $2='semanal' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date+7
        ELSE ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date+($4::text||' months')::interval)::date END
        WHERE a.tipo_ativo_id=$1 AND a.excluido_em IS NULL
        AND NOT EXISTS(SELECT 1 FROM checklist_ocorrencias o WHERE o.ativo_id=a.id AND o.situacao='pendente')
        AND (a.checklist_proxima_data IS NULL OR $2='personalizado')`,
        [tipo.id,tipo.checklist_recorrencia,JSON.stringify(tipo.checklist_datas_personalizadas||[]),tipo.checklist_intervalo_meses]);
}

module.exports = {
    sincronizarAgenda,
    listar,
    listarPorCategoria,
    buscarPorId,
    criar,
    atualizar,
    remover,
    possuiEmprestimosAbertos,
    possuiVinculosAtivos,
    categoriaExiste,
    categoriaGerenciavel,
    usuarioPodeGerenciar,
    usuarioPodeVisualizar
};
