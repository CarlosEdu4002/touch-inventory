const pool = require("../database/connection");
const transacao = require("../database/transacao");
const imagens = require("../services/imagens.service");

// =====================
// Consultas de ativos
// =====================

// Função: Resolve o nome ou identificador recebido para obter o tipo de ativo e sua categoria.
async function buscarTipoPorNome(tipo, usuario, cliente = pool) {
    const resultado = await cliente.query(
        `
        SELECT t.id, t.revisao
        FROM tipos_ativo t
        JOIN categorias c ON c.id = t.categoria_id
        WHERE CASE WHEN $1 ~ '^[0-9]+$' THEN t.id::TEXT=$1 ELSE LOWER(t.nome)=LOWER($1) END
          AND ($2 = 'admin' OR c.setor_id = $3)
        `,
        [tipo, usuario?.perfil, usuario?.setor_id]
    );

    if (resultado.rows.length > 1) {
        const erro = new Error("Nome de tipo ambíguo. Informe o ID do tipo"); erro.status=409; throw erro;
    }
    return resultado.rows[0];
}

// Função: Consulta no banco os ativos associados ao filtro informado e respeita o escopo do usuário.
async function listarPorTipo(tipo, usuario) {
    const tipoEncontrado=await buscarTipoPorNome(String(tipo),usuario);
    if (!tipoEncontrado) return [];
    tipo=String(tipoEncontrado.id);
    const resultado = await pool.query(
        `
        SELECT
            a.id,
            a.tipo_ativo_id,
            a.patrimonio,
            a.dados,
            a.setor_id,
            a.status,
            a.imagem,
            a.checklist_proxima_data,
            a.updated_at, a.revisao, t.revisao AS tipo_revisao,
            s.nome AS setor_nome
        FROM ativos a
        INNER JOIN tipos_ativo t
            ON t.id = a.tipo_ativo_id
        INNER JOIN categorias c
            ON c.id = t.categoria_id
        LEFT JOIN setores s ON s.id = a.setor_id
        WHERE a.excluido_em IS NULL AND t.id::TEXT=$1
          AND ($2 = 'admin' OR c.setor_id = $3)
        ORDER BY a.patrimonio
        `,
        [tipo, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows;
}

// Função: Consulta no banco um registro de ativos pela chave informada e respeita o escopo de acesso recebido.
async function buscarPorPatrimonio(tipo, patrimonio, usuario, cliente = pool, bloquear = false) {
    const tipoEncontrado=await buscarTipoPorNome(String(tipo),usuario,cliente);
    if (!tipoEncontrado) return null;
    tipo=String(tipoEncontrado.id);
    if (bloquear) {
        await cliente.query(
            `SELECT a.id FROM ativos a
             JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
             WHERE a.excluido_em IS NULL AND t.id::TEXT=$1 AND a.patrimonio=$2
               AND ($3='admin' OR c.setor_id=$4)
             FOR UPDATE OF a FOR SHARE OF t,c`,
            [tipo, patrimonio, usuario.perfil, usuario.setor_id]);
    }
    // Leitura nova após esperar pelo bloqueio, inclusive quando outro request atualizou o ativo.
    const resultado = await cliente.query(
        `
        SELECT
            a.id,
            a.tipo_ativo_id,
            a.patrimonio,
            a.dados,
            a.setor_id,
            a.status,
            a.imagem,
            a.checklist_proxima_data,
            a.updated_at, a.revisao, t.revisao AS tipo_revisao,
            s.nome AS setor_nome, contexto_grupo.grupo_esperado
        FROM ativos a
        INNER JOIN tipos_ativo t
            ON t.id = a.tipo_ativo_id
        INNER JOIN categorias c
            ON c.id = t.categoria_id
        LEFT JOIN setores s ON s.id = a.setor_id
        LEFT JOIN LATERAL (
            SELECT json_build_object('id',g.id,'revisao',g.revisao) AS grupo_esperado
            FROM grupos_ativos_membros gm JOIN grupos_ativos g ON g.id=gm.grupo_id
            WHERE gm.ativo_id=a.id
        ) contexto_grupo ON TRUE
        WHERE a.excluido_em IS NULL AND t.id::TEXT=$1
          AND a.patrimonio = $2
          AND ($3 = 'admin' OR c.setor_id = $4)
        `,
        [tipo, patrimonio, usuario.perfil, usuario.setor_id]
    );

    return resultado.rows[0];
}

// Função: Posiciona o ativo no ambiente padrão do setor ou remove uma posição que deixou de ser válida.
async function posicionarNoSetor(
    cliente,
    ativoId,
    setorId,
    usuarioId = null
) {
    const posicao = await cliente.query(
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
         RETURNING ativo_id`,
        [ativoId, setorId, usuarioId]
    );

    if (!posicao.rows[0]) {
        await cliente.query(
            "DELETE FROM posicoes_ativos WHERE ativo_id = $1",
            [ativoId]
        );
    }
}

// Grupo primeiro, depois ativos em ordem: evita snapshots antigos e ordens inversas.
async function bloquearContexto(tipo, patrimonio, usuario, cliente) {
    const inicial = await buscarPorPatrimonio(tipo, patrimonio, usuario, cliente);
    if (!inicial) return null;
    const vinculo = await cliente.query("SELECT grupo_id FROM grupos_ativos_membros WHERE ativo_id=$1", [inicial.id]);
    const grupoId = vinculo.rows[0]?.grupo_id || null;
    if (grupoId) {
        await cliente.query("SELECT id FROM grupos_ativos WHERE id=$1 FOR UPDATE", [grupoId]);
        const membros = await cliente.query("SELECT ativo_id FROM grupos_ativos_membros WHERE grupo_id=$1 ORDER BY ativo_id", [grupoId]);
        const bloqueados = await cliente.query(
            `SELECT a.id FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id
             JOIN categorias c ON c.id=t.categoria_id
             WHERE a.id=ANY($1::INTEGER[]) AND ($2='admin' OR c.setor_id=$3)
             ORDER BY a.id FOR UPDATE OF a FOR SHARE OF t,c`,
            [membros.rows.map(m => m.ativo_id), usuario.perfil, usuario.setor_id]);
        if (bloqueados.rows.length !== membros.rows.length) {
            const erro = new Error("Ativo não encontrado ou sem permissão"); erro.status = 404; throw erro;
        }
    } else {
        await buscarPorPatrimonio(tipo, patrimonio, usuario, cliente, true);
    }
    const existeAtual=await cliente.query("SELECT id FROM ativos WHERE id=$1 AND excluido_em IS NULL",[inicial.id]);
    if (!existeAtual.rows.length) return null;
    const atual = await cliente.query("SELECT grupo_id FROM grupos_ativos_membros WHERE ativo_id=$1", [inicial.id]);
    if ((atual.rows[0]?.grupo_id || null) !== grupoId) {
        const erro = new Error("O vínculo do ativo mudou. Repita a operação"); erro.status = 409; throw erro;
    }
    return buscarPorPatrimonio(tipo, patrimonio, usuario, cliente);
}

async function bloquearPorId(id, usuario, cliente) {
    const resultado = await cliente.query(
        `SELECT a.tipo_ativo_id, a.patrimonio FROM ativos a
         JOIN tipos_ativo t ON t.id=a.tipo_ativo_id JOIN categorias c ON c.id=t.categoria_id
         WHERE a.id=$1 AND a.excluido_em IS NULL AND ($2='admin' OR c.setor_id=$3)`, [id, usuario.perfil, usuario.setor_id]);
    if (!resultado.rows[0]) return null;
    const ativo=await bloquearContexto(String(resultado.rows[0].tipo_ativo_id), resultado.rows[0].patrimonio, usuario, cliente);
    return ativo?.id===Number(id) ? ativo : null;
}

// Função: Insere o ativo e sua posição inicial dentro de uma única transação.
async function criar(
    tipoId,
    setorId,
    patrimonio,
    status,
    dados,
    usuarioId = null,
    usuario,
    clienteExistente
) {
    return transacao.executar(async cliente => {
        // Mantém a categoria proprietária estável até o INSERT e o COMMIT.
        const permissao = await cliente.query(
            `SELECT t.id FROM tipos_ativo t
             JOIN categorias c ON c.id = t.categoria_id
             WHERE t.id = $1 AND ($2 = 'admin' OR c.setor_id = $3)
             FOR SHARE OF t, c`,
            [tipoId, usuario?.perfil, usuario?.setor_id]
        );
        if (!permissao.rows.length) {
            const erro = new Error("Tipo não encontrado ou sem permissão");
            erro.status = 404;
            throw erro;
        }
        const reservado=await cliente.query("SELECT recuperavel_ate FROM ativos WHERE patrimonio=$1 AND excluido_em IS NOT NULL",[patrimonio]);
        if (reservado.rows.length) {
            const erro=new Error("Patrimônio reservado na lixeira até a conclusão da limpeza automática. Não é possível antecipar a exclusão.");
            erro.status=409; throw erro;
        }
        const resultado = await cliente.query(
            `INSERT INTO ativos (
                tipo_ativo_id, setor_id, patrimonio, status, dados,
                checklist_proxima_data
             ) VALUES (
                $1, $2, $3, $4, $5,
                (SELECT CASE WHEN permite_checklist
                    THEN CASE
                        WHEN checklist_recorrencia = 'personalizado' THEN (
                            SELECT MIN(data_agendada::DATE)
                            FROM JSONB_ARRAY_ELEMENTS_TEXT(checklist_datas_personalizadas) AS agenda(data_agendada)
                            WHERE data_agendada::DATE >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date
                        )
                        WHEN checklist_recorrencia = 'semanal' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date + 7
                        ELSE ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Cuiaba')::date + (checklist_intervalo_meses::TEXT || ' months')::INTERVAL)::DATE
                    END
                    ELSE NULL END
                 FROM tipos_ativo WHERE id = $1)
             )
             RETURNING id, tipo_ativo_id, setor_id, patrimonio, status, dados,
                       checklist_proxima_data`,
            [tipoId, setorId, patrimonio, status, dados]
        );
        const ativo = resultado.rows[0];
        await posicionarNoSetor(
            cliente,
            ativo.id,
            ativo.setor_id,
            usuarioId
        );
        return ativo;
    }, clienteExistente);
}

// Função: Atualiza somente o nome do arquivo de imagem associado ao ativo indicado.
async function atualizar(
    tipoId,
    setorId,
    patrimonioAtual,
    novoPatrimonio,
    status,
    dados,
    usuario,
    clienteExistente
) {
    return transacao.executar(async cliente => {
        const resultado = await cliente.query(
            `WITH anterior AS (
                 SELECT id, setor_id
                 FROM ativos
                 WHERE patrimonio = $5 AND tipo_ativo_id = $6
                 FOR UPDATE
             )
             UPDATE ativos
             SET patrimonio = $1,
                 dados = $2,
                 setor_id = $3,
                 status = $4,
                 updated_at = NOW()
             FROM anterior
             WHERE ativos.id = anterior.id
               AND (
                   (ativos.status <> 'emprestado' AND $4 <> 'emprestado')
                   OR (ativos.status = 'emprestado' AND $4 = 'emprestado')
               )
               AND (
                   $7 = 'admin'
                   OR EXISTS (
                       SELECT 1
                       FROM tipos_ativo t
                       INNER JOIN categorias c ON c.id = t.categoria_id
                       WHERE t.id = ativos.tipo_ativo_id
                         AND c.setor_id = $8
                   )
               )
             RETURNING ativos.id, ativos.tipo_ativo_id, ativos.setor_id,
                       ativos.patrimonio, ativos.status, ativos.dados,
                       anterior.setor_id AS setor_anterior_id`,
            [
                novoPatrimonio,
                dados,
                setorId,
                status,
                patrimonioAtual,
                tipoId,
                usuario.perfil,
                usuario.setor_id
            ]
        );
        const ativo = resultado.rows[0];

        if (
            ativo &&
            Number(ativo.setor_anterior_id) !== Number(ativo.setor_id)
        ) {
            await posicionarNoSetor(
                cliente,
                ativo.id,
                ativo.setor_id,
                usuario.id
            );
        }

        return ativo;
    }, clienteExistente);
}

// Função: Atualiza no banco o registro de ativos identificado e devolve seus dados resultantes.
async function atualizarImagem(id, imagem, cliente) {
    if (!cliente || cliente === pool) throw new Error("Imagem exige a conexão da alteração");
    if (imagem) await imagens.confirmar(imagem, cliente);
    const resultado = await cliente.query(
        `UPDATE ativos
         SET imagem = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING imagem`,
        [imagem, id]
    );
    return resultado.rows[0];
}

// Função: Atualiza no banco o setor responsável pelo ativo transferido.
async function transferir(id, novoSetorId, usuario, clienteExistente) {
    return transacao.executar(async cliente => {
        const resultado = await cliente.query(
            `UPDATE ativos
             SET setor_id = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id, tipo_ativo_id, setor_id, patrimonio, status, dados`,
            [novoSetorId, id]
        );
        const ativo = resultado.rows[0];

        await posicionarNoSetor(cliente, id, novoSetorId, usuario?.id);

        return ativo;
    }, clienteExistente);
}

async function transferirGrupo(ids, novoSetorId, usuario, observacao, clienteExistente) {
    return transacao.executar(async cliente => {
        const anteriores = await cliente.query(
            `SELECT id, tipo_ativo_id, setor_id, patrimonio, status, dados
             FROM ativos WHERE id = ANY($1::INTEGER[]) ORDER BY id FOR UPDATE`,
            [ids]
        );
        await cliente.query(
            `UPDATE ativos SET setor_id = $2, updated_at = NOW()
             WHERE id = ANY($1::INTEGER[])`,
            [ids, novoSetorId]
        );
        for (const ativo of anteriores.rows) {
            await posicionarNoSetor(cliente, ativo.id, novoSetorId, usuario.id);
            await cliente.query(
                `INSERT INTO historico_ativos (
                    ativo_id, patrimonio, tipo_ativo_id, usuario_id,
                    usuario_nome, acao, descricao, setor_anterior_id,
                    setor_novo_id, status_anterior, status_novo,
                    dados_anteriores, dados_novos, campos_alterados
                 ) VALUES ($1,$2,$3,$4,$5,'transferencia',$6,$7,$8,$9,$9,$10,$11,$12)`,
                [ativo.id, ativo.patrimonio, ativo.tipo_ativo_id,
                    usuario.id, usuario.nome,
                    observacao || "Transferência conjunta de grupo",
                    ativo.setor_id, novoSetorId, ativo.status,
                    JSON.stringify({ patrimonio: ativo.patrimonio, setor_id: ativo.setor_id, status: ativo.status, ...ativo.dados }),
                    JSON.stringify({ patrimonio: ativo.patrimonio, setor_id: novoSetorId, status: ativo.status, ...ativo.dados }),
                    JSON.stringify(["setor_id"])]
            );
        }
        return anteriores.rows;
    }, clienteExistente);
}

// Função: Executa de forma transacional a retirada ou devolução de qualquer ativo.
async function movimentarAtivoLido(tipo, patrimonio, usuario, dados, tipoMovimentacao) {
    const tipoEncontrado=await buscarTipoPorNome(String(tipo),usuario);
    if (!tipoEncontrado) { const erro=new Error("Ativo não encontrado"); erro.status=404; throw erro; }
    tipo=String(tipoEncontrado.id);
    const ferramenta = tipoMovimentacao === "ferramentas";
    const chave = tipoMovimentacao === "chaves";
    const nomeAtivo = ferramenta ? "ferramenta" : chave ? "chave" : "ativo";
    const artigo = tipoMovimentacao ? "A" : "O";
    const nomeTipo = ferramenta ? "Ferramentas" : "Chaves";
    const tabelaMovimentacao = ferramenta
        ? "movimentacoes_ferramentas"
        : chave ? "movimentacoes_chaves" : null;
    const cliente = await pool.connect();

    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const resultado = await cliente.query(
            `SELECT a.id, a.revisao, a.tipo_ativo_id, a.patrimonio, a.dados,
                    a.setor_id, a.status, t.nome AS tipo_nome,
                    t.permite_emprestimo, c.nome AS categoria_nome
             FROM ativos a
             INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
             INNER JOIN categorias c ON c.id = t.categoria_id
             WHERE a.excluido_em IS NULL AND t.id::TEXT=$1
               AND a.patrimonio = $2
               AND ($3 = 'admin' OR c.setor_id = $4)
             FOR UPDATE OF a FOR SHARE OF t,c`,
            [tipo, patrimonio, usuario.perfil, usuario.setor_id]
        );
        const ativo = resultado.rows[0];
        if (ativo && (await cliente.query("SELECT 1 FROM grupos_ativos_membros WHERE ativo_id=$1",[ativo.id])).rows.length) {
            const erro=new Error("Desvincule o ativo antes de realizar uma retirada individual"); erro.status=409; throw erro;
        }

        if (!ativo) {
            const erro = new Error(`${artigo} ${nomeAtivo} não encontrad${tipoMovimentacao ? "a" : "o"}`);
            erro.status = 404;
            throw erro;
        }
        if (tipoMovimentacao &&
            ativo.tipo_nome.trim().toLocaleLowerCase("pt-BR") !== tipoMovimentacao) {
            const erro = new Error(`O ativo lido não pertence ao tipo ${nomeTipo}`);
            erro.status = 400;
            throw erro;
        }
        if (ferramenta &&
            ativo.categoria_nome.trim().toLocaleLowerCase("pt-BR") !== "almoxarifado") {
            const erro = new Error("A ferramenta não pertence ao Almoxarifado");
            erro.status = 400;
            throw erro;
        }

        const acao = (ativo.status === "disponivel" ||
            (!tipoMovimentacao && ativo.status === "em_uso"))
            ? "saida"
            : ativo.status === "emprestado"
              ? "devolucao"
              : null;
        if (!acao) {
            const erro = new Error(
                `${artigo} ${nomeAtivo} precisa estar Disponível${!tipoMovimentacao ? ", Em uso" : ""} ou Emprestad${tipoMovimentacao ? "a" : "o"} para ser movimentad${tipoMovimentacao ? "a" : "o"}`
            );
            erro.status = 409;
            throw erro;
        }
        if (acao === "saida" && !ativo.permite_emprestimo) {
            const erro = new Error("Este tipo de ativo não permite empréstimo e devolução");
            erro.status = 409;
            throw erro;
        }
        if (dados.acao_esperada && dados.acao_esperada !== acao) {
            const erro = new Error(
                `A situação do ativo mudou. Confira os dados novamente`
            );
            erro.status = 409;
            throw erro;
        }
        if (acao === "saida" && !dados.responsavel) {
            const erro = new Error(`Informe quem está retirando ${tipoMovimentacao ? "a" : "o"} ${nomeAtivo}`);
            erro.status = 400;
            throw erro;
        }

        if (acao === "saida" && !dados.prazo_devolucao) {
            const erro = new Error("Informe a data e hora previstas para a devolução");
            erro.status = 400;
            throw erro;
        }

        require("../database/concorrencia").conferir(dados.revisao,ativo.revisao);
        if(dados.setor_responsavel_id && !(await require("./setores.model").buscarPorId(dados.setor_responsavel_id,cliente))) {const erro=new Error("Setor responsável foi desativado. Consulte os dados atuais.");erro.status=409;throw erro;}
        let emprestimo;
        let novoStatus;
        if (acao === "saida") {
            const insercao = await cliente.query(
                `INSERT INTO emprestimos_ativos (
                    ativo_id, patrimonio, tipo_ativo_id, responsavel,
                    setor_responsavel_id, observacao, status_anterior,
                    prazo_devolucao, usuario_saida_id, usuario_saida_nome
                 ) SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                   WHERE $8::TIMESTAMPTZ > NOW()
                 RETURNING id, prazo_devolucao, emprestado_em`,
                [ativo.id, ativo.patrimonio, ativo.tipo_ativo_id,
                    dados.responsavel, dados.setor_responsavel_id,
                    dados.observacao, ativo.status, dados.prazo_devolucao,
                    usuario.id, usuario.nome]
            );
            if (!insercao.rows.length) {
                const erro = new Error("O prazo de devolução deve estar no futuro");
                erro.status = 400;
                throw erro;
            }
            emprestimo = insercao.rows[0];
            novoStatus = "emprestado";
        } else {
            const encerramento = await cliente.query(
                `UPDATE emprestimos_ativos
                 SET devolvido_em = NOW(), usuario_devolucao_id = $2,
                     usuario_devolucao_nome = $3
                 WHERE ativo_id = $1 AND devolvido_em IS NULL
                 RETURNING id, status_anterior, prazo_devolucao, devolvido_em`,
                [ativo.id, usuario.id, usuario.nome]
            );
            emprestimo = encerramento.rows[0] || null;
            novoStatus = emprestimo?.status_anterior || "disponivel";
        }

        const atualizacao = await cliente.query(
            `UPDATE ativos
             SET status = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING updated_at`,
            [novoStatus, ativo.id]
        );
        let movimentacao = null;
        if (tabelaMovimentacao) movimentacao = await cliente.query(
            `INSERT INTO ${tabelaMovimentacao} (
                ativo_id, patrimonio, tipo_ativo_id, acao, responsavel,
                empresa_setor, setor_responsavel_id, observacao,
                usuario_id, usuario_nome
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id, created_at`,
            [
                ativo.id,
                ativo.patrimonio,
                ativo.tipo_ativo_id,
                acao,
                dados.responsavel || null,
                dados.setor_responsavel_nome || null,
                dados.setor_responsavel_id || null,
                dados.observacao || null,
                usuario.id,
                usuario.nome
            ]
        );
        const descricao = [
            dados.responsavel && `Responsável: ${dados.responsavel}`,
            dados.setor_responsavel_nome &&
                `Setor: ${dados.setor_responsavel_nome}`,
            emprestimo?.prazo_devolucao &&
                `Prazo: ${new Date(emprestimo.prazo_devolucao).toISOString()}`,
            dados.observacao && `Observação: ${dados.observacao}`
        ].filter(Boolean).join(" | ") || null;
        await cliente.query(
            `INSERT INTO historico_ativos (
                ativo_id, patrimonio, tipo_ativo_id, usuario_id,
                usuario_nome, acao, descricao, setor_anterior_id,
                setor_novo_id, status_anterior, status_novo,
                dados_anteriores, dados_novos, campos_alterados
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10,
                       $11, $12, '["status"]'::JSONB)`,
            [
                ativo.id,
                ativo.patrimonio,
                ativo.tipo_ativo_id,
                usuario.id,
                usuario.nome,
                acao === "saida"
                    ? (ferramenta ? "saida_ferramenta" : chave ? "saida_chave" : "saida_ativo")
                    : (ferramenta ? "devolucao_ferramenta" : chave ? "devolucao_chave" : "devolucao_ativo"),
                descricao,
                ativo.setor_id,
                ativo.status,
                novoStatus,
                { patrimonio: ativo.patrimonio, setor_id: ativo.setor_id,
                    status: ativo.status, ...(ativo.dados || {}) },
                { patrimonio: ativo.patrimonio, setor_id: ativo.setor_id,
                    status: novoStatus, ...(ativo.dados || {}) }
            ]
        );
        await cliente.query("COMMIT");

        return {
            acao,
            status: novoStatus,
            registrado_em: movimentacao?.rows[0].created_at ||
                emprestimo?.emprestado_em || emprestimo?.devolvido_em ||
                atualizacao.rows[0].updated_at,
            atualizado_em: atualizacao.rows[0].updated_at
        };
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

// Função: Estende um empréstimo aberto e registra o prazo anterior e o novo no histórico.
async function prorrogarEmprestimo(tipo, patrimonio, usuario, novoPrazo, revisao) {
    const tipoEncontrado=await buscarTipoPorNome(String(tipo),usuario);
    if (!tipoEncontrado) { const erro=new Error("Ativo não encontrado"); erro.status=404; throw erro; }
    tipo=String(tipoEncontrado.id);
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        await require("../database/concorrencia").bloquear(cliente);
        const resultado = await cliente.query(
            `SELECT a.id, a.revisao, a.tipo_ativo_id, a.patrimonio, a.dados,
                    a.setor_id, a.status
             FROM ativos a
             INNER JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
             INNER JOIN categorias c ON c.id = t.categoria_id
             WHERE a.excluido_em IS NULL AND t.id::TEXT=$1
               AND a.patrimonio = $2
               AND ($3 = 'admin' OR c.setor_id = $4)
             FOR UPDATE OF a FOR SHARE OF t,c`,
            [tipo, patrimonio, usuario.perfil, usuario.setor_id]
        );
        const ativo = resultado.rows[0];
        if (!ativo || ativo.status !== "emprestado") {
            const erro = new Error("Empréstimo aberto não encontrado");
            erro.status = 404;
            throw erro;
        }
        const anterior = await cliente.query(
            `SELECT id, prazo_devolucao
             FROM emprestimos_ativos
             WHERE ativo_id = $1 AND devolvido_em IS NULL
             FOR UPDATE`,
            [ativo.id]
        );
        const emprestimo = anterior.rows[0];
        if (!emprestimo) {
            const erro = new Error("Este empréstimo antigo não tem prazo registrado");
            erro.status = 409;
            throw erro;
        }
        require("../database/concorrencia").conferir(revisao,ativo.revisao);
        const atualizacao = await cliente.query(
            `UPDATE emprestimos_ativos
             SET prazo_devolucao = $1
             WHERE id = $2
               AND $1::TIMESTAMPTZ > NOW()
               AND $1::TIMESTAMPTZ > prazo_devolucao
             RETURNING prazo_devolucao`,
            [novoPrazo, emprestimo.id]
        );
        if (!atualizacao.rows.length) {
            const erro = new Error("O novo prazo deve ser posterior ao atual e estar no futuro");
            erro.status = 400;
            throw erro;
        }
        const prazoAnterior = new Date(emprestimo.prazo_devolucao).toISOString();
        await cliente.query(
            `INSERT INTO historico_ativos (
                ativo_id, patrimonio, tipo_ativo_id, usuario_id,
                usuario_nome, acao, descricao, setor_anterior_id,
                setor_novo_id, status_anterior, status_novo,
                dados_anteriores, dados_novos, campos_alterados
             ) VALUES ($1, $2, $3, $4, $5, 'prorrogacao_emprestimo',
                       $6, $7, $7, $8, $8, $9, $10,
                       '["prazo_devolucao"]'::JSONB)`,
            [ativo.id, ativo.patrimonio, ativo.tipo_ativo_id,
                usuario.id, usuario.nome,
                `Prazo anterior: ${prazoAnterior} | Novo prazo: ${novoPrazo}`,
                ativo.setor_id, ativo.status,
                { ...ativo.dados, prazo_devolucao: prazoAnterior },
                { ...ativo.dados, prazo_devolucao: novoPrazo }]
        );
        await cliente.query("COMMIT");
        return { prazo_devolucao: atualizacao.rows[0].prazo_devolucao };
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw require("../database/concorrencia").tratar(erro);
    } finally {
        cliente.release();
    }
}

module.exports = { bloquearDefinicao,
    bloquearContexto,
    bloquearPorId,
    buscarTipoPorNome,
    listarPorTipo,
    buscarPorPatrimonio,
    criar,
    atualizar,
    atualizarImagem,
    transferir,
    transferirGrupo,
    movimentarAtivoLido,
    prorrogarEmprestimo
};

async function bloquearDefinicao(id,usuario,cliente) {
    return (await cliente.query(`SELECT t.revisao FROM tipos_ativo t JOIN categorias c ON c.id=t.categoria_id
        WHERE t.id=$1 AND ($2='admin' OR c.setor_id=$3) FOR SHARE OF t,c`,[id,usuario.perfil,usuario.setor_id])).rows[0];
}
