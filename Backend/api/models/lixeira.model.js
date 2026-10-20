const pool = require("../database/connection");

// Função: Consulta ou bloqueia pelo ID permanente, respeitando a categoria proprietária.
async function buscar(id, usuario, cliente = pool, bloquear = false) {
    const resultado = await cliente.query(
        `SELECT a.*, t.revisao AS tipo_revisao, t.nome AS tipo_nome, c.id AS categoria_id, c.nome AS categoria_nome,
                c.setor_id AS setor_proprietario_id, s.nome AS setor_nome,
                (a.recuperavel_ate > clock_timestamp()) AS pode_restaurar
         FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id
         JOIN categorias c ON c.id=t.categoria_id LEFT JOIN setores s ON s.id=a.setor_id
         WHERE a.id=$1 AND ($2='admin' OR c.setor_id=$3)
         ${bloquear ? "FOR UPDATE OF a FOR SHARE OF t,c" : ""}`,
        [id, usuario.perfil, usuario.setor_id]);
    return resultado.rows[0];
}

async function listar(usuario) {
    return (await pool.query(
        `SELECT a.id, a.revisao, a.patrimonio, a.tipo_ativo_id, t.nome AS tipo_nome, c.nome AS categoria_nome,
                a.excluido_em, a.recuperavel_ate, a.excluido_por_nome,
                (a.recuperavel_ate > clock_timestamp()) AS pode_restaurar
         FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
         WHERE a.excluido_em IS NOT NULL AND ($1='admin' OR c.setor_id=$2)
         ORDER BY a.recuperavel_ate, a.id`, [usuario.perfil, usuario.setor_id])).rows;
}

async function listarLog(usuario) {
    return (await pool.query(
        `SELECT l.* FROM log_exclusoes_ativos l LEFT JOIN categorias c ON c.id=l.categoria_id
         WHERE $1='admin' OR COALESCE(c.setor_id,l.setor_proprietario_id)=$2
         ORDER BY l.id DESC LIMIT 200`, [usuario.perfil, usuario.setor_id])).rows;
}

async function registrarLog(ativo, acao, usuario, cliente) {
    await cliente.query(
        `INSERT INTO log_exclusoes_ativos(ativo_id,patrimonio,tipo_ativo_id,tipo_nome,categoria_id,
            categoria_nome,setor_proprietario_id,usuario_id,usuario_nome,acao,excluido_em,recuperavel_ate)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [ativo.id, ativo.patrimonio, ativo.tipo_ativo_id, ativo.tipo_nome, ativo.categoria_id,
            ativo.categoria_nome, ativo.setor_proprietario_id, usuario?.id || null,
            usuario?.nome || "Rotina automática", acao, ativo.excluido_em, ativo.recuperavel_ate]);
}

async function temImpedimento(id, cliente) {
    return (await cliente.query(
        `SELECT EXISTS(SELECT 1 FROM grupos_ativos_membros WHERE ativo_id=$1) AS grupo,
                EXISTS(SELECT 1 FROM emprestimos_ativos WHERE ativo_id=$1 AND devolvido_em IS NULL) AS emprestimo`, [id])).rows[0];
}

async function excluir(id, usuario, cliente) {
    return (await cliente.query(
        `UPDATE ativos SET excluido_em=clock_timestamp(), recuperavel_ate=clock_timestamp()+INTERVAL '720 hours',
                excluido_por=$2, excluido_por_nome=$3, updated_at=NOW()
         WHERE id=$1 AND excluido_em IS NULL RETURNING *`, [id, usuario.id, usuario.nome])).rows[0];
}

async function restaurar(id, cliente) {
    return (await cliente.query(
        `UPDATE ativos SET excluido_em=NULL, recuperavel_ate=NULL, excluido_por=NULL,
                excluido_por_nome=NULL, updated_at=NOW()
         WHERE id=$1 AND excluido_em IS NOT NULL AND recuperavel_ate>clock_timestamp()
         RETURNING *`, [id])).rows[0];
}

async function validarPosicao(id, cliente) {
    await cliente.query(
        `DELETE FROM posicoes_ativos pa USING ativos a, ambientes_mapa am, plantas_baixas p
         WHERE pa.ativo_id=$1 AND a.id=pa.ativo_id AND am.id=pa.ambiente_id AND p.id=am.planta_id
           AND (am.setor_id<>a.setor_id OR p.ativo=FALSE)`, [id]);
    const posicao=await cliente.query(`SELECT pa.x::float AS x,pa.y::float AS y,am.poligono
        FROM posicoes_ativos pa JOIN ambientes_mapa am ON am.id=pa.ambiente_id WHERE pa.ativo_id=$1`,[id]);
    return posicao.rows[0];
}

async function removerPosicao(id,cliente) {await cliente.query("DELETE FROM posicoes_ativos WHERE ativo_id=$1",[id]);}

async function expirados(cliente) {
    return (await cliente.query(
        `SELECT a.*, t.nome AS tipo_nome, c.id AS categoria_id, c.nome AS categoria_nome,
                c.setor_id AS setor_proprietario_id
         FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
         WHERE a.excluido_em IS NOT NULL AND a.recuperavel_ate<=clock_timestamp()
         ORDER BY a.recuperavel_ate,a.id LIMIT 20 FOR UPDATE OF a SKIP LOCKED`)).rows;
}

async function arquivosChecklist(id, cliente) {
    return (await cliente.query(`SELECT jsonb_array_elements_text(imagens) AS arquivo
        FROM execucoes_checklist WHERE ativo_id=$1`, [id])).rows.map((item) => item.arquivo);
}

// Função: Apaga somente registros relacionados pelo ID; nunca pelo patrimônio reutilizável.
async function apagarExpirado(id, cliente) {
    const prazo = await cliente.query("SELECT id FROM ativos WHERE id=$1 AND excluido_em IS NOT NULL AND recuperavel_ate<=clock_timestamp() FOR UPDATE", [id]);
    if (!prazo.rows.length) return false;
    const impedimento = await temImpedimento(id, cliente);
    if (impedimento.grupo || impedimento.emprestimo) throw new Error("Ativo expirado com vínculo ou empréstimo pendente");
    for (const tabela of ["historico_ativos", "execucoes_checklist", "checklist_ocorrencias", "movimentacoes_chaves", "movimentacoes_ferramentas", "emprestimos_ativos"]) {
        await cliente.query(`DELETE FROM ${tabela} WHERE ativo_id=$1`, [id]);
    }
    await cliente.query("DELETE FROM ativos WHERE id=$1 AND excluido_em IS NOT NULL AND recuperavel_ate<=clock_timestamp()", [id]);
    return true;
}

module.exports = { buscar, listar, listarLog, registrarLog, temImpedimento, excluir, restaurar, validarPosicao, removerPosicao, expirados, arquivosChecklist, apagarExpirado };
