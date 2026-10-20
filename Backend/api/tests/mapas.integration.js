require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../database/connection");
const mapasModel = require("../models/mapas.model");
const mapasService = require("./formularios.fixture.cjs").servico("mapas");
const ativosService = require("./formularios.fixture.cjs").servico("ativos");
const categoriasService = require("../services/categorias.service");
const tiposAtivoService = require("./formularios.fixture.cjs").servico("tiposAtivo");

async function executar() {
    const cliente = await pool.connect();
    const consultar = cliente.query.bind(cliente);
    const liberar = cliente.release.bind(cliente);
    const conectar = pool.connect.bind(pool);
    const consultaPool = pool.query.bind(pool);
    const sufixo = crypto.randomUUID().slice(0, 8);
    const usuario = {
        id: null,
        nome: "Teste do mapa",
        perfil: "admin",
        setor_id: null
    };

    try {
        await consultar("BEGIN");
        await consultar(
            fs.readFileSync(
                path.join(__dirname, "../database/schema.sql"),
                "utf8"
            )
        );

        pool.connect = async () => cliente;
        pool.query = (...args) => consultar(...args);
        cliente.release = () => {};
        cliente.query = (sql, ...args) => {
            if (sql === "BEGIN") return consultar("SAVEPOINT teste_mapa");
            if (sql === "COMMIT") {
                return consultar("RELEASE SAVEPOINT teste_mapa");
            }
            if (sql === "ROLLBACK") {
                return consultar("ROLLBACK TO SAVEPOINT teste_mapa");
            }
            return consultar(sql, ...args);
        };

        const setores = await consultar(
            `INSERT INTO setores (nome)
             VALUES ($1), ($2)
             RETURNING id, nome`,
            [`Origem mapa ${sufixo}`, `Destino mapa ${sufixo}`]
        );
        const origem = setores.rows[0];
        const destino = setores.rows[1];
        const categoria = await consultar(
            `INSERT INTO categorias (nome, setor_id)
             VALUES ($1, $2) RETURNING id`,
            [`Categoria mapa ${sufixo}`, origem.id]
        );
        const tipo = await consultar(
            `INSERT INTO tipos_ativo (categoria_id, nome)
             VALUES ($1, $2) RETURNING id`,
            [categoria.rows[0].id, `Tipo mapa ${sufixo}`]
        );
        const patrimonio = `MAP-${sufixo}`;
        const ativo = await consultar(
            `INSERT INTO ativos
                (tipo_ativo_id, setor_id, patrimonio, status)
             VALUES ($1, $2, $3, 'em_uso') RETURNING id`,
            [tipo.rows[0].id, origem.id, patrimonio]
        );
        const planta = await consultar(
            `INSERT INTO plantas_baixas
                (nome, arquivo, largura, altura, criado_por)
             VALUES ($1, 'teste.png', 1000, 700, NULL)
             RETURNING id`,
            [`Planta mapa ${sufixo}`]
        );
        const poligonoOrigem = [
            { x: 0.05, y: 0.1 },
            { x: 0.45, y: 0.1 },
            { x: 0.45, y: 0.9 },
            { x: 0.05, y: 0.9 }
        ];
        const poligonoDestino = [
            { x: 0.55, y: 0.1 },
            { x: 0.95, y: 0.1 },
            { x: 0.95, y: 0.9 },
            { x: 0.55, y: 0.9 }
        ];

        const ambienteOrigem = await mapasService.salvarAmbiente(null, {
            planta_id: planta.rows[0].id,
            setor_id: origem.id,
            nome: "Sala de origem",
            cor: "#2563eb",
            padrao: true,
            poligono: poligonoOrigem
        });
        const ambienteDestino = await mapasService.salvarAmbiente(null, {
            planta_id: planta.rows[0].id,
            setor_id: destino.id,
            nome: "Sala de destino",
            cor: "#16a34a",
            padrao: true,
            poligono: poligonoDestino
        });

        const usuarioSetor = {
            id: null,
            nome: "Usuário do setor no teste",
            perfil: "setor",
            setor_id: origem.id
        };
        await categoriasService.atualizarCategoria(
            categoria.rows[0].id,
            { nome: `Categoria mapa ${sufixo}`, icone: "🔧" },
            usuarioSetor
        );
        await tiposAtivoService.atualizarTipo(
            tipo.rows[0].id,
            {
                categoria_id: categoria.rows[0].id,
                nome: `Tipo mapa ${sufixo}`,
                icone: "💻",
                permite_emprestimo: false
            },
            usuarioSetor
        );

        const mapaComIcones = await mapasService.detalhar(
            planta.rows[0].id,
            usuarioSetor
        );
        assert.equal(mapaComIcones.ativos[0].tipo_icone, "💻");
        assert.equal(mapaComIcones.ativos[0].categoria_icone, "🔧");

        const auditoriaIcones = await consultar(
            `SELECT entidade, icone_anterior, icone_novo, usuario_nome
             FROM historico_icones
             WHERE registro_id IN ($1, $2)
             ORDER BY id`,
            [categoria.rows[0].id, tipo.rows[0].id]
        );
        assert.deepEqual(
            auditoriaIcones.rows.map((registro) => ({
                entidade: registro.entidade,
                anterior: registro.icone_anterior,
                novo: registro.icone_novo,
                usuario: registro.usuario_nome
            })),
            [
                {
                    entidade: "categoria",
                    anterior: null,
                    novo: "🔧",
                    usuario: usuarioSetor.nome
                },
                {
                    entidade: "tipo_ativo",
                    anterior: null,
                    novo: "💻",
                    usuario: usuarioSetor.nome
                }
            ]
        );

        await assert.rejects(
            categoriasService.atualizarCategoria(
                categoria.rows[0].id,
                { nome: `Categoria mapa ${sufixo}`, icone: "📦" },
                {
                    id: null,
                    nome: "Usuário de outro setor",
                    perfil: "setor",
                    setor_id: destino.id
                }
            ),
            (erro) => erro.status === 404
        );

        let posicao = await consultar(
            "SELECT ambiente_id, x::FLOAT, y::FLOAT FROM posicoes_ativos WHERE ativo_id = $1",
            [ativo.rows[0].id]
        );
        assert.equal(posicao.rows[0].ambiente_id, ambienteOrigem.id);
        assert.ok(
            mapasService.pontoNoPoligono(
                { x: posicao.rows[0].x, y: posicao.rows[0].y },
                poligonoOrigem
            )
        );

        await mapasService.moverAtivo(
            ativo.rows[0].id,
            { ambiente_id: ambienteOrigem.id, x: 0.3, y: 0.4 },
            usuario
        );
        await assert.rejects(
            mapasService.moverAtivo(
                ativo.rows[0].id,
                { ambiente_id: ambienteOrigem.id, x: 0.7, y: 0.4 },
                usuario
            ),
            (erro) => erro.status === 409
        );

        const poligonoReduzido = [
            { x: 0.05, y: 0.1 },
            { x: 0.22, y: 0.1 },
            { x: 0.22, y: 0.35 },
            { x: 0.05, y: 0.35 }
        ];
        await mapasService.salvarAmbiente(ambienteOrigem.id, {
            planta_id: planta.rows[0].id,
            setor_id: origem.id,
            nome: "Sala de origem",
            cor: "#2563eb",
            padrao: true,
            poligono: poligonoReduzido
        });
        posicao = await consultar(
            "SELECT x::FLOAT, y::FLOAT FROM posicoes_ativos WHERE ativo_id = $1",
            [ativo.rows[0].id]
        );
        assert.ok(
            mapasService.pontoNoPoligono(
                { x: posicao.rows[0].x, y: posicao.rows[0].y },
                poligonoReduzido
            )
        );

        await ativosService.transferirAtivo(
            String(tipo.rows[0].id),
            patrimonio,
            { setor_id: destino.id, observacao: "Teste automático" },
            usuario
        );
        posicao = await consultar(
            "SELECT ambiente_id, x::FLOAT, y::FLOAT FROM posicoes_ativos WHERE ativo_id = $1",
            [ativo.rows[0].id]
        );
        assert.equal(posicao.rows[0].ambiente_id, ambienteDestino.id);
        assert.ok(
            mapasService.pontoNoPoligono(
                { x: posicao.rows[0].x, y: posicao.rows[0].y },
                poligonoDestino
            )
        );

        const patrimonioEditado = `EDT-${sufixo}`;
        await ativosService.criarAtivo(
            String(tipo.rows[0].id),
            {
                patrimonio: patrimonioEditado,
                setor_id: origem.id,
                status: "em_uso"
            },
            usuario
        );
        let ativoEditado = await consultar(
            `SELECT a.id, pa.ambiente_id
             FROM ativos a
             LEFT JOIN posicoes_ativos pa ON pa.ativo_id = a.id
             WHERE a.patrimonio = $1`,
            [patrimonioEditado]
        );
        assert.equal(
            ativoEditado.rows[0].ambiente_id,
            ambienteOrigem.id
        );

        await assert.rejects(ativosService.atualizarAtivo(
            String(tipo.rows[0].id),
            patrimonioEditado,
            {
                patrimonio: patrimonioEditado,
                setor_id: destino.id,
                status: "em_uso"
            },
            usuario
        ), { status: 400 });
        await ativosService.transferirAtivo(String(tipo.rows[0].id), patrimonioEditado, { setor_id: destino.id }, usuario);
        ativoEditado = await consultar(
            `SELECT pa.ambiente_id
             FROM ativos a
             LEFT JOIN posicoes_ativos pa ON pa.ativo_id = a.id
             WHERE a.patrimonio = $1`,
            [patrimonioEditado]
        );
        assert.equal(
            ativoEditado.rows[0].ambiente_id,
            ambienteDestino.id
        );

        const historico = await consultar(
            `SELECT acao FROM historico_ativos
             WHERE ativo_id = $1
             ORDER BY id`,
            [ativo.rows[0].id]
        );
        assert.deepEqual(
            historico.rows.map((item) => item.acao),
            ["posicionamento_mapa", "transferencia"]
        );

        assert.throws(
            () => mapasService.validarPoligono([
                { x: 0.1, y: 0.1 },
                { x: 0.9, y: 0.9 },
                { x: 0.1, y: 0.9 },
                { x: 0.9, y: 0.1 }
            ]),
            /não podem se cruzar/
        );
        const concavo = [
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.1 },
            { x: 0.9, y: 0.3 },
            { x: 0.3, y: 0.3 },
            { x: 0.3, y: 0.7 },
            { x: 0.9, y: 0.7 },
            { x: 0.9, y: 0.9 },
            { x: 0.1, y: 0.9 }
        ];
        assert.ok(
            mapasService.pontoNoPoligono(
                mapasService.centroide(concavo),
                concavo
            )
        );

        console.log(
            "Mapa, emojis por setor, auditoria, limites e transferência automática validados."
        );
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
