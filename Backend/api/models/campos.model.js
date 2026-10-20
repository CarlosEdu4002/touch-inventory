// =====================
// Dependências e configurações
// =====================

const pool = require("../database/connection");

const COLUNAS = `
    id, revisao, tipo_ativo_id, nome, label, tipo, opcoes,
    obrigatorio, editavel, visivel, ordem, created_at
`;

// =====================
// Consultas ao banco de dados
// =====================

// Função: Consulta no banco os campos dinâmicos associados ao filtro informado e respeita o escopo do usuário.
async function listarPorTipo(tipoAtivoId, cliente = pool) {
    const resultado = await cliente.query(
        `SELECT ${COLUNAS}
         FROM campos
         WHERE tipo_ativo_id = $1
         ORDER BY ordem, id`,
        [tipoAtivoId]
    );

    return resultado.rows;
}

// Função: Consulta no banco um registro de campos dinâmicos pela chave informada e respeita o escopo de acesso recebido.
async function buscarPorId(id) {
    const resultado = await pool.query(
        `SELECT ${COLUNAS} FROM campos WHERE id = $1`,
        [id]
    );

    return resultado.rows[0];
}

// Função: Insere no banco um novo registro de campos dinâmicos com os dados já validados.
async function criar(dados,usuario) {
    return require("../database/transacao").executar(async cliente=>{
    await conferirTipo(cliente,dados.tipo_ativo_id,usuario);
    const resultado = await cliente.query(
        `INSERT INTO campos (
            tipo_ativo_id, nome, label, tipo,
            opcoes, obrigatorio, editavel, visivel, ordem
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${COLUNAS}`,
        [
            dados.tipo_ativo_id,
            dados.nome,
            dados.label,
            dados.tipo,
            JSON.stringify(dados.opcoes),
            dados.obrigatorio,
            dados.editavel,
            dados.visivel,
            dados.ordem
        ]
    );

    return resultado.rows[0];
    });
}

// Função: Atualiza no banco o registro de campos dinâmicos identificado e devolve seus dados resultantes.
async function atualizar(id, dados,usuario) {
    return require("../database/transacao").executar(async cliente=>{
    const atual=(await cliente.query("SELECT * FROM campos WHERE id=$1 FOR UPDATE",[id])).rows[0];
    require("../database/concorrencia").conferir(dados.revisao,atual?.revisao);
    await conferirTipo(cliente,atual.tipo_ativo_id,usuario);
    await conferirTipo(cliente,dados.tipo_ativo_id,usuario);
    const resultado = await cliente.query(
        `UPDATE campos
         SET tipo_ativo_id = $1,
             nome = $2,
             label = $3,
             tipo = $4,
             opcoes = $5,
             obrigatorio = $6,
             editavel = $7,
             visivel = $8,
             ordem = $9
         WHERE id = $10
         RETURNING ${COLUNAS}`,
        [
            dados.tipo_ativo_id,
            dados.nome,
            dados.label,
            dados.tipo,
            JSON.stringify(dados.opcoes),
            dados.obrigatorio,
            dados.editavel,
            dados.visivel,
            dados.ordem,
            id
        ]
    );

    return resultado.rows[0];
    });
}

// Função: Remove do banco o registro identificado de campos dinâmicos e devolve o item afetado quando aplicável.
async function remover(id,usuario,revisao) {
    return require("../database/transacao").executar(async cliente=>{
    const atual=(await cliente.query("SELECT * FROM campos WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if(!atual) return null;
    require("../database/concorrencia").conferir(revisao,atual.revisao);
    await conferirTipo(cliente,atual.tipo_ativo_id,usuario);
    const resultado = await cliente.query(
        "DELETE FROM campos WHERE id = $1 RETURNING id",
        [id]
    );

    return resultado.rows[0];
    });
}

// Função: Verifica no banco se o tipo de ativo informado existe.
async function tipoAtivoExiste(id) {
    const resultado = await pool.query(
        "SELECT id FROM tipos_ativo WHERE id = $1",
        [id]
    );

    return Boolean(resultado.rows[0]);
}

// =====================
// Exportações
// =====================

module.exports = {
    listarPorTipo,
    buscarPorId,
    criar,
    atualizar,
    remover,
    tipoAtivoExiste
};

async function conferirTipo(cliente,id,usuario) {
    const r=await cliente.query("SELECT t.id FROM tipos_ativo t JOIN categorias c ON c.id=t.categoria_id WHERE t.id=$1 AND ($2='admin' OR c.setor_id=$3) FOR SHARE OF t,c",[id,usuario?.perfil,usuario?.setor_id]);
    if(!r.rows.length) {const e=new Error("Tipo não encontrado ou sem permissão");e.status=404;throw e;}
}
