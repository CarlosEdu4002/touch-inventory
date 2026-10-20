// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");

// =====================
// Consultas ao banco de dados
// =====================

// Função: Consulta no banco a lista de setores visível dentro do escopo informado.
async function listar(incluirInativos = false) {
    const resultado = await pool.query(
        `
        SELECT id, nome, ativo
        FROM setores
        WHERE ($1 = TRUE OR ativo = TRUE)
        ORDER BY nome
        `,
        [incluirInativos]
    );

    return resultado.rows;
}

// Função: Insere no banco um novo registro de setores com os dados já validados.
async function criar(nome) {
    const resultado = await pool.query(
        `INSERT INTO setores (nome)
         VALUES ($1)
         RETURNING id, nome, ativo`,
        [nome]
    );
    return resultado.rows[0];
}

// Função: Atualiza no banco o registro de setores identificado e devolve seus dados resultantes.
async function atualizar(id, nome, ativo) {
    const resultado = await pool.query(
        `UPDATE setores
         SET nome = $1, ativo = $2
         WHERE id = $3
         RETURNING id, nome, ativo`,
        [nome, ativo, id]
    );
    return resultado.rows[0];
}

// Função: Consulta no banco um registro de setores pela chave informada e respeita o escopo de acesso recebido.
async function buscarPorId(id, cliente = pool) {
    const resultado = await cliente.query(
        `
        SELECT id, nome
        FROM setores
        WHERE id = $1
          AND ativo = TRUE
          ${cliente===pool ? "" : "FOR SHARE"}
        `,
        [id]
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
    atualizar
};
