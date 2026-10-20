// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");

// =====================
// Consultas ao banco de dados
// =====================

// Função: Insere no banco um evento de histórico com estados anterior e novo, autor e contexto da operação.
async function registrar(evento, cliente) {
    if (!cliente || cliente === pool) {
        throw new Error("O histórico exige a conexão da transação da alteração");
    }
    await cliente.query(
        `INSERT INTO historico_ativos (
            ativo_id, patrimonio, tipo_ativo_id, usuario_id,
            usuario_nome, acao, descricao, setor_anterior_id,
            setor_novo_id, status_anterior, status_novo,
            dados_anteriores, dados_novos, campos_alterados
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14
         )`,
        [
            evento.ativo_id,
            evento.patrimonio,
            evento.tipo_ativo_id,
            evento.usuario_id,
            evento.usuario_nome,
            evento.acao,
            evento.descricao || null,
            evento.setor_anterior_id || null,
            evento.setor_novo_id || null,
            evento.status_anterior || null,
            evento.status_novo || null,
            evento.dados_anteriores || null,
            evento.dados_novos || null,
            JSON.stringify(evento.campos_alterados || [])
        ]
    );
}

// Função: Consulta no banco os registros de histórico associados ao filtro informado e respeita o escopo do usuário.
async function listarPorAtivo(tipoId, patrimonio, usuario, ativoId = null) {
    const resultado = await pool.query(
        `SELECT
            h.id, h.acao, h.descricao, h.usuario_nome,
            h.status_anterior, h.status_novo,
            h.dados_anteriores, h.dados_novos,
            h.campos_alterados, h.created_at,
            sa.nome AS setor_anterior,
            sn.nome AS setor_novo,
            sta.nome AS status_anterior_nome,
            stn.nome AS status_novo_nome
         FROM historico_ativos h
         LEFT JOIN setores sa ON sa.id = h.setor_anterior_id
         LEFT JOIN setores sn ON sn.id = h.setor_novo_id
         LEFT JOIN status_ativos sta ON sta.codigo = h.status_anterior
         LEFT JOIN status_ativos stn ON stn.codigo = h.status_novo
         LEFT JOIN tipos_ativo t ON t.id = h.tipo_ativo_id
         LEFT JOIN categorias c ON c.id = t.categoria_id
         WHERE h.tipo_ativo_id = $1
           AND (($5::INTEGER IS NOT NULL AND h.ativo_id=$5) OR ($5::INTEGER IS NULL AND h.patrimonio=$2))
           AND (
               $3 = 'admin'
               OR c.setor_id = $4
           )
         ORDER BY h.created_at DESC`,
        [tipoId, patrimonio, usuario.perfil, usuario.setor_id, ativoId]
    );
    return resultado.rows;
}

// =====================
// Exportações
// =====================

module.exports = { registrar, listarPorAtivo };
