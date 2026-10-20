require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
const checklistsService = require("./formularios.fixture.cjs").servico("checklists");
const checklistsModel = require("../models/checklists.model");
const vinculosService = require("./formularios.fixture.cjs").servico("vinculos");
const mapasService = require("./formularios.fixture.cjs").servico("mapas");
const ativosService = require("./formularios.fixture.cjs").servico("ativos");

function somenteData(valor) {
    return valor instanceof Date
        ? valor.toISOString().slice(0, 10)
        : String(valor).slice(0, 10);
}

async function executar() {
    const cliente = await pool.connect();
    const consultar = cliente.query.bind(cliente);
    const liberar = cliente.release.bind(cliente);
    const conectar = pool.connect.bind(pool);
    const consultaPool = pool.query.bind(pool);
    const sufixo = crypto.randomUUID().slice(0, 8);
    const usuario = { id: null, nome: "Teste checklist", perfil: "admin", setor_id: null };

    try {
        await consultar("BEGIN");
        await consultar(fs.readFileSync(path.join(__dirname, "../database/schema.sql"), "utf8"));
        pool.connect = async () => cliente;
        pool.query = (...args) => consultar(...args);
        cliente.release = () => {};
        cliente.query = (sql, ...args) => {
            if (sql === "BEGIN") return consultar("SAVEPOINT teste_recursos");
            if (sql === "COMMIT") return consultar("RELEASE SAVEPOINT teste_recursos");
            if (sql === "ROLLBACK") return consultar("ROLLBACK TO SAVEPOINT teste_recursos");
            return consultar(sql, ...args);
        };

        const setores = await consultar(
            `INSERT INTO setores (nome) VALUES ($1),($2) RETURNING id`,
            [`Origem recursos ${sufixo}`, `Destino recursos ${sufixo}`]
        );
        const categoria = await consultar(
            `INSERT INTO categorias (nome, setor_id) VALUES ($1,$2) RETURNING id`,
            [`Categoria recursos ${sufixo}`, setores.rows[0].id]
        );
        const tipo = await consultar(
            `INSERT INTO tipos_ativo (
                categoria_id, nome, permite_checklist,
                checklist_intervalo_meses, checklist_alerta_dias,
                checklist_modo, checklist_itens, permite_vinculo
             ) VALUES ($1,$2,TRUE,1,10,'conclusao',$3,TRUE) RETURNING id`,
            [categoria.rows[0].id, `Tipo recursos ${sufixo}`, JSON.stringify(["Está no local?", "Está íntegro?"])]
        );
        const tipoVinculado = await consultar(
            `INSERT INTO tipos_ativo (categoria_id, nome, permite_vinculo)
             VALUES ($1,$2,TRUE) RETURNING id`,
            [categoria.rows[0].id, `Outro tipo ${sufixo}`]
        );
        const tipoNaoVinculavel = await consultar(
            `INSERT INTO tipos_ativo (categoria_id, nome, permite_vinculo)
             VALUES ($1,$2,FALSE) RETURNING id`,
            [categoria.rows[0].id, `Tipo bloqueado ${sufixo}`]
        );
        const ativos = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, setor_id, patrimonio, status, checklist_proxima_data)
             VALUES ($1,$2,$3,'em_uso',CURRENT_DATE-1),($4,$2,$5,'em_uso',NULL)
             RETURNING id, patrimonio`,
            [tipo.rows[0].id, setores.rows[0].id, `REC-A-${sufixo}`,
                tipoVinculado.rows[0].id, `REC-B-${sufixo}`]
        );
        const ativoNaoVinculavel = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, setor_id, patrimonio, status)
             VALUES ($1,$2,$3,'em_uso') RETURNING id, patrimonio`,
            [tipoNaoVinculavel.rows[0].id, setores.rows[0].id, `SEM-VINC-${sufixo}`]
        );

        const checklistAntesDaExecucao = await checklistsModel.buscarAtivo(
            tipo.rows[0].id, ativos.rows[0].patrimonio, usuario
        );
        const execucao = await checklistsService.executar(
            tipo.rows[0].id, ativos.rows[0].patrimonio,
            { respostas: [{ resposta: "conforme" }, { resposta: "nao_conforme" }], observacao: "Ajustar fixação" },
            usuario
        );
        assert.equal(execucao.resultado, "nao_conforme");
        assert.ok(execucao.proxima_data);
        await assert.rejects(
            checklistsModel.registrar(checklistAntesDaExecucao, {
                respostas: [{ item: "Está no local?", resposta: "conforme" },
                    { item: "Está íntegro?", resposta: "conforme" }],
                resultado: "conforme",
                observacao: "",
                proxima_data: execucao.proxima_data,
                body: { ocorrencia_id: checklistAntesDaExecucao.ocorrencia_id,
                    modelo_id: checklistAntesDaExecucao.modelo_id }
            }, usuario),
            /Consulte os registros respondidos na data solicitada!/
        );

        const tiposAgenda = await consultar(
            `INSERT INTO tipos_ativo (
                categoria_id, nome, permite_checklist, checklist_recorrencia,
                checklist_intervalo_meses, checklist_datas_personalizadas,
                checklist_alerta_dias, checklist_modo, checklist_itens
             ) VALUES
                ($1,$2,TRUE,'semanal',NULL,'[]'::JSONB,2,'conclusao',$4),
                ($1,$3,TRUE,'personalizado',NULL,
                 JSONB_BUILD_ARRAY((CURRENT_DATE + 1)::TEXT, (CURRENT_DATE + 10)::TEXT),
                 2,'calendario',$4)
             RETURNING id, checklist_recorrencia`,
            [categoria.rows[0].id, `Semanal ${sufixo}`, `Personalizado ${sufixo}`,
                JSON.stringify(["Conferência agendada"])]
        );
        const tipoSemanal = tiposAgenda.rows.find((item) => item.checklist_recorrencia === "semanal");
        const tipoPersonalizado = tiposAgenda.rows.find((item) => item.checklist_recorrencia === "personalizado");
        const ativosAgenda = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, setor_id, patrimonio, status, checklist_proxima_data)
             VALUES
                ($1,$3,$4,'em_uso',CURRENT_DATE),
                ($2,$3,$5,'em_uso',CURRENT_DATE + 1)
             RETURNING id, tipo_ativo_id, patrimonio`,
            [tipoSemanal.id, tipoPersonalizado.id, setores.rows[0].id,
                `SEM-${sufixo}`, `PER-${sufixo}`]
        );
        const ativoSemanal = ativosAgenda.rows.find((item) => item.tipo_ativo_id === tipoSemanal.id);
        const ativoPersonalizado = ativosAgenda.rows.find((item) => item.tipo_ativo_id === tipoPersonalizado.id);
        const execucaoSemanal = await checklistsService.executar(
            tipoSemanal.id, ativoSemanal.patrimonio,
            { respostas: [{ resposta: "conforme" }] }, usuario
        );
        const execucaoPersonalizada = await checklistsService.executar(
            tipoPersonalizado.id, ativoPersonalizado.patrimonio,
            { respostas: [{ resposta: "conforme" }] }, usuario
        );
        const datasEsperadas = await consultar(
            `SELECT (CURRENT_DATE + 7)::TEXT AS semanal,
                    (CURRENT_DATE + 10)::TEXT AS personalizada`
        );
        assert.equal(somenteData(execucaoSemanal.proxima_data), datasEsperadas.rows[0].semanal);
        assert.equal(somenteData(execucaoPersonalizada.proxima_data), datasEsperadas.rows[0].personalizada);

        await assert.rejects(
            vinculosService.criar({
                nome: `Grupo inválido ${sufixo}`,
                ativo_ids: [ativos.rows[0].id, ativoNaoVinculavel.rows[0].id]
            }, usuario),
            /Todos os tipos selecionados precisam permitir vínculos/
        );
        const candidatosBloqueados = await vinculosService.candidatos(
            { q: ativoNaoVinculavel.rows[0].patrimonio }, usuario
        );
        assert.equal(candidatosBloqueados.length, 0);

        const grupo = await vinculosService.criar({
            nome: `Estação ${sufixo}`,
            ativo_ids: ativos.rows.map((item) => item.id)
        }, usuario);
        assert.ok(grupo.id);
        const gruposListados = await vinculosService.listar(
            { categoria_id: categoria.rows[0].id }, usuario
        );
        assert.ok(gruposListados.some((item) => item.id === grupo.id && item.total_membros === 2));

        const planta = await consultar(
            `INSERT INTO plantas_baixas (nome, arquivo, largura, altura)
             VALUES ($1,'teste.png',1000,700) RETURNING id`,
            [`Planta recursos ${sufixo}`]
        );
        const ambiente = await mapasService.salvarAmbiente(null, {
            planta_id: planta.rows[0].id, setor_id: setores.rows[0].id,
            nome: "Sala vinculada", cor: "#2563eb", padrao: true,
            poligono: [{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]
        });
        const movimento = await mapasService.moverAtivo(
            ativos.rows[0].id, { ambiente_id: ambiente.id, x: .4, y: .5 }, usuario
        );
        assert.equal(movimento.posicoes.length, 2);

        const posicoes = await consultar(
            `SELECT ambiente_id, x::FLOAT AS x, y::FLOAT AS y
             FROM posicoes_ativos WHERE ativo_id = ANY($1::INTEGER[])`,
            [ativos.rows.map((item) => item.id)]
        );
        assert.equal(posicoes.rows.length, 2);
        assert.ok(posicoes.rows.every((item) => item.ambiente_id === ambiente.id && item.x === .4 && item.y === .5));

        const transferencia = await ativosService.transferirAtivo(
            tipo.rows[0].id, ativos.rows[0].patrimonio,
            { setor_id: setores.rows[1].id, observacao: "Mudança da estação" }, usuario
        );
        assert.equal(transferencia.total, 2);
        const setoresAtivos = await consultar(
            `SELECT DISTINCT setor_id FROM ativos WHERE id = ANY($1::INTEGER[])`,
            [ativos.rows.map((item) => item.id)]
        );
        assert.deepEqual(setoresAtivos.rows.map((item) => item.setor_id), [setores.rows[1].id]);

        const adicionais = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, setor_id, patrimonio, status)
             VALUES ($1,$2,$3,'em_uso'),($1,$2,$4,'em_uso'),($1,$2,$5,'em_uso')
             RETURNING id, patrimonio`,
            [tipo.rows[0].id, setores.rows[1].id,
                `REC-C-${sufixo}`, `REC-D-${sufixo}`, `REC-E-${sufixo}`]
        );
        await vinculosService.atualizar(grupo.id, {
            nome: `Estação ${sufixo}`,
            ativo_ids: [...ativos.rows.map((item) => item.id), adicionais.rows[0].id]
        }, usuario);
        const grupoAmpliado = (await vinculosService.listar({}, usuario))
            .find((item) => item.id === grupo.id);
        assert.equal(grupoAmpliado.total_membros, 3);
        await assert.rejects(
            vinculosService.criar({
                nome: ` estação ${sufixo} `,
                ativo_ids: [adicionais.rows[1].id, adicionais.rows[2].id]
            }, usuario),
            /Já existe um grupo com este nome neste setor/
        );

        await assert.rejects(
            ativosService.movimentarEmprestimo(
                tipo.rows[0].id, ativos.rows[0].patrimonio,
                { prazo_devolucao: new Date(Date.now() + 86400000).toISOString() }, usuario
            ),
            /Desvincule o ativo/
        );
        console.log("Checklists, vínculos, mapa conjunto, transferência e bloqueio individual validados.");
    } finally {
        cliente.query = consultar;
        pool.connect = conectar;
        pool.query = consultaPool;
        cliente.release = liberar;
        await consultar("ROLLBACK");
        cliente.release();
        await pool.end();
    }
}

executar().catch((erro) => { console.error(erro); process.exitCode = 1; });
