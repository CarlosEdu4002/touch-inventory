// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");

// =====================
// Consultas ao banco de dados
// =====================

// Função: Consulta no banco um registro de vínculos NFC pela chave informada e respeita o escopo de acesso recebido.
async function buscarPorUid(uid, usuario) {
    const resultado = await pool.query(
        `SELECT n.uid, a.id AS ativo_id, a.patrimonio, t.id AS tipo_id, t.nome AS tipo_nome
         FROM tags_nfc n
         INNER JOIN ativos a ON a.id = n.ativo_id
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE n.uid = $1 AND a.excluido_em IS NULL
           AND ($2 = 'admin' OR c.setor_id = $3)`,
        [uid, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows[0];
}

// Função: Localiza o ativo pelo ID no esquema autorizado e associa seu UID NFC.
async function vincular(uid, ativoId, usuario) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const resultadoAtivo = await cliente.query(
            `SELECT a.id, a.id AS ativo_id, a.patrimonio, t.id AS tipo_id, t.nome AS tipo_nome
             FROM ativos a
             INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
             INNER JOIN categorias c ON c.id = t.categoria_id
             WHERE a.excluido_em IS NULL AND a.id = $1
               AND ($2 = 'admin' OR c.setor_id = $3)
             FOR UPDATE OF a FOR SHARE OF t, c`,
            [ativoId, usuario.perfil, usuario.setor_id]
        );
        const ativo = resultadoAtivo.rows[0];
        if (!ativo) {
            await cliente.query("ROLLBACK");
            return null;
        }

        // A unicidade serializa concorrentes mesmo quando o UID ainda não existe.
        // Nunca apagar ou substituir uma associação para resolver um conflito.
        const inserido = await cliente.query(
            `INSERT INTO tags_nfc (uid, ativo_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING RETURNING uid`,
            [uid, ativo.id]
        );
        if (!inserido.rows.length) {
            const atual = await cliente.query(
                "SELECT ativo_id FROM tags_nfc WHERE uid = $1 FOR UPDATE",
                [uid]
            );
            if (Number(atual.rows[0]?.ativo_id) !== Number(ativo.id)) {
                const erro = new Error("Etiqueta ou ativo já possui outro vínculo NFC");
                erro.status = 409;
                throw erro;
            }
        }
        await cliente.query("COMMIT");
        return { uid, ...ativo };
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

// =====================
// Exportações
// =====================

module.exports = { buscarPorUid, vincular };
