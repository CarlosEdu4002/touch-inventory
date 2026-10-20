const pool = require("../database/connection");
const transacao = require("../database/transacao");

async function listarPlantas(incluirInativas = false, usuario) {
    const resultado = await pool.query(
        `SELECT p.id, p.nome, p.descricao, p.arquivo, p.largura, p.altura,
                p.ordem, p.ativo, p.created_at, p.updated_at,
                COUNT(DISTINCT am.id)::INTEGER AS total_ambientes,
                COUNT(DISTINCT pa.ativo_id) FILTER (WHERE a.excluido_em IS NULL AND ($2 = 'admin' OR c.setor_id = $3))::INTEGER AS total_ativos
         FROM plantas_baixas p
         LEFT JOIN ambientes_mapa am ON am.planta_id = p.id
         LEFT JOIN posicoes_ativos pa ON pa.ambiente_id = am.id
         LEFT JOIN ativos a ON a.id = pa.ativo_id
         LEFT JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         LEFT JOIN categorias c ON c.id = t.categoria_id
         WHERE ($1 = TRUE OR p.ativo = TRUE)
         GROUP BY p.id
         ORDER BY p.ordem, p.nome`,
        [incluirInativas, usuario?.perfil, usuario?.setor_id]
    );
    return resultado.rows;
}

async function buscarPlanta(id) {
    const resultado = await pool.query(
        `SELECT id, nome, descricao, arquivo, largura, altura, ordem, ativo,
                created_at, updated_at
         FROM plantas_baixas
         WHERE id = $1`,
        [id]
    );
    return resultado.rows[0];
}

async function criarPlanta(dados, usuarioId) {
    const resultado = await pool.query(
        `INSERT INTO plantas_baixas
            (nome, descricao, arquivo, largura, altura, ordem, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            dados.nome,
            dados.descricao || null,
            dados.arquivo,
            dados.largura,
            dados.altura,
            dados.ordem,
            usuarioId
        ]
    );
    return resultado.rows[0];
}

async function atualizarPlanta(id, dados) {
    return transacao.executar(async cliente=>{
    const resultado = await cliente.query(
        `UPDATE plantas_baixas
         SET nome = $1, descricao = $2, ordem = $3, ativo = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [dados.nome, dados.descricao || null, dados.ordem, dados.ativo, id]
    );
    return resultado.rows[0];
    });
}

async function removerPlanta(id) {
    return transacao.executar(async cliente=>{
    const resultado = await cliente.query(
        `DELETE FROM plantas_baixas WHERE id = $1 RETURNING arquivo`,
        [id]
    );
    return resultado.rows[0];
    });
}

async function listarAmbientes(plantaId, usuario) {
    const resultado = await pool.query(
        `SELECT am.id, am.planta_id, am.setor_id, am.nome, am.poligono,
                am.centro_x::FLOAT AS centro_x,
                am.centro_y::FLOAT AS centro_y,
                am.cor, am.padrao, s.nome AS setor_nome,
                COUNT(pa.ativo_id) FILTER (WHERE a.excluido_em IS NULL AND ($2 = 'admin' OR c.setor_id = $3))::INTEGER AS total_ativos
         FROM ambientes_mapa am
         INNER JOIN setores s ON s.id = am.setor_id
         LEFT JOIN posicoes_ativos pa ON pa.ambiente_id = am.id
         LEFT JOIN ativos a ON a.id = pa.ativo_id
         LEFT JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         LEFT JOIN categorias c ON c.id = t.categoria_id
         WHERE am.planta_id = $1
         GROUP BY am.id, s.nome
         ORDER BY am.nome`,
        [plantaId, usuario?.perfil, usuario?.setor_id]
    );
    return resultado.rows;
}

async function buscarAmbiente(id, cliente = pool, bloquear = false) {
    if (bloquear) {
        await cliente.query(
            `SELECT am.id FROM ambientes_mapa am JOIN plantas_baixas p ON p.id=am.planta_id
             WHERE am.id=$1 FOR SHARE OF am,p`, [id]);
    }
    const resultado = await cliente.query(
        `SELECT am.*, p.ativo AS planta_ativa, s.nome AS setor_nome
         FROM ambientes_mapa am
         INNER JOIN plantas_baixas p ON p.id = am.planta_id
         INNER JOIN setores s ON s.id = am.setor_id
         WHERE am.id = $1`,
        [id]
    );
    return resultado.rows[0];
}

async function salvarAmbiente(id, dados) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        if (dados.padrao) {
            await cliente.query(
                `UPDATE ambientes_mapa SET padrao = FALSE
                 WHERE setor_id = $1 AND ($2::INTEGER IS NULL OR id <> $2)`,
                [dados.setor_id, id || null]
            );
        }

        const resultado = id
            ? await cliente.query(
                  `UPDATE ambientes_mapa
                   SET planta_id = $1, setor_id = $2, nome = $3,
                       poligono = $4::JSONB, centro_x = $5, centro_y = $6,
                       cor = $7, padrao = $8, updated_at = NOW()
                   WHERE id = $9
                   RETURNING *`,
                  [
                      dados.planta_id, dados.setor_id, dados.nome,
                      JSON.stringify(dados.poligono), dados.centro_x,
                      dados.centro_y, dados.cor, dados.padrao, id
                  ]
              )
            : await cliente.query(
                  `INSERT INTO ambientes_mapa
                      (planta_id, setor_id, nome, poligono, centro_x,
                       centro_y, cor, padrao)
                   VALUES ($1, $2, $3, $4::JSONB, $5, $6, $7, $8)
                   RETURNING *`,
                  [
                      dados.planta_id, dados.setor_id, dados.nome,
                      JSON.stringify(dados.poligono), dados.centro_x,
                      dados.centro_y, dados.cor, dados.padrao
                  ]
              );
        const ambiente = resultado.rows[0];

        await cliente.query(
            `DELETE FROM posicoes_ativos pa
             USING ativos a
             WHERE pa.ambiente_id = $1
               AND a.id = pa.ativo_id
               AND a.setor_id <> $2`,
            [ambiente.id, dados.setor_id]
        );

        await cliente.query(
            `INSERT INTO posicoes_ativos
                (ativo_id, ambiente_id, x, y, atualizado_por)
             SELECT a.id, $1, $2, $3, NULL
             FROM ativos a
             WHERE a.excluido_em IS NULL AND a.setor_id = $4
             ON CONFLICT (ativo_id) DO NOTHING`,
            [ambiente.id, dados.centro_x, dados.centro_y, dados.setor_id]
        );
        await cliente.query("COMMIT");
        return ambiente;
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

async function removerAmbiente(id) {
    return transacao.executar(async cliente=>{
    const resultado = await cliente.query(
        `DELETE FROM ambientes_mapa WHERE id = $1 RETURNING id`,
        [id]
    );
    return resultado.rows[0];
    });
}

async function listarPosicoesAmbiente(ambienteId) {
    const resultado = await pool.query(
        `SELECT ativo_id, x::FLOAT AS x, y::FLOAT AS y
         FROM posicoes_ativos
         WHERE ambiente_id = $1`,
        [ambienteId]
    );
    return resultado.rows;
}

async function centralizarAtivos(
    ambienteId,
    ativoIds,
    centroX,
    centroY
) {
    return transacao.executar(async cliente=>{
    if (!ativoIds.length) return;
    await cliente.query(
        `UPDATE posicoes_ativos
         SET x = $2, y = $3, updated_at = NOW()
         WHERE ambiente_id = $1
           AND ativo_id = ANY($4::INTEGER[])`,
        [ambienteId, centroX, centroY, ativoIds]
    );
    });
}

async function listarAtivosDaPlanta(plantaId, usuario) {
    const resultado = await pool.query(
        `SELECT a.id, a.revisao, a.patrimonio, a.status, a.setor_id,
                t.nome AS tipo_nome, t.icone AS tipo_icone,
                c.nome AS categoria_nome, c.icone AS categoria_icone,
                s.nome AS setor_nome, sa.nome AS status_nome,
                COALESCE(sa.cor, '#64748b') AS status_cor,
                pa.ambiente_id, pa.x::FLOAT AS x, pa.y::FLOAT AS y,
                pa.updated_at AS posicao_atualizada_em
         FROM posicoes_ativos pa
         INNER JOIN ambientes_mapa am ON am.id = pa.ambiente_id
         INNER JOIN ativos a ON a.id = pa.ativo_id
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         LEFT JOIN status_ativos sa ON sa.codigo = a.status
         WHERE am.planta_id = $1 AND a.excluido_em IS NULL
           AND ($2 = 'admin' OR c.setor_id = $3)
         ORDER BY t.nome, a.patrimonio`,
        [plantaId, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows;
}

async function buscarAtivoParaMapa(ativoId, usuario, cliente = pool) {
    const resultado = await cliente.query(
        `SELECT a.id, a.revisao, a.patrimonio, a.tipo_ativo_id, a.setor_id, a.status,
                pa.ambiente_id, pa.x::FLOAT AS x, pa.y::FLOAT AS y,
                am.nome AS ambiente_nome
         FROM ativos a
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN posicoes_ativos pa ON pa.ativo_id = a.id
         LEFT JOIN ambientes_mapa am ON am.id = pa.ambiente_id
         WHERE a.excluido_em IS NULL AND a.id = $1
           AND ($2 = 'admin' OR c.setor_id = $3)`,
        [ativoId, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows[0];
}

async function atualizarPosicao(ativoId, ambienteId, x, y, usuarioId, cliente = pool) {
    const resultado = await cliente.query(
        `INSERT INTO posicoes_ativos
            (ativo_id, ambiente_id, x, y, atualizado_por, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (ativo_id) DO UPDATE
         SET ambiente_id = EXCLUDED.ambiente_id,
             x = EXCLUDED.x, y = EXCLUDED.y,
             atualizado_por = EXCLUDED.atualizado_por,
             updated_at = NOW()
         RETURNING ativo_id, ambiente_id, x::FLOAT AS x, y::FLOAT AS y,
                   updated_at`,
        [ativoId, ambienteId, x, y, usuarioId]
    );
    return resultado.rows[0];
}

async function atualizarPosicoesGrupo(ativos, ambiente, x, y, usuario, clienteExistente) {
    return transacao.executar(async cliente => {
        const ids = ativos.map((ativo) => ativo.ativo_id || ativo.id);
        await cliente.query(
            `SELECT id FROM ativos WHERE id = ANY($1::INTEGER[]) ORDER BY id FOR UPDATE`,
            [ids]
        );
        // A posição anterior é lida depois dos bloqueios, na mesma conexão.
        const anteriores = [];
        for (const id of ids) {
            const ativo = await buscarAtivoParaMapa(id, usuario, cliente);
            if (!ativo || Number(ativo.setor_id) !== Number(ambiente.setor_id)) {
                const erro = new Error("Ativo não encontrado ou setor alterado"); erro.status = 409; throw erro;
            }
            anteriores.push(ativo);
        }
        const resultado = await cliente.query(
            `INSERT INTO posicoes_ativos
                (ativo_id, ambiente_id, x, y, atualizado_por, updated_at)
             SELECT UNNEST($1::INTEGER[]), $2, $3, $4, $5, NOW()
             ON CONFLICT (ativo_id) DO UPDATE
             SET ambiente_id = EXCLUDED.ambiente_id,
                 x = EXCLUDED.x, y = EXCLUDED.y,
                 atualizado_por = EXCLUDED.atualizado_por,
                 updated_at = NOW()
             RETURNING ativo_id, ambiente_id, x::FLOAT AS x, y::FLOAT AS y,
                       updated_at`,
            [ids, ambiente.id, x, y, usuario.id]
        );
        for (const ativo of anteriores) {
            await cliente.query(
                `INSERT INTO historico_ativos (
                    ativo_id, patrimonio, tipo_ativo_id, usuario_id,
                    usuario_nome, acao, descricao, setor_anterior_id,
                    setor_novo_id, status_anterior, status_novo,
                    dados_anteriores, dados_novos, campos_alterados
                 ) VALUES ($1,$2,$3,$4,$5,'posicionamento_mapa',$6,$7,$7,$8,$8,$9,$10,$11)`,
                [ativo.ativo_id || ativo.id, ativo.patrimonio,
                    ativo.tipo_ativo_id, usuario.id, usuario.nome,
                    `Grupo posicionado em ${ambiente.nome}`, ativo.setor_id,
                    ativo.status,
                    JSON.stringify(ativo.ambiente_id ? { ambiente_id: ativo.ambiente_id, ambiente: ativo.ambiente_nome, x: ativo.x, y: ativo.y } : null),
                    JSON.stringify({ ambiente_id: ambiente.id, ambiente: ambiente.nome, x, y }),
                    JSON.stringify(["ambiente_mapa", "posicao_mapa"])]
            );
        }
        return resultado.rows;
    }, clienteExistente);
}

async function posicionarNoPadrao(ativoId, setorId, usuarioId) {
    return transacao.executar(async cliente=>{
    const resultado = await cliente.query(
        `WITH destino AS (
             SELECT am.id, am.centro_x, am.centro_y
             FROM ambientes_mapa am
             INNER JOIN plantas_baixas p ON p.id = am.planta_id
             WHERE am.setor_id = $2 AND p.ativo = TRUE
             ORDER BY am.padrao DESC, p.ordem, am.id
             LIMIT 1
         )
         INSERT INTO posicoes_ativos
             (ativo_id, ambiente_id, x, y, atualizado_por, updated_at)
         SELECT $1, id, centro_x, centro_y, $3, NOW()
         FROM destino
         ON CONFLICT (ativo_id) DO UPDATE
         SET ambiente_id = EXCLUDED.ambiente_id,
             x = EXCLUDED.x, y = EXCLUDED.y,
             atualizado_por = EXCLUDED.atualizado_por,
             updated_at = NOW()
         RETURNING ativo_id, ambiente_id, x::FLOAT AS x, y::FLOAT AS y`,
        [ativoId, setorId, usuarioId || null]
    );
    if (!resultado.rows[0]) {
        await cliente.query("DELETE FROM posicoes_ativos WHERE ativo_id = $1", [ativoId]);
    }
    return resultado.rows[0] || null;
    });
}

module.exports = {
    listarPlantas,
    buscarPlanta,
    criarPlanta,
    atualizarPlanta,
    removerPlanta,
    listarAmbientes,
    buscarAmbiente,
    salvarAmbiente,
    removerAmbiente,
    listarPosicoesAmbiente,
    centralizarAtivos,
    listarAtivosDaPlanta,
    buscarAtivoParaMapa,
    atualizarPosicao,
    atualizarPosicoesGrupo,
    posicionarNoPadrao
};
