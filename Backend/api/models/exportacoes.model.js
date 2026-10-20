"use strict";

const pool = require("../database/connection");

function parametrosBase(usuario) {
    return [usuario.perfil, usuario.setor_id];
}

function adicionarFiltro(condicoes, params, expressao, valor) {
    if (valor === undefined || valor === null || valor === "") return;
    params.push(valor);
    condicoes.push(`${expressao} $${params.length}`);
}

function filtrosAtivos(usuario, filtros = {}) {
    const params = parametrosBase(usuario);
    const condicoes = ["a.excluido_em IS NULL", "($1 = 'admin' OR c.setor_id = $2)"];
    if (filtros.patrimonio) {
        adicionarFiltro(condicoes, params, "a.patrimonio ILIKE", `%${filtros.patrimonio}%`);
    }
    adicionarFiltro(condicoes, params, "c.id =", filtros.categoria_id);
    if (filtros.tipo_ids?.length) {
        params.push(filtros.tipo_ids);
        condicoes.push(`t.id = ANY($${params.length}::INTEGER[])`);
    }
    adicionarFiltro(condicoes, params, "a.setor_id =", filtros.setor_id);
    adicionarFiltro(condicoes, params, "a.status =", filtros.status);
    if (filtros.data_inicial) {
        adicionarFiltro(condicoes, params, "a.created_at >=", filtros.data_inicial);
    }
    if (filtros.data_final) {
        params.push(filtros.data_final);
        condicoes.push(`a.created_at < ($${params.length}::DATE + INTERVAL '1 day')`);
    }
    return { params, where: condicoes.join(" AND ") };
}

async function listarOpcoes(usuario) {
    const params = parametrosBase(usuario);
    const [setores, categorias, tipos, status, usuarios, acoes] = await Promise.all([
        pool.query(
            `SELECT id, nome FROM setores
             WHERE ativo = TRUE AND ($1 = 'admin' OR id = $2)
             ORDER BY nome`, params
        ),
        pool.query(
            `SELECT id, nome, setor_id FROM categorias
             WHERE $1 = 'admin' OR setor_id = $2 ORDER BY nome`, params
        ),
        pool.query(
            `SELECT t.id, t.nome, t.categoria_id, c.nome AS categoria_nome
             FROM tipos_ativo t INNER JOIN categorias c ON c.id = t.categoria_id
             WHERE $1 = 'admin' OR c.setor_id = $2
             ORDER BY c.nome, t.nome`, params
        ),
        pool.query(
            `SELECT codigo, nome FROM status_ativos
             WHERE ativo = TRUE ORDER BY ordem, nome`
        ),
        usuario.perfil === "admin"
            ? pool.query("SELECT id, nome FROM " + (process.env.INVENTARIO_TEST_SCHEMA ? "" : "public.") + "usuarios WHERE ativo = TRUE ORDER BY nome")
            : Promise.resolve({ rows: [] }),
        pool.query(
            `SELECT DISTINCT h.acao
             FROM historico_ativos h
             LEFT JOIN tipos_ativo t ON t.id = h.tipo_ativo_id
             LEFT JOIN categorias c ON c.id = t.categoria_id
             WHERE $1 = 'admin' OR c.setor_id = $2
             ORDER BY h.acao`, params
        )
    ]);
    return {
        setores: setores.rows,
        categorias: categorias.rows,
        tipos: tipos.rows,
        status: status.rows,
        usuarios: usuarios.rows,
        acoes: acoes.rows.map((item) => item.acao)
    };
}

async function listarAtivos(usuario, filtros = {}) {
    const consulta = filtrosAtivos(usuario, filtros);
    const resultado = await pool.query(
        `SELECT a.id, a.patrimonio, a.dados, a.imagem, a.status,
                a.created_at, a.updated_at, a.setor_id,
                s.nome AS setor_nome, t.id AS tipo_id, t.nome AS tipo_nome,
                c.id AS categoria_id, c.nome AS categoria_nome,
                st.nome AS status_nome,
                (e.id IS NOT NULL) AS emprestado_aberto,
                (e.id IS NOT NULL AND e.prazo_devolucao < NOW()) AS emprestimo_vencido
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         LEFT JOIN status_ativos st ON st.codigo = a.status
         LEFT JOIN emprestimos_ativos e
           ON e.ativo_id = a.id AND e.devolvido_em IS NULL
         WHERE ${consulta.where}
         ORDER BY c.nome, t.nome, a.patrimonio`,
        consulta.params
    );
    return resultado.rows;
}

async function listarCampos(usuario, tipoIds = []) {
    const params = parametrosBase(usuario);
    const condicoes = ["($1 = 'admin' OR c.setor_id = $2)"];
    if (tipoIds.length) {
        params.push(tipoIds);
        condicoes.push(`t.id = ANY($${params.length}::INTEGER[])`);
    }
    const resultado = await pool.query(
        `SELECT cp.id, cp.tipo_ativo_id, cp.nome, cp.label, cp.tipo,
                cp.obrigatorio, cp.editavel, cp.visivel, cp.ordem,
                t.nome AS tipo_nome
         FROM campos cp
         INNER JOIN tipos_ativo t ON t.id = cp.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY t.nome, cp.ordem, cp.id`,
        params
    );
    return resultado.rows;
}

async function listarEmprestimos(usuario, filtros = {}) {
    const params = parametrosBase(usuario);
    const condicoes = ["($1 = 'admin' OR c.setor_id = $2)"];
    adicionarFiltro(condicoes, params, "a.setor_id =", filtros.setor_id);
    if (filtros.tipo_ids?.length) {
        params.push(filtros.tipo_ids);
        condicoes.push(`e.tipo_ativo_id = ANY($${params.length}::INTEGER[])`);
    }
    if (filtros.data_inicial) adicionarFiltro(condicoes, params, "e.emprestado_em >=", filtros.data_inicial);
    if (filtros.data_final) {
        params.push(filtros.data_final);
        condicoes.push(`e.emprestado_em < ($${params.length}::DATE + INTERVAL '1 day')`);
    }
    if (filtros.responsavel) {
        adicionarFiltro(condicoes, params, "e.responsavel ILIKE", `%${filtros.responsavel}%`);
    }
    if (filtros.situacao === "aberto") condicoes.push("e.devolvido_em IS NULL");
    if (filtros.situacao === "vencido") condicoes.push("e.devolvido_em IS NULL AND e.prazo_devolucao < NOW()");
    if (filtros.situacao === "devolvido") condicoes.push("e.devolvido_em IS NOT NULL");
    const resultado = await pool.query(
        `SELECT e.id, e.patrimonio, e.responsavel, e.observacao,
                e.emprestado_em, e.prazo_devolucao, e.devolvido_em,
                e.usuario_saida_nome, e.usuario_devolucao_nome,
                t.id AS tipo_id, t.nome AS tipo_nome,
                a.setor_id, sa.nome AS setor_ativo_nome,
                sr.nome AS setor_responsavel_nome,
                CASE WHEN e.devolvido_em IS NOT NULL THEN 'devolvido'
                     WHEN e.prazo_devolucao < NOW() THEN 'vencido'
                     ELSE 'em_aberto' END AS situacao
         FROM emprestimos_ativos e
         INNER JOIN tipos_ativo t ON t.id = e.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN ativos a ON a.id = e.ativo_id
         LEFT JOIN setores sa ON sa.id = a.setor_id
         LEFT JOIN setores sr ON sr.id = e.setor_responsavel_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY e.emprestado_em DESC, e.id DESC`,
        params
    );
    return resultado.rows;
}

async function listarHistorico(usuario, filtros = {}) {
    const params = parametrosBase(usuario);
    const condicoes = ["($1 = 'admin' OR c.setor_id = $2)"];
    if (filtros.patrimonio) adicionarFiltro(condicoes, params, "h.patrimonio ILIKE", `%${filtros.patrimonio}%`);
    if (filtros.tipo_ids?.length) {
        params.push(filtros.tipo_ids);
        condicoes.push(`h.tipo_ativo_id = ANY($${params.length}::INTEGER[])`);
    }
    if (filtros.setor_id) {
        params.push(filtros.setor_id);
        condicoes.push(`(h.setor_anterior_id = $${params.length} OR h.setor_novo_id = $${params.length})`);
    }
    adicionarFiltro(condicoes, params, "h.usuario_id =", filtros.usuario_id);
    adicionarFiltro(condicoes, params, "h.acao =", filtros.acao);
    if (filtros.data_inicial) adicionarFiltro(condicoes, params, "h.created_at >=", filtros.data_inicial);
    if (filtros.data_final) {
        params.push(filtros.data_final);
        condicoes.push(`h.created_at < ($${params.length}::DATE + INTERVAL '1 day')`);
    }
    const resultado = await pool.query(
        `SELECT h.id, h.patrimonio, h.acao, h.descricao,
                h.usuario_id, h.usuario_nome, h.status_anterior, h.status_novo,
                h.dados_anteriores, h.dados_novos, h.campos_alterados,
                h.created_at, t.id AS tipo_id, t.nome AS tipo_nome,
                sa.nome AS setor_anterior_nome, sn.nome AS setor_novo_nome,
                sta.nome AS status_anterior_nome, stn.nome AS status_novo_nome
         FROM historico_ativos h
         LEFT JOIN tipos_ativo t ON t.id = h.tipo_ativo_id
         LEFT JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores sa ON sa.id = h.setor_anterior_id
         LEFT JOIN setores sn ON sn.id = h.setor_novo_id
         LEFT JOIN status_ativos sta ON sta.codigo = h.status_anterior
         LEFT JOIN status_ativos stn ON stn.codigo = h.status_novo
         WHERE ${condicoes.join(" AND ")}
         ORDER BY h.created_at DESC, h.id DESC`,
        params
    );
    return resultado.rows;
}

async function listarChecklist(usuario, filtros) {
    const ativo = (await pool.query(
        `SELECT a.id, a.patrimonio, t.nome AS tipo_nome, c.nome AS categoria_nome
         FROM ativos a
         JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         JOIN categorias c ON c.id = t.categoria_id
         WHERE a.excluido_em IS NULL AND a.tipo_ativo_id = $1 AND a.patrimonio = $2
           AND ($3 = 'admin' OR c.setor_id = $4)`,
        [filtros.tipo_checklist_id, filtros.patrimonio, usuario.perfil, usuario.setor_id]
    )).rows[0];
    if (!ativo) return null;
    const params = [ativo.id];
    const condicoes = ["ec.ativo_id = $1"];
    if (filtros.data_inicial) adicionarFiltro(condicoes, params, "(ec.executado_em AT TIME ZONE 'America/Cuiaba')::DATE >=", filtros.data_inicial);
    if (filtros.data_final) {
        params.push(filtros.data_final);
        condicoes.push(`(ec.executado_em AT TIME ZONE 'America/Cuiaba')::DATE <= $${params.length}::DATE`);
    }
    const registros = (await pool.query(
        `SELECT ec.id, ec.data_prevista, ec.executado_em, ec.resultado,
                ec.observacao, ec.respostas, ec.proxima_data, ec.usuario_nome, ec.imagens,
                m.versao AS modelo_versao
         FROM execucoes_checklist ec
         LEFT JOIN checklist_ocorrencias o ON o.id = ec.ocorrencia_id
         LEFT JOIN checklist_modelos m ON m.id = o.modelo_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY ec.executado_em DESC, ec.id DESC`, params
    )).rows;
    return { ativo, registros };
}

async function listarTabelaCompleta(tabela) {
    const consultas = {
        categorias: `SELECT id, nome, setor_id, icone, ordem, created_at FROM categorias ORDER BY id`,
        tipos_ativos: `SELECT id, categoria_id, nome, icone, permite_emprestimo, created_at FROM tipos_ativo ORDER BY id`,
        campos_personalizados: `SELECT id, tipo_ativo_id, nome, label, tipo, opcoes, obrigatorio, editavel, visivel, ordem, created_at FROM campos ORDER BY id`,
        setores: `SELECT id, nome, ativo, created_at FROM setores ORDER BY id`,
        status: `SELECT codigo, nome, cor, ativo, ordem, created_at FROM status_ativos ORDER BY ordem, codigo`,
        movimentacoes_chaves: `SELECT id, ativo_id, patrimonio, tipo_ativo_id, acao, responsavel, empresa_setor, setor_responsavel_id, observacao, usuario_id, usuario_nome, created_at FROM movimentacoes_chaves ORDER BY id`,
        movimentacoes_ferramentas: `SELECT id, ativo_id, patrimonio, tipo_ativo_id, acao, responsavel, empresa_setor, setor_responsavel_id, observacao, usuario_id, usuario_nome, created_at FROM movimentacoes_ferramentas ORDER BY id`
    };
    if (!consultas[tabela]) throw new Error("Tabela de exportação inválida");
    return (await pool.query(consultas[tabela])).rows;
}

module.exports = {
    listarAtivos,
    listarCampos,
    listarEmprestimos,
    listarHistorico,
    listarChecklist,
    listarOpcoes,
    listarTabelaCompleta
};
