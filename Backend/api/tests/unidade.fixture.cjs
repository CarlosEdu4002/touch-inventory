const crypto = require("node:crypto");
const auth = require("../models/auth.model");

async function prepararPrimeiraUnidade(pool) {
    if (process.env.INVENTARIO_TEST_SCHEMA) throw new Error("A suíte multiunidades não aceita bypass de esquema");
    const atual = await pool.query("SELECT id FROM public.unidades ORDER BY id LIMIT 1");
    if (atual.rows.length) return atual.rows[0].id;
    const criada = await require("../services/unidades.service").criar({ nome: "Unidade de regressão" });
    return criada.id;
}

async function criarSessao(pool, token, usuario, unidadeId = 1) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await auth.criarSessao(hash, usuario.id);
    const setor = usuario.perfil === "admin" ? null : usuario.setor_id;
    if (usuario.perfil !== "admin") {
        if (!setor) throw new Error("Fixture de setor sem setor de acesso");
        await pool.query("INSERT INTO public.usuario_unidades(usuario_id,unidade_id,setor_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [usuario.id, unidadeId, setor]);
    }
    await pool.query("UPDATE public.sessoes SET unidade_id=$2,setor_id=$3,contexto_versao=1 WHERE token_hash=$1", [hash, unidadeId, setor]);
    return `inventario_sessao=${token}`;
}

async function contextoDaSessao(pool, cookie) {
    const token = /^inventario_sessao=([a-f0-9]+)$/.exec(cookie || "")?.[1];
    if (!token) return null;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const r = await pool.query("SELECT unidade_id,setor_id,contexto_versao FROM public.sessoes WHERE token_hash=$1 AND expira_em>NOW()", [hash]);
    const s = r.rows[0];
    return s?.unidade_id ? [s.unidade_id, s.setor_id || 0, s.contexto_versao].join(":") : null;
}

async function prepararPedido(pool, caminho, cookie, headers = {}) {
    const chave = await contextoDaSessao(pool, cookie);
    const arquivo = caminho.startsWith("/uploads/");
    const url = arquivo && chave && !new URL(caminho, "http://localhost").searchParams.has("contexto")
        ? caminho + (caminho.includes("?") ? "&" : "?") + "contexto=" + encodeURIComponent(chave)
        : caminho;
    return { url, headers: { ...(cookie ? { Cookie: cookie } : {}),
        ...(chave && !arquivo ? { "X-Inventario-Contexto": chave } : {}), ...headers } };
}

module.exports = { prepararPrimeiraUnidade, criarSessao, contextoDaSessao, prepararPedido };
