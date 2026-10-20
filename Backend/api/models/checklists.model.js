const pool = require("../database/connection");

function somenteData(valor) {
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor || "").slice(0, 10);
}

async function listar(usuario) {
    const resultado = await pool.query(
        `SELECT a.id AS ativo_id, a.patrimonio, a.status,
                o.vencimento AS checklist_proxima_data, o.id AS ocorrencia_id, m.id AS modelo_id, m.versao, m.perguntas, a.setor_id,
                t.id AS tipo_ativo_id, t.nome AS tipo_nome,
                t.checklist_intervalo_meses, t.checklist_alerta_dias,
                t.checklist_recorrencia, t.checklist_datas_personalizadas,
                t.checklist_modo, t.checklist_itens,
                c.nome AS categoria_nome, s.nome AS setor_nome,
                CASE
                    WHEN a.checklist_proxima_data < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date THEN 'vencido'
                    WHEN a.checklist_proxima_data <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date + t.checklist_alerta_dias THEN 'proximo'
                    ELSE 'em_dia'
                END AS situacao,
                ultima.resultado AS ultimo_resultado,
                ultima.executado_em AS ultima_execucao
         FROM ativos a
         JOIN checklist_ocorrencias o ON o.ativo_id=a.id AND o.situacao='pendente'
         JOIN checklist_modelos m ON m.id=o.modelo_id
         INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         LEFT JOIN setores s ON s.id = a.setor_id
         LEFT JOIN LATERAL (
             SELECT resultado, executado_em
             FROM execucoes_checklist ec
             WHERE ec.ativo_id = a.id
             ORDER BY ec.id DESC LIMIT 1
         ) ultima ON TRUE
         WHERE a.excluido_em IS NULL AND TRUE
           AND a.checklist_proxima_data IS NOT NULL
           AND ($1 = 'admin' OR c.setor_id = $2)
         ORDER BY
             CASE WHEN a.checklist_proxima_data < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date THEN 0
                  WHEN a.checklist_proxima_data <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date + t.checklist_alerta_dias THEN 1
                  ELSE 2 END,
             o.vencimento, a.patrimonio`,
        [usuario.perfil, usuario.setor_id]
    );
    return resultado.rows;
}

async function buscarAtivo(tipo, patrimonio, usuario) {
    const encontrado=await require("./ativos.model").buscarTipoPorNome(String(tipo),usuario);
    if (!encontrado) return null;
    tipo=String(encontrado.id);
    const resultado = await pool.query(
        `SELECT a.id, a.patrimonio, a.status, a.setor_id,
                o.vencimento AS checklist_proxima_data, o.id AS ocorrencia_id, m.id AS modelo_id, m.versao, m.perguntas, t.id AS tipo_ativo_id,
                t.nome AS tipo_nome, t.permite_checklist,
                t.checklist_intervalo_meses, t.checklist_alerta_dias,
                t.checklist_recorrencia, t.checklist_datas_personalizadas,
                t.checklist_modo, t.checklist_itens,
                s.nome AS setor_nome
         FROM ativos a
         LEFT JOIN checklist_ocorrencias o ON o.ativo_id=a.id AND o.situacao='pendente'
         LEFT JOIN checklist_modelos m ON m.id=o.modelo_id
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

async function historico(ativoId, usuario) {
    const resultado = await pool.query(
        `SELECT ec.id, ec.data_prevista, ec.executado_em, ec.resultado,
                ec.observacao, ec.respostas, ec.proxima_data, ec.imagens,
                ec.usuario_nome, ec.ocorrencia_id, o.modelo_id, m.versao, (ec.ocorrencia_id IS NULL) AS legado
         FROM execucoes_checklist ec
         LEFT JOIN checklist_ocorrencias o ON o.id=ec.ocorrencia_id
         LEFT JOIN checklist_modelos m ON m.id=o.modelo_id
         INNER JOIN tipos_ativo t ON t.id = ec.tipo_ativo_id
         INNER JOIN categorias c ON c.id = t.categoria_id
         WHERE ec.ativo_id = $1
           AND ($2 = 'admin' OR c.setor_id = $3)
         ORDER BY ec.id DESC`,
        [ativoId, usuario.perfil, usuario.setor_id]
    );
    return resultado.rows;
}

function ocorrenciaConcluida() {
    const erro = new Error("Consulte os registros respondidos na data solicitada!");
    erro.status = 409;
    erro.codigo = "OCORRENCIA_CONCLUIDA";
    return erro;
}

async function situacaoOcorrencia(ativoId, ocorrenciaId) {
    const resultado = await pool.query(
        "SELECT situacao FROM checklist_ocorrencias WHERE id=$1 AND ativo_id=$2",
        [ocorrenciaId, ativoId]
    );
    return resultado.rows[0]?.situacao || null;
}

async function registrar(ativo, dados, usuario) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const atual=await cliente.query(`SELECT a.*,t.*,o.vencimento,o.modelo_id,o.situacao,o.referencia,o.agenda_reconfigurada_em
            FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
            JOIN checklist_ocorrencias o ON o.ativo_id=a.id
            WHERE a.id=$1 AND o.id=$2 AND a.excluido_em IS NULL AND ($3='admin' OR c.setor_id=$4)
            FOR UPDATE OF a,o FOR SHARE OF t,c`,[ativo.id,dados.body?.ocorrencia_id,usuario.perfil,usuario.setor_id]);
        const registro=atual.rows[0];
        if (registro?.situacao === "concluida") throw ocorrenciaConcluida();
        if(!registro || String(registro.modelo_id)!==String(dados.body?.modelo_id)) {
            const erro=new Error("Esta ocorrência não está disponível para resposta."); erro.status=409;throw erro;
        }
        ativo.setor_id=registro.setor_id;ativo.status=registro.status;
        const dataPrevista=registro.vencimento;
        if (registro.checklist_recorrencia==='personalizado') {
            const atendidas=await cliente.query("SELECT vencimento FROM checklist_ocorrencias WHERE ativo_id=$1 AND situacao='concluida'",[ativo.id]);
            const datas=new Set(atendidas.rows.map(o=>somenteData(o.vencimento)));
            registro.checklist_datas_personalizadas=(registro.checklist_datas_personalizadas||[]).filter(d=>!datas.has(somenteData(d)));
        }
        dados.proxima_data=registro.permite_checklist ? require("../services/checklists.service").proximaData({...registro,checklist_proxima_data:somenteData(registro.agenda_reconfigurada_em)>somenteData(dataPrevista)?somenteData(registro.agenda_reconfigurada_em):somenteData(dataPrevista),checklist_referencia:registro.referencia}) : null;
        const execucao = await cliente.query(
            `INSERT INTO execucoes_checklist (
                ativo_id, patrimonio, tipo_ativo_id, data_prevista,
                resultado, observacao, respostas, proxima_data,
                usuario_id, usuario_nome, ocorrencia_id, chave_reenvio, pedido, imagens
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [ativo.id, ativo.patrimonio, ativo.tipo_ativo_id, dataPrevista,
                dados.resultado, dados.observacao || null,
                JSON.stringify(dados.respostas), dados.proxima_data,
                usuario.id, usuario.nome, dados.body.ocorrencia_id, null, JSON.stringify(dados.body), JSON.stringify(dados.arquivos || [])]
        );
        for (const nome of dados.arquivos || []) await require("../services/imagens.service").confirmar(nome, cliente);
        await cliente.query("UPDATE checklist_ocorrencias SET situacao='concluida' WHERE id=$1",[dados.body.ocorrencia_id]);
        await cliente.query(
            `UPDATE ativos SET checklist_proxima_data = $2, updated_at = NOW()
             WHERE id = $1`,
            [ativo.id, dados.proxima_data]
        );
        await cliente.query(
            `INSERT INTO historico_ativos (
                ativo_id, patrimonio, tipo_ativo_id, usuario_id,
                usuario_nome, acao, descricao, setor_anterior_id,
                setor_novo_id, status_anterior, status_novo,
                dados_anteriores, dados_novos, campos_alterados
             ) VALUES ($1,$2,$3,$4,$5,'checklist',$6,$7,$7,$8,$8,$9,$10,$11)`,
            [ativo.id, ativo.patrimonio, ativo.tipo_ativo_id,
                usuario.id, usuario.nome,
                `Checklist ${dados.resultado === "conforme" ? "conforme" : "com não conformidade"}`,
                ativo.setor_id, ativo.status,
                JSON.stringify({ data_prevista: dataPrevista }),
                JSON.stringify({ resultado: dados.resultado, proxima_data: dados.proxima_data, ocorrencia_id:dados.body.ocorrencia_id,modelo_id:dados.body.modelo_id,respostas:dados.respostas }),
                JSON.stringify(["checklist_proxima_data"])]
        );
        await cliente.query("COMMIT");
        return execucao.rows[0];
    } catch (erro) {
        await cliente.query("ROLLBACK");
        if(erro.code==="23505" && erro.constraint==="checklist_execucao_unica") erro=ocorrenciaConcluida();
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

async function alteracoesAgenda(ativoId,usuario) {
    return (await pool.query(`SELECT aa.* FROM checklist_agenda_alteracoes aa
        JOIN checklist_ocorrencias o ON o.id=aa.ocorrencia_id JOIN ativos a ON a.id=o.ativo_id
        JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
        WHERE a.id=$1 AND ($2='admin' OR c.setor_id=$3) ORDER BY aa.id`,[ativoId,usuario.perfil,usuario.setor_id])).rows;
}
async function imagemPermitida(execucaoId, nome, usuario) {
    const resultado = await pool.query(`SELECT 1 FROM execucoes_checklist ec
        JOIN ativos a ON a.id=ec.ativo_id
        JOIN tipos_ativo t ON t.id=a.tipo_ativo_id
        JOIN categorias c ON c.id=t.categoria_id
        WHERE ec.id=$1 AND ec.imagens ? $2 AND a.excluido_em IS NULL
          AND ($3='admin' OR c.setor_id=$4)`,
    [execucaoId,nome,usuario.perfil,usuario.setor_id]);
    return resultado.rows.length > 0;
}
module.exports = { listar, buscarAtivo, historico, registrar, situacaoOcorrencia, ocorrenciaConcluida, alteracoesAgenda, imagemPermitida };
