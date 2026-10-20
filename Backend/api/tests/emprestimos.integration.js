require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
const ativosModel = require("./formularios.fixture.cjs").modeloAtivos();
const gestaoModel = require("../models/gestao.model");
const tiposAtivoService = require("./formularios.fixture.cjs").servico("tiposAtivo");

// Função: Executa o fluxo completo em uma transação descartável e restaura as conexões ao terminar.
async function executar() {
    const cliente = await pool.connect();
    const consultar = cliente.query.bind(cliente);
    const liberar = cliente.release.bind(cliente);
    const conectar = pool.connect.bind(pool);
    const consultaPool = pool.query.bind(pool);
    const usuario = {
        id: null,
        nome: "Teste de empréstimo",
        perfil: "admin",
        setor_id: null
    };
    const sufixo = crypto.randomUUID().slice(0, 8);

    try {
        await consultar("BEGIN");
        await consultar(fs.readFileSync(
            path.join(__dirname, "../database/schema.sql"), "utf8"
        ));

        // Os modelos usam a mesma transação externa, preservada por savepoints.
        pool.connect = async () => cliente;
        pool.query = (...args) => consultar(...args);
        cliente.release = () => {};
        cliente.query = (sql, ...args) => {
            if (sql === "BEGIN") return consultar("SAVEPOINT teste_movimentacao");
            if (sql === "COMMIT") return consultar("RELEASE SAVEPOINT teste_movimentacao");
            if (sql === "ROLLBACK") return consultar("ROLLBACK TO SAVEPOINT teste_movimentacao");
            return consultar(sql, ...args);
        };

        const tipoExistente = await consultar(
            "SELECT id FROM tipos_ativo ORDER BY id LIMIT 1"
        );
        let tipoId = tipoExistente.rows[0]?.id;
        if (tipoId) {
            await consultar(
                "UPDATE tipos_ativo SET permite_emprestimo = TRUE WHERE id = $1",
                [tipoId]
            );
        }
        if (!tipoId) {
            const categoria = await consultar(
                "INSERT INTO categorias (nome) VALUES ($1) RETURNING id",
                [`Teste ${sufixo}`]
            );
            const tipo = await consultar(
                `INSERT INTO tipos_ativo (categoria_id, nome, permite_emprestimo)
                 VALUES ($1, $2, TRUE) RETURNING id`,
                [categoria.rows[0].id, `Ativos ${sufixo}`]
            );
            tipoId = tipo.rows[0].id;
        }

        const patrimonio = `EMP-${sufixo}`;
        const ativo = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, patrimonio, status)
             VALUES ($1, $2, 'em_uso') RETURNING id`,
            [tipoId, patrimonio]
        );

        const painelAdmin = await gestaoModel.dashboard(usuario);
        assert.equal(painelAdmin.possui_ativos_emprestaveis, true);
        assert.ok(painelAdmin.ativos_emprestaveis >= 1);

        const setorSemEmprestimos = await consultar(
            "INSERT INTO setores (nome) VALUES ($1) RETURNING id",
            [`Setor sem empréstimos ${sufixo}`]
        );
        const painelSemEmprestimos = await gestaoModel.dashboard({
            perfil: "setor",
            setor_id: setorSemEmprestimos.rows[0].id
        });
        assert.equal(
            painelSemEmprestimos.possui_ativos_emprestaveis,
            false
        );

        const categoriaTipo = await consultar(
            "SELECT categoria_id FROM tipos_ativo WHERE id = $1",
            [tipoId]
        );
        const tipoBloqueado = await consultar(
            `INSERT INTO tipos_ativo (categoria_id, nome, permite_emprestimo)
             VALUES ($1, $2, FALSE) RETURNING id`,
            [categoriaTipo.rows[0].categoria_id, `Sem empréstimo ${sufixo}`]
        );
        const patrimonioBloqueado = `BLQ-${sufixo}`;
        await consultar(
            `INSERT INTO ativos (tipo_ativo_id, patrimonio, status)
             VALUES ($1, $2, 'disponivel')`,
            [tipoBloqueado.rows[0].id, patrimonioBloqueado]
        );
        await assert.rejects(
            ativosModel.movimentarAtivoLido(
                String(tipoBloqueado.rows[0].id), patrimonioBloqueado, usuario,
                {
                    responsavel: "Responsável",
                    prazo_devolucao: new Date(Date.now() + 86400000).toISOString()
                }, null
            ),
            (erro) => erro.status === 409 && /não permite empréstimo/.test(erro.message)
        );

        await assert.rejects(
            ativosModel.movimentarAtivoLido(
                String(tipoId), patrimonio, usuario,
                { responsavel: "Responsável" }, null
            ),
            (erro) => erro.status === 400 && /data e hora/.test(erro.message)
        );

        const prazo = new Date(Date.now() + 3 * 86400000).toISOString();
        const saida = await ativosModel.movimentarAtivoLido(
            String(tipoId), patrimonio, usuario,
            { responsavel: "Responsável", prazo_devolucao: prazo }, null
        );
        assert.equal(saida.status, "emprestado");
        const aberto = await consultar(
            "SELECT status_anterior FROM emprestimos_ativos WHERE ativo_id = $1 AND devolvido_em IS NULL",
            [ativo.rows[0].id]
        );
        assert.equal(aberto.rows[0].status_anterior, "em_uso");

        await assert.rejects(
            tiposAtivoService.atualizarTipo(
                tipoId,
                {
                    categoria_id: categoriaTipo.rows[0].categoria_id,
                    nome: `Ativos ${sufixo}`,
                    permite_emprestimo: false
                },
                usuario
            ),
            (erro) => erro.status === 409 && /Devolva os ativos/.test(erro.message)
        );

        await consultar(
            "UPDATE emprestimos_ativos SET prazo_devolucao = NOW() + INTERVAL '12 hours' WHERE ativo_id = $1",
            [ativo.rows[0].id]
        );
        let lista = await gestaoModel.listarEmprestimos(usuario);
        assert.equal(lista.find((item) => item.patrimonio === patrimonio).situacao, "proximo");

        await consultar(
            "UPDATE emprestimos_ativos SET prazo_devolucao = NOW() - INTERVAL '1 hour' WHERE ativo_id = $1",
            [ativo.rows[0].id]
        );
        lista = await gestaoModel.listarEmprestimos(usuario);
        assert.equal(lista.find((item) => item.patrimonio === patrimonio).situacao, "vencido");

        await assert.rejects(
            ativosModel.prorrogarEmprestimo(
                String(tipoId), patrimonio, usuario,
                new Date(Date.now() - 3600000).toISOString()
            ),
            (erro) => erro.status === 400
        );

        await ativosModel.prorrogarEmprestimo(
            String(tipoId), patrimonio, usuario,
            new Date(Date.now() + 5 * 86400000).toISOString()
        );
        const prorrogacao = await consultar(
            "SELECT COUNT(*)::INTEGER AS total FROM historico_ativos WHERE ativo_id = $1 AND acao = 'prorrogacao_emprestimo'",
            [ativo.rows[0].id]
        );
        assert.equal(prorrogacao.rows[0].total, 1);

        await consultar(
            "UPDATE tipos_ativo SET permite_emprestimo = FALSE WHERE id = $1",
            [tipoId]
        );

        const devolucao = await ativosModel.movimentarAtivoLido(
            String(tipoId), patrimonio, usuario, {}, null
        );
        assert.equal(devolucao.status, "em_uso");
        await consultar(
            "UPDATE tipos_ativo SET permite_emprestimo = TRUE WHERE id = $1",
            [tipoId]
        );
        lista = await gestaoModel.listarEmprestimos(usuario);
        assert.equal(lista.some((item) => item.patrimonio === patrimonio), false);

        const legado = `LEG-${sufixo}`;
        const ativoLegado = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, patrimonio, status)
             VALUES ($1, $2, 'emprestado') RETURNING id`,
            [tipoId, legado]
        );
        lista = await gestaoModel.listarEmprestimos(usuario);
        assert.equal(lista.find((item) => item.patrimonio === legado).situacao, "sem_prazo");
        const retornoLegado = await ativosModel.movimentarAtivoLido(
            String(tipoId), legado, usuario, {}, null
        );
        assert.equal(retornoLegado.status, "disponivel");
        assert.ok(ativoLegado.rows[0].id);

        const ferramenta = await consultar(
            `SELECT t.id FROM tipos_ativo t
             INNER JOIN categorias c ON c.id = t.categoria_id
             WHERE LOWER(t.nome) = 'ferramentas'
               AND LOWER(c.nome) = 'almoxarifado'
             LIMIT 1`
        );
        let ferramentaTipoId = ferramenta.rows[0]?.id;
        if (!ferramentaTipoId) {
            const categoriaAlmox = await consultar(
                `INSERT INTO categorias (nome)
                 VALUES ('Almoxarifado')
                 ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
                 RETURNING id`
            );
            const inserido = await consultar(
                `INSERT INTO tipos_ativo (categoria_id, nome, permite_emprestimo)
                 VALUES ($1, 'Ferramentas', TRUE) RETURNING id`,
                [categoriaAlmox.rows[0].id]
            );
            ferramentaTipoId = inserido.rows[0].id;
        } else {
            await consultar(
                "UPDATE tipos_ativo SET permite_emprestimo = TRUE WHERE id = $1",
                [ferramentaTipoId]
            );
        }
        const patrimonioFerramenta = `FER-${sufixo}`;
        const ativoFerramenta = await consultar(
            `INSERT INTO ativos (tipo_ativo_id, patrimonio, status)
             VALUES ($1, $2, 'disponivel') RETURNING id`,
            [ferramentaTipoId, patrimonioFerramenta]
        );
        await ativosModel.movimentarAtivoLido(
            String(ferramentaTipoId), patrimonioFerramenta, usuario,
            { responsavel: "Almoxarifado", prazo_devolucao: prazo },
            "ferramentas"
        );
        const saidaFerramenta = await consultar(
            `SELECT COUNT(*)::INTEGER AS total
             FROM movimentacoes_ferramentas
             WHERE ativo_id = $1 AND acao = 'saida'`,
            [ativoFerramenta.rows[0].id]
        );
        assert.equal(saidaFerramenta.rows[0].total, 1);
        await ativosModel.movimentarAtivoLido(
            String(ferramentaTipoId), patrimonioFerramenta, usuario,
            {}, "ferramentas"
        );

        console.log("Empréstimo, alertas, prorrogação, devolução, legado e Ferramentas validados.");
    } finally {
        pool.connect = conectar;
        pool.query = consultaPool;
        cliente.query = consultar;
        cliente.release = liberar;
        await consultar("ROLLBACK");
        liberar();
        await pool.end();
    }
}

executar().catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
});
