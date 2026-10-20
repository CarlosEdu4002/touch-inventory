const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const unidadeFixture = require("./unidade.fixture.cjs");

module.exports = async function executar(pool, base) {
    const arquivos = [];
    const raiz = path.resolve(__dirname, "../../..");
    const segredo = "VALOR_PRIVADO_REGRESSAO";
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkXkAAAAASUVORK5CYII=", "base64");
    const pdf = await new Promise(resolve => {
        const doc = new PDFDocument(); const partes = [];
        doc.on("data", b => partes.push(b)); doc.on("end", () => resolve(Buffer.concat(partes)));
        doc.text("Planta compartilhada de teste"); doc.end();
    });
    async function arquivo(classe, extensao, bytes) {
        const nome = `${crypto.randomUUID()}.${extensao}`;
        const local = path.join(raiz, "uploads", classe, nome);
        await fs.mkdir(path.dirname(local), { recursive: true });
        await fs.writeFile(local, bytes, { flag: "wx" }); arquivos.push(local); return nome;
    }
    async function linha(sql, params = []) { return (await pool.query(sql, params)).rows[0]; }
    async function requisicao(url, cookie = "", method = "GET", body, headers = {}) {
        body=await require("./formularios.fixture.cjs").pedido(url,method,body);
        const pedido = await unidadeFixture.prepararPedido(pool,url,cookie,{ ...(body ? { "Content-Type": "application/json" } : {}), ...headers });
        const r = await fetch(base + pedido.url, {
            method, headers: pedido.headers,
            body: body ? JSON.stringify(body) : undefined, redirect: "manual"
        });
        const bytes = Buffer.from(await r.arrayBuffer());
        return { status: r.status, headers: r.headers, bytes, text: bytes.toString(), json: () => JSON.parse(bytes) };
    }
    const a = await linha("INSERT INTO setores(nome) VALUES('Setor segurança A') RETURNING id");
    const b = await linha("INSERT INTO setores(nome) VALUES('Setor segurança B') RETURNING id");
    const ca = await linha("INSERT INTO categorias(nome,setor_id) VALUES('Segurança A',$1) RETURNING id", [a.id]);
    const cb = await linha("INSERT INTO categorias(nome,setor_id) VALUES('Segurança B',$1) RETURNING id", [b.id]);
    const ta = await linha("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Tipo segurança A',$1) RETURNING id", [ca.id]);
    const tb = await linha("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Tipo segurança B',$1) RETURNING id", [cb.id]);
    const campo = await linha("INSERT INTO campos(tipo_ativo_id,nome,label,tipo,visivel) VALUES($1,'privado','Privado','texto',FALSE) RETURNING id", [ta.id]);
    await linha("INSERT INTO campos(tipo_ativo_id,nome,label,tipo) VALUES($1,'visivel','Visível','texto') RETURNING id", [ta.id]);
    const hash = await require("../utils/senha").criarHashSenha(crypto.randomBytes(24).toString("hex"));
    const cookies = {}, usuarios = {};
    for (const [login, perfil, setor] of [["security_admin", "admin", null], ["security_a", "setor", a.id], ["security_b", "setor", b.id]]) {
        const u = await linha("INSERT INTO usuarios(login,nome,senha_hash,perfil,setor_id) VALUES($1,$1,$2,$3,$4) RETURNING *", [login, hash, perfil, setor]);
        const token = crypto.randomBytes(32).toString("hex");
        cookies[login] = await unidadeFixture.criarSessao(pool,token,u); usuarios[login] = u;
    }
    const admin = cookies.security_admin, setorA = cookies.security_a, setorB = cookies.security_b;
    try {
        const imagem = await arquivo("ativos", "png", png);
        // Alocado no setor B, mas a categoria pertence a A.
        const ativoA = await linha("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio,imagem,dados) VALUES($1,$2,'SEC-A',$3,$4) RETURNING id", [ta.id, b.id, imagem, { privado: segredo, visivel: "Permitido" }]);
        const ativoB = await linha("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,'SEC-B') RETURNING id", [tb.id, a.id]);
        for (const url of [`/api/ativos/${ativoA.id}/detalhes?unidade=1`, `/api/${ta.id}/SEC-A`, `/api/campos/${campo.id}`, `/api/mapas`, `/uploads/ativos/${imagem}`]) {
            const r = await requisicao(url); assert.equal(r.status, 401, url); assert.ok(!r.text.includes(segredo));
            assert.match(r.headers.get("cache-control"), /no-store/);
        }
        for (const cookie of [admin, setorA]) {
            assert.equal((await requisicao(`/api/campos/${campo.id}`, cookie)).status, 200);
            assert.equal((await requisicao(`/api/tipos/${ta.id}/campos`, cookie)).status, 200);
            const r = await requisicao(`/api/ativos/${ativoA.id}/detalhes?unidade=1`, cookie);
            assert.equal(r.status, 200); assert.ok(!r.text.includes(segredo)); assert.equal(r.json().ativo.visivel, "Permitido");
            const img = await requisicao(`/uploads/ativos/${imagem}`, cookie);
            assert.equal(img.status, 200); assert.deepEqual(img.bytes, png); assert.match(img.headers.get("cache-control"), /no-store/);
            assert.equal(img.headers.get("etag"), null); assert.equal(img.headers.get("last-modified"), null);
        }
        for (const url of [`/api/campos/${campo.id}`, `/api/tipos/${ta.id}/campos`, `/api/ativos/${ativoA.id}/detalhes?unidade=1`, `/api/${ta.id}/SEC-A`, `/uploads/ativos/${imagem}`]) {
            assert.equal((await requisicao(url, setorB)).status, 404, url);
        }
        assert.equal((await requisicao(`/uploads/ativos/${imagem}`, "", "HEAD")).status, 401);
        assert.equal((await requisicao(`/uploads/ativos/${imagem}`, setorA, "HEAD")).status, 200);
        const semAssociacao = await arquivo("ativos", "png", png);
        assert.equal((await requisicao(`/uploads/ativos/${semAssociacao}`, admin)).status, 404);
        // Mudança da autorização no banco é considerada na próxima requisição.
        await pool.query("UPDATE categorias SET setor_id=$1 WHERE id=$2", [b.id, ca.id]);
        assert.equal((await requisicao(`/uploads/ativos/${imagem}`, setorA)).status, 404);
        assert.equal((await requisicao(`/api/ativos/${ativoA.id}/detalhes?unidade=1`, setorA)).status, 404);
        assert.equal((await requisicao(`/uploads/ativos/${imagem}`, setorB)).status, 200);
        await pool.query("UPDATE categorias SET setor_id=$1 WHERE id=$2", [a.id, ca.id]);
        const cadastro = { patrimonio: "SEC-NEGADO", setor_id: a.id };
        assert.equal((await requisicao(`/api/${tb.id}`, setorA, "POST", cadastro)).status, 404);
        assert.equal((await linha("SELECT COUNT(*)::int AS n FROM ativos WHERE patrimonio='SEC-NEGADO'")).n, 0);
        assert.equal((await requisicao(`/api/${ta.id}`, setorA, "POST", { patrimonio: "SEC-NOVO", setor_id: b.id })).status, 201);
        assert.equal((await requisicao(`/api/${tb.id}`, admin, "POST", { patrimonio: "SEC-ADMIN", setor_id: a.id })).status, 201);
        await assert.rejects(require("../models/ativos.model").criar(tb.id, a.id, "SEC-DIRETO", "em_uso", {}, usuarios.security_a.id, usuarios.security_a), { status: 404 });
        assert.equal((await linha("SELECT COUNT(*)::int AS n FROM ativos WHERE patrimonio='SEC-DIRETO'")).n, 0);
        const novoCampo = { tipo_ativo_id: tb.id, nome: "invasao", label: "Invasão", tipo: "texto" };
        assert.equal((await requisicao(`/api/campos/${campo.id}`, setorA, "PUT", novoCampo)).status, 404);
        assert.equal((await linha("SELECT tipo_ativo_id FROM campos WHERE id=$1", [campo.id])).tipo_ativo_id, ta.id);
        assert.equal((await requisicao(`/api/${ta.id}/SEC-A`, setorB, "PUT", { patrimonio: "INVASAO", setor_id: b.id })).status, 404);
        assert.equal((await requisicao(`/api/${ta.id}/SEC-A`, setorB, "DELETE")).status, 404);
        const vincular = async (uid, tipo, patrimonio, cookie = setorA) => {
            const ativo = await linha("SELECT id FROM ativos WHERE tipo_ativo_id=$1 AND patrimonio=$2",[tipo,patrimonio]);
            return requisicao(`/api/nfc/tags/${uid}`, cookie, "POST", { ativo_id: ativo?.id });
        };
        assert.equal((await vincular("AABBCCDD", tb.id, "SEC-B")).status, 404);
        assert.equal((await vincular("AABBCCDD", tb.id, "SEC-B", setorB)).status, 200);
        assert.equal((await vincular("AABBCCDD", ta.id, "SEC-A")).status, 409);
        assert.equal((await vincular("AABBCCDD", ta.id, "SEC-A", admin)).status, 409);
        assert.equal((await linha("SELECT ativo_id FROM tags_nfc WHERE uid='AABBCCDD'")).ativo_id, ativoB.id);
        assert.equal((await vincular("11223344", ta.id, "SEC-A")).status, 200);
        assert.equal((await vincular("11223344", ta.id, "SEC-A")).status, 200);
        assert.equal((await vincular("55667788", ta.id, "SEC-A")).status, 409);
        assert.equal((await requisicao("/api/nfc/tags/11223344", setorB)).status, 404);

        // Barreira só na aquisição: SQL e transações reais em conexões independentes.
        async function concorrentes(pedidos) {
            const conectar = pool.connect.bind(pool); const pids = [];
            let liberar; const barreira = new Promise(resolve => { liberar = resolve; });
            pool.connect = (...args) => args.length ? conectar(...args) : (async () => {
                const cliente = await conectar(); pids.push(cliente.processID);
                if (pids.length === pedidos.length) liberar();
                await barreira; return cliente;
            })();
            try {
                const respostas = await Promise.all(pedidos.map(fn => fn()));
                assert.equal(new Set(pids).size, pedidos.length);
                return respostas.map(r => r.status).sort();
            } finally { pool.connect = conectar; }
        }
        assert.deepEqual(await concorrentes([
            () => vincular("CCDD0011", ta.id, "SEC-NOVO"),
            () => vincular("CCDD0011", tb.id, "SEC-ADMIN", admin)
        ]), [200, 409]);
        await pool.query("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,'SEC-RACE')", [ta.id, a.id]);
        assert.deepEqual(await concorrentes([
            () => vincular("CCDD0022", ta.id, "SEC-RACE"),
            () => vincular("CCDD0033", ta.id, "SEC-RACE")
        ]), [200, 409]);
        const uid = (await linha("SELECT uid FROM tags_nfc n JOIN ativos a ON a.id=n.ativo_id WHERE a.patrimonio='SEC-RACE'")).uid;
        assert.deepEqual(await concorrentes([
            () => vincular(uid, ta.id, "SEC-RACE"), () => vincular(uid, ta.id, "SEC-RACE")
        ]), [200, 200]);
        console.log("PASSOU: autorização de API, IDs manipulados e concorrência NFC em conexões independentes.");

        const arquivoPdf = await arquivo("plantas", "pdf", pdf);
        const planta = await linha("INSERT INTO plantas_baixas(nome,arquivo,largura,altura) VALUES('Planta segurança',$1,612,792) RETURNING id", [arquivoPdf]);
        const ambiente = await linha("INSERT INTO ambientes_mapa(planta_id,setor_id,nome,poligono,centro_x,centro_y) VALUES($1,$2,'Ambiente compartilhado','[]',0.5,0.5) RETURNING id", [planta.id, b.id]);
        await pool.query("INSERT INTO posicoes_ativos(ativo_id,ambiente_id,x,y) VALUES($1,$3,0.5,0.5),($2,$3,0.6,0.6)", [ativoA.id, ativoB.id, ambiente.id]);
        const plantaPng = await linha("INSERT INTO plantas_baixas(nome,arquivo,largura,altura) VALUES('Planta imagem',$1,1,1) RETURNING id", [await arquivo("plantas", "png", png)]);
        for (const cookie of [admin, setorA, setorB]) {
            const detalhes = (await requisicao(`/api/mapas/${planta.id}`, cookie)).json();
            assert.equal(detalhes.ambientes.length, 1);
            assert.equal(detalhes.ativos.length, cookie === admin ? 2 : 1);
            assert.equal(detalhes.ambientes[0].total_ativos, cookie === admin ? 2 : 1);
            const lista = (await requisicao("/api/mapas", cookie)).json();
            assert.equal(lista.find(p => p.id === planta.id).total_ativos, cookie === admin ? 2 : 1);
            const r = await requisicao(detalhes.imagem_url, cookie); assert.equal(r.status, 200); assert.deepEqual(r.bytes, pdf);
            const parcial = await requisicao(detalhes.imagem_url, cookie, "GET", null, { Range: "bytes=0-4" });
            assert.equal(parcial.status, 206); assert.equal(parcial.text, "%PDF-");
            const ip = (await requisicao(`/api/mapas/${plantaPng.id}`, cookie)).json();
            assert.deepEqual((await requisicao(ip.imagem_url, cookie)).bytes, png);
        }
        assert.equal((await requisicao(`/uploads/plantas/${arquivoPdf}`)).status, 401);
        await pool.query("UPDATE plantas_baixas SET ativo=FALSE WHERE id=$1", [planta.id]);
        assert.equal((await requisicao(`/uploads/plantas/${arquivoPdf}`, setorA)).status, 404);
        assert.equal((await requisicao(`/api/mapas/${planta.id}`, setorA)).status, 404);
        assert.equal((await requisicao(`/uploads/plantas/${arquivoPdf}`, admin)).status, 200);
        await pool.query("UPDATE plantas_baixas SET ativo=TRUE WHERE id=$1", [planta.id]);
        assert.equal((await requisicao(`/api/mapas/ativos/${ativoB.id}/posicao`, setorA, "PUT", { ambiente_id: ambiente.id, x: 0.5, y: 0.5 })).status, 404);
        for (const url of [
            `/uploads/ativos/sub/${imagem}`, `/uploads/ativos/%2e%2e%2fplantas%2f${arquivoPdf}`,
            `/uploads/ativos/%2e%2e%5cplantas%5c${arquivoPdf}`, `/uploads/ativos/${imagem}%00`,
            `/uploads/ativos/${imagem}:stream`, `/uploads/plantas/${arquivoPdf}.`,
            `/FrontEnd/../uploads/ativos/${imagem}`, `/Backend/../uploads/ativos/${imagem}`,
            `/ativos/${imagem}`, `/plantas/${arquivoPdf}`, `/Imagens/${imagem}`,
            `/uploads/ativos/${imagem.toUpperCase()}`
        ]) {
            const r = await requisicao(url, setorB); assert.ok(r.status >= 400, `${url}: ${r.status}`);
            assert.ok(!r.bytes.equals(png) && !r.bytes.equals(pdf));
        }
        console.log("PASSOU: arquivos protegidos, PDF Range, plantas compartilhadas e contagens filtradas.");

        if (process.env.TEST_BROWSER === "1") {
            await require("./seguranca.browser.cjs")({ base, ta, imagem, arquivoPdf, setorA, setorB });
        } else console.log("Navegador não executado (habilitar TEST_BROWSER=1 com Playwright disponível).");
        const condicional = await requisicao(`/uploads/ativos/${imagem}`, setorB, "GET", null, { "If-None-Match": "*", "If-Modified-Since": new Date().toUTCString() });
        assert.equal(condicional.status, 404);
        await requisicao("/api/auth/logout", setorA, "POST");
        assert.equal((await requisicao(`/uploads/ativos/${imagem}`, setorA)).status, 401);
        await pool.query("UPDATE usuarios SET ativo=FALSE WHERE id=$1", [usuarios.security_b.id]);
        assert.equal((await requisicao(`/uploads/plantas/${arquivoPdf}`, setorB)).status, 401);
        console.log("PASSOU: logout, revogação e ausência de cache privado/304 sem autorização.");
    } finally {
        // Só arquivos criados por este teste com nomes UUID e flag wx.
        for (const local of arquivos) await fs.unlink(local);
    }
};
