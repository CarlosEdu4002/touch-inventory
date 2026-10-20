"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const zlib = require("node:zlib");
const pool = require("../database/connection");
const initDatabase = require("../database/init");
const { app } = require("../server");
const unidadeFixture = require("./unidade.fixture.cjs");

let servidor;
let baseUrl;
let patrimonioChecklist;
const ids = { sessoes: [], usuarios: [], ativos: [], tipos: [], categorias: [], setores: [] };
const tokens = { admin: crypto.randomBytes(32).toString("hex"),
    setor1: crypto.randomBytes(32).toString("hex"), setor2: crypto.randomBytes(32).toString("hex") };
const hoje = new Date().toISOString().slice(0, 10);

function hash(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function requisicao(caminho, token) {
    const pedido = await unidadeFixture.prepararPedido(pool,caminho,token ? `inventario_sessao=${token}` : "");
    return fetch(`${baseUrl}${pedido.url}`, { headers: pedido.headers });
}

function extrairZip(buffer) {
    const arquivos = new Map();
    for (let i = 0; i <= buffer.length - 46; i += 1) {
        if (buffer.readUInt32LE(i) !== 0x02014b50) continue;
        const metodo = buffer.readUInt16LE(i + 10);
        const tamanho = buffer.readUInt32LE(i + 20);
        const nomeTam = buffer.readUInt16LE(i + 28);
        const extraTam = buffer.readUInt16LE(i + 30);
        const comentarioTam = buffer.readUInt16LE(i + 32);
        const local = buffer.readUInt32LE(i + 42);
        const nome = buffer.subarray(i + 46, i + 46 + nomeTam).toString("utf8");
        const localNome = buffer.readUInt16LE(local + 26);
        const localExtra = buffer.readUInt16LE(local + 28);
        const inicio = local + 30 + localNome + localExtra;
        const comprimido = buffer.subarray(inicio, inicio + tamanho);
        const conteudo = metodo === 8 ? zlib.inflateRawSync(comprimido) : comprimido;
        arquivos.set(nome, conteudo);
        i += 45 + nomeTam + extraTam + comentarioTam;
    }
    return arquivos;
}

test.before(async () => {
    await initDatabase();
    await unidadeFixture.prepararPrimeiraUnidade(pool);
    const sufixo = `${Date.now()}-${process.pid}`;
    for (const nome of [`Exportação A ${sufixo}`, `Exportação B ${sufixo}`]) {
        const r = await pool.query("INSERT INTO setores (nome) VALUES ($1) RETURNING id", [nome]);
        ids.setores.push(r.rows[0].id);
    }
    for (const [indice, setorId] of ids.setores.entries()) {
        const u = await pool.query(
            `INSERT INTO usuarios (login,nome,senha_hash,perfil,setor_id)
             VALUES ($1,$2,'teste','setor',$3) RETURNING id`,
            [`exp-setor-${indice}-${sufixo}`, `Usuário Setor ${indice}`, setorId]
        );
        ids.usuarios.push(u.rows[0].id);
        const c = await pool.query(
            "INSERT INTO categorias (nome,setor_id) VALUES ($1,$2) RETURNING id",
            [`Categoria Exportação ${indice} ${sufixo}`, setorId]
        );
        ids.categorias.push(c.rows[0].id);
        const t = await pool.query(
            "INSERT INTO tipos_ativo (categoria_id,nome,permite_emprestimo) VALUES ($1,$2,TRUE) RETURNING id",
            [c.rows[0].id, `Tipo Exportação ${indice} ${sufixo}`]
        );
        ids.tipos.push(t.rows[0].id);
        await pool.query(
            "INSERT INTO campos (tipo_ativo_id,nome,label,tipo,ordem) VALUES ($1,$2,'Identificação','texto',1)",
            [t.rows[0].id, indice === 0 ? "formula" : "outro"]
        );
    }
    const admin = await pool.query(
        `INSERT INTO usuarios (login,nome,senha_hash,perfil,setor_id)
         VALUES ($1,'Administrador Exportação','teste','admin',NULL) RETURNING id`,
        [`exp-admin-${sufixo}`]
    );
    ids.usuarios.push(admin.rows[0].id);
    const usuariosSessao = [
        { id: admin.rows[0].id, perfil: "admin" },
        { id: ids.usuarios[0], perfil: "setor", setor_id: ids.setores[0] },
        { id: ids.usuarios[1], perfil: "setor", setor_id: ids.setores[1] }
    ];
    for (const [indice, token] of Object.values(tokens).entries()) {
        await unidadeFixture.criarSessao(pool,token,usuariosSessao[indice]);
        ids.sessoes.push(hash(token));
    }
    const ativosDados = [
        [ids.tipos[0], ids.setores[0], `LAB-EXP-A-${sufixo}`, { formula: '=SOMA(1;1) "ação"\nlinha' }, "em_uso"],
        [ids.tipos[1], ids.setores[1], `LAB-EXP-B-${sufixo}`, { outro: "valor" }, "disponivel"],
        [ids.tipos[0], ids.setores[0], `LAB-EXP-C-${sufixo}`, { formula: "vencido" }, "emprestado"]
    ];
    patrimonioChecklist = ativosDados[0][2];
    for (const item of ativosDados) {
        const a = await pool.query(
            "INSERT INTO ativos (tipo_ativo_id,setor_id,patrimonio,dados,status) VALUES ($1,$2,$3,$4,$5) RETURNING id,patrimonio",
            item
        );
        ids.ativos.push(a.rows[0].id);
    }
    await pool.query(
        `INSERT INTO execucoes_checklist
         (ativo_id, patrimonio, tipo_ativo_id, data_prevista, resultado, observacao,
          respostas, proxima_data, usuario_id, usuario_nome)
         VALUES ($1,$2,$3,CURRENT_DATE,'nao_conforme','Bateria viciada',
          $4::jsonb,CURRENT_DATE + 30,$5,'Usuário Setor 0')`,
        [ids.ativos[0], ativosDados[0][2], ids.tipos[0], JSON.stringify([
            { item: "Bateria em condições", resposta: "nao_conforme" },
            { item: "Teclado em condições", resposta: "conforme" }
        ]), ids.usuarios[0]]
    );
    await pool.query(
        `INSERT INTO emprestimos_ativos (ativo_id,patrimonio,tipo_ativo_id,responsavel,setor_responsavel_id,status_anterior,prazo_devolucao,usuario_saida_id,usuario_saida_nome)
         VALUES ($1,$2,$3,'Responsável LGPD',$4,'disponivel',NOW()-INTERVAL '1 day',$5,'Administrador Exportação')`,
        [ids.ativos[2], ativosDados[2][2], ids.tipos[0], ids.setores[0], admin.rows[0].id]
    );
    for (let i = 0; i < 2; i += 1) {
        await pool.query(
            `INSERT INTO historico_ativos (ativo_id,patrimonio,tipo_ativo_id,usuario_id,usuario_nome,acao,descricao,setor_novo_id,status_novo,campos_alterados)
             SELECT id,patrimonio,tipo_ativo_id,$2,'Administrador Exportação','teste_exportacao','Descrição longa',$3,status,'["status"]'::jsonb
             FROM ativos WHERE id=$1`,
            [ids.ativos[i], admin.rows[0].id, ids.setores[i]]
        );
    }
    servidor = app.listen(0);
    await new Promise((resolve) => servidor.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(async () => {
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    if (ids.sessoes.length) await pool.query("DELETE FROM sessoes WHERE token_hash = ANY($1::text[])", [ids.sessoes]);
    if (ids.ativos.length) {
        await pool.query("DELETE FROM execucoes_checklist WHERE ativo_id = ANY($1::int[])", [ids.ativos]);
        await pool.query("DELETE FROM historico_ativos WHERE ativo_id = ANY($1::int[])", [ids.ativos]);
        await pool.query("DELETE FROM emprestimos_ativos WHERE ativo_id = ANY($1::int[])", [ids.ativos]);
        await pool.query("DELETE FROM ativos WHERE id = ANY($1::int[])", [ids.ativos]);
    }
    if (ids.tipos.length) {
        await pool.query("DELETE FROM campos WHERE tipo_ativo_id = ANY($1::int[])", [ids.tipos]);
        await pool.query("DELETE FROM tipos_ativo WHERE id = ANY($1::int[])", [ids.tipos]);
    }
    if (ids.categorias.length) await pool.query("DELETE FROM categorias WHERE id = ANY($1::int[])", [ids.categorias]);
    if (ids.usuarios.length) await pool.query("DELETE FROM usuarios WHERE id = ANY($1::int[])", [ids.usuarios]);
    if (ids.setores.length) await pool.query("DELETE FROM setores WHERE id = ANY($1::int[])", [ids.setores]);
    await pool.end();
});

test("requisição sem autenticação retorna 401", async () => {
    assert.equal((await requisicao("/api/exportacoes/inventario.csv")).status, 401);
});

test("admin exporta CSV com BOM, headers, acentos e proteção de fórmula", async () => {
    const r = await requisicao("/api/exportacoes/inventario.csv", tokens.admin);
    const buffer = Buffer.from(await r.arrayBuffer());
    const texto = buffer.toString("utf8");
    assert.equal(r.status, 200);
    assert.equal(buffer.subarray(0, 3).toString("hex"), "efbbbf");
    assert.match(r.headers.get("content-type"), /text\/csv/);
    assert.match(r.headers.get("cache-control"), /no-store/);
    assert.match(r.headers.get("content-disposition"), /inventario-ativos-\d{4}-\d{2}-\d{2}\.csv/);
    assert.match(texto, /Patrimônio/);
    assert.match(texto, /ação/);
    assert.match(texto, /'=SOMA/);
    assert.match(texto, /Identificação \(Tipo Exportação/);
});

test("usuário de setor fica isolado do outro setor", async () => {
    const r = await requisicao("/api/exportacoes/inventario.csv", tokens.setor1);
    const texto = Buffer.from(await r.arrayBuffer()).toString("utf8");
    assert.match(texto, /LAB-EXP-A/);
    assert.doesNotMatch(texto, /LAB-EXP-B/);
});

test("forçar outro setor na query retorna 403", async () => {
    const r = await requisicao(`/api/exportacoes/inventario.csv?setor_id=${ids.setores[1]}`, tokens.setor1);
    assert.equal(r.status, 403);
});

test("filtros individuais e combinados são aplicados", async () => {
    const consultas = [
        `patrimonio=LAB-EXP-A`, `categoria_id=${ids.categorias[0]}`,
        `tipo_id=${ids.tipos[0]}`, `setor_id=${ids.setores[0]}`,
        `status=em_uso`, `data_inicial=${hoje}`, `data_final=${hoje}`,
        `categoria_id=${ids.categorias[0]}&tipo_id=${ids.tipos[0]}&status=em_uso`
    ];
    for (const query of consultas) {
        const r = await requisicao(`/api/exportacoes/inventario.csv?${query}`, tokens.admin);
        assert.equal(r.status, 200, query);
        assert.ok(Number(r.headers.get("x-total-registros")) >= 1, query);
    }
});

test("resultado vazio preserva cabeçalho", async () => {
    const r = await requisicao("/api/exportacoes/inventario.csv?patrimonio=INEXISTENTE-XYZ", tokens.admin);
    const texto = Buffer.from(await r.arrayBuffer()).toString("utf8");
    assert.equal(r.headers.get("x-total-registros"), "0");
    assert.match(texto, /Patrimônio/);
});

test("empréstimos e histórico respeitam escopo", async () => {
    const emprestimos = await requisicao("/api/exportacoes/emprestimos.csv?situacao=vencido", tokens.setor1);
    assert.equal(emprestimos.status, 200);
    assert.match(Buffer.from(await emprestimos.arrayBuffer()).toString("utf8"), /Responsável LGPD/);
    const historico = await requisicao("/api/exportacoes/historico.csv", tokens.setor1);
    const texto = Buffer.from(await historico.arrayBuffer()).toString("utf8");
    assert.match(texto, /LAB-EXP-A/);
    assert.doesNotMatch(texto, /LAB-EXP-B/);
});

test("histórico de checklist exporta respostas do ativo exato e respeita o acesso", async () => {
    const query = `tipo_checklist_id=${ids.tipos[0]}&patrimonio=${encodeURIComponent(patrimonioChecklist)}`;
    const csv = await requisicao(`/api/exportacoes/checklist.csv?${query}`, tokens.setor1);
    assert.equal(csv.status, 200);
    assert.equal(csv.headers.get("x-total-registros"), "1");
    const texto = Buffer.from(await csv.arrayBuffer()).toString("utf8");
    assert.match(texto, /Bateria em condições/);
    assert.match(texto, /Não conforme/);
    assert.match(texto, /Teclado em condições/);
    assert.match(texto, /Bateria viciada/);
    assert.equal((await requisicao(`/api/exportacoes/checklist.csv?${query}`, tokens.setor2)).status, 404);
    assert.equal((await requisicao("/api/exportacoes/checklist.csv", tokens.admin)).status, 400);
    const pdf = await requisicao(`/api/exportacoes/checklist.pdf?${query}`, tokens.setor1);
    assert.equal(pdf.status, 200);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
});

test("PDF é gerado no backend", async () => {
    const r = await requisicao("/api/exportacoes/status.pdf", tokens.admin);
    const buffer = Buffer.from(await r.arrayBuffer());
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/pdf/);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});

test("exportação completa é exclusiva do admin", async () => {
    assert.equal((await requisicao("/api/exportacoes/completa.zip", tokens.setor1)).status, 403);
});

test("ZIP contém CSVs, manifesto consistente e nenhum segredo", async () => {
    const r = await requisicao("/api/exportacoes/completa.zip", tokens.admin);
    const arquivos = extrairZip(Buffer.from(await r.arrayBuffer()));
    const esperados = ["ativos.csv","categorias.csv","tipos_ativos.csv","campos_personalizados.csv","setores.csv","status.csv","emprestimos.csv","historico_ativos.csv","movimentacoes_chaves.csv","movimentacoes_ferramentas.csv","manifesto.json"];
    esperados.forEach((nome) => assert.ok(arquivos.has(nome), nome));
    const manifesto = JSON.parse(arquivos.get("manifesto.json").toString("utf8"));
    assert.equal(manifesto.arquivos.length, esperados.length - 1);
    assert.match(manifesto.backup, /não substitui/i);
    assert.match(manifesto.limitacoes.join(" "), /imagens/i);
    const tudo = [...arquivos.values()].map((item) => item.toString("utf8")).join("\n");
    assert.doesNotMatch(tudo, /senha_hash|token_hash|inventario_sessao|DB_PASSWORD/i);
});

test("exportações não alteram empréstimos nem histórico", async () => {
    const antes = await pool.query("SELECT (SELECT COUNT(*) FROM emprestimos_ativos) AS e,(SELECT COUNT(*) FROM historico_ativos) AS h");
    await requisicao("/api/exportacoes/emprestimos.pdf", tokens.admin);
    await requisicao("/api/exportacoes/historico.csv", tokens.admin);
    const depois = await pool.query("SELECT (SELECT COUNT(*) FROM emprestimos_ativos) AS e,(SELECT COUNT(*) FROM historico_ativos) AS h");
    assert.deepEqual(depois.rows[0], antes.rows[0]);
});
