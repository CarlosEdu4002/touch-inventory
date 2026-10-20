// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");
const iconesModel = require("./icones.model");

// =====================
// Consultas ao banco de dados
// =====================

// Função: Consulta no banco a lista de categorias visível dentro do escopo informado.
async function listar(usuario) {
    const resultado = await pool.query(
        `
        SELECT c.id, c.nome, c.icone, c.setor_id, c.created_at,
               hi.usuario_nome AS icone_usuario_nome,
               hi.created_at AS icone_atualizado_em
        FROM categorias c
        LEFT JOIN LATERAL (
            SELECT usuario_nome, created_at
            FROM historico_icones
            WHERE entidade = 'categoria' AND registro_id = c.id
            ORDER BY id DESC
            LIMIT 1
        ) hi ON TRUE
        WHERE $1 = 'admin' OR c.setor_id = $2
        ORDER BY c.nome
        `,
        [usuario.perfil, usuario.setor_id]
    );

    return resultado.rows;
}

// Função: Consulta no banco um registro de categorias pela chave informada e respeita o escopo de acesso recebido.
async function buscarPorId(id, usuario) {
    const resultado = await pool.query(
        `
        SELECT c.id, c.nome, c.icone, c.setor_id, c.created_at,
               hi.usuario_nome AS icone_usuario_nome,
               hi.created_at AS icone_atualizado_em
        FROM categorias c
        LEFT JOIN LATERAL (
            SELECT usuario_nome, created_at
            FROM historico_icones
            WHERE entidade = 'categoria' AND registro_id = c.id
            ORDER BY id DESC
            LIMIT 1
        ) hi ON TRUE
        WHERE c.id = $1
          AND ($2 = 'admin' OR c.setor_id = $3)
        `,
        [id, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

// Função: Insere no banco um novo registro de categorias com os dados já validados.
async function criar(nome, icone, setorId, usuario) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const resultado = await cliente.query(
            `INSERT INTO categorias (nome, icone, setor_id)
             VALUES ($1, $2, $3)
             RETURNING id, nome, icone, setor_id, created_at`,
            [nome, icone, setorId]
        );
        const categoria = resultado.rows[0];
        await iconesModel.registrar(cliente, {
            entidade: "categoria",
            registro_id: categoria.id,
            registro_nome: categoria.nome,
            icone_anterior: null,
            icone_novo: categoria.icone,
            setor_id: categoria.setor_id,
            usuario
        });
        await cliente.query("COMMIT");
        return categoria;
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

// Função: Atualiza no banco o registro de categorias identificado e devolve seus dados resultantes.
async function atualizar(id, nome, icone, usuario) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const anterior = await cliente.query(
            `SELECT id, nome, icone, setor_id
             FROM categorias
             WHERE id = $1
               AND ($2 = 'admin' OR setor_id = $3)
             FOR UPDATE`,
            [id, usuario.perfil, usuario.setor_id]
        );
        if (!anterior.rows[0]) {
            await cliente.query("ROLLBACK");
            return null;
        }
        const resultado = await cliente.query(
            `UPDATE categorias
             SET nome = $1, icone = $2
             WHERE id = $3
             RETURNING id, nome, icone, setor_id, created_at`,
            [nome, icone, id]
        );
        const categoria = resultado.rows[0];
        await iconesModel.registrar(cliente, {
            entidade: "categoria",
            registro_id: categoria.id,
            registro_nome: categoria.nome,
            icone_anterior: anterior.rows[0].icone,
            icone_novo: categoria.icone,
            setor_id: categoria.setor_id,
            usuario
        });
        await cliente.query("COMMIT");
        return categoria;
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

// Função: Remove do banco o registro identificado de categorias e devolve o item afetado quando aplicável.
async function remover(id, usuario) {
    const resultado = await pool.query(
        `
        DELETE FROM categorias
        WHERE id = $1
          AND ($2 = 'admin' OR setor_id = $3)
        RETURNING id
        `,
        [id, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

// =====================
// Exportações
// =====================

module.exports = {
    listar,
    buscarPorId,
    criar,
    atualizar,
    remover
};
