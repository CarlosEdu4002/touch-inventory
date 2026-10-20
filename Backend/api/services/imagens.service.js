const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const pool = require("../database/connection");
const transacao = require("../database/transacao");

const DIRETORIO = path.resolve(__dirname, "../../../uploads/ativos");
const FORMATOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const codigoFalha = (erro) => erro?.code || erro?.name || "desconhecido";
function validarNome(nome) {
    if (!/^[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(nome || "")) {
        throw new Error("Nome interno de imagem inválido");
    }
}
async function bloquear(nome, cliente) {
    if (!nome) return;
    validarNome(nome);
    await cliente.query("SELECT pg_advisory_xact_lock(hashtextextended('imagem:' || $1, 0))", [nome]);
}
async function agendar(nome, cliente, espera = 0) {
    if (!nome) return;
    validarNome(nome);
    await cliente.query(
        `INSERT INTO limpezas_imagens (arquivo, proxima_tentativa)
         VALUES ($1, NOW() + ($2 * INTERVAL '1 second'))
         ON CONFLICT (arquivo) DO NOTHING`, [nome, espera]
    );
}
async function preparar(valor) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(valor || ""));
    const bytes = match && Buffer.from(match[2], "base64");
    const assinatura = match && (match[1] === "image/png"
        ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
        : match[1] === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8
            : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
    if (!bytes?.length || bytes.length > 2 * 1024 * 1024 || !assinatura) {
        const erro = new Error("Imagem inválida. Use JPG, PNG ou WebP de até 2 MB");
        erro.status = 400; throw erro;
    }
    const nome = `${crypto.randomUUID()}.${FORMATOS[match[1]]}`;
    // Registro durável antes do filesystem: recupera inclusive interrupções do processo.
    await pool.query("INSERT INTO limpezas_imagens (arquivo, proxima_tentativa) VALUES ($1, NOW() + INTERVAL '15 minutes')", [nome]);
    try {
        await fs.mkdir(DIRETORIO, { recursive: true });
        await fs.writeFile(path.join(DIRETORIO, nome), bytes, { flag: "wx" });
        return nome;
    } catch (erro) {
        // EEXIST significa que esse arquivo não foi criado por esta preparação.
        if (erro.code === "EEXIST") await pool.query("DELETE FROM limpezas_imagens WHERE arquivo=$1", [nome]);
        else await compensar(nome);
        throw erro;
    }
}
async function confirmar(nome, cliente) {
    if (!nome) return;
    await bloquear(nome, cliente);
    const local = path.join(DIRETORIO, nome);
    const info = await fs.lstat(local);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Imagem preparada indisponível");
    // O bloqueio permanece até COMMIT/ROLLBACK; o worker não pode apagar a preparação.
    await cliente.query("DELETE FROM limpezas_imagens WHERE arquivo=$1", [nome]);
}
async function removerArquivo(nome) {
    validarNome(nome);
    const local = path.join(DIRETORIO, nome);
    try {
        const info = await fs.lstat(local);
        if (!info.isFile() || info.isSymbolicLink() ||
            path.dirname(await fs.realpath(local)) !== await fs.realpath(DIRETORIO)) {
            throw new Error("Arquivo de limpeza não é uma imagem regular do armazenamento");
        }
        await fs.unlink(local);
    } catch (erro) { if (erro.code !== "ENOENT") throw erro; }
}
async function processar(nomes) {
    const registros = await pool.query(
        `SELECT arquivo FROM limpezas_imagens
         WHERE proxima_tentativa <= NOW() AND ($1::TEXT[] IS NULL OR arquivo = ANY($1))
         ORDER BY proxima_tentativa LIMIT 50`, [nomes || null]
    );
    const resultado = { removidas: 0, referenciadas: 0, pendentes: 0 };
    for (const { arquivo } of registros.rows) {
        await transacao.executar(async cliente => {
            // Todos os escritores e limpadores seguem a mesma ordem de bloqueio.
            await bloquear(arquivo, cliente);
            const registro = await cliente.query(
                "SELECT arquivo FROM limpezas_imagens WHERE arquivo=$1 AND proxima_tentativa <= NOW() FOR UPDATE", [arquivo]);
            if (!registro.rows.length) return;
            if ((await cliente.query("SELECT 1 FROM ativos WHERE imagem=$1 LIMIT 1", [arquivo])).rows.length) {
                resultado.referenciadas++;
            } else {
                try { await module.exports.removerArquivo(arquivo); resultado.removidas++; }
                catch (erro) {
                    await cliente.query(
                        `UPDATE limpezas_imagens SET tentativas=tentativas+1, ultimo_erro=$2,
                         proxima_tentativa=NOW() + INTERVAL '1 minute' * LEAST(60, POWER(2, LEAST(tentativas, 6)))
                         WHERE arquivo=$1`, [arquivo, String(erro.code || erro.message).slice(0, 300)]);
                    resultado.pendentes++; return;
                }
            }
            // ENOENT também conclui; se o COMMIT falhar, repetir é seguro.
            await cliente.query("DELETE FROM limpezas_imagens WHERE arquivo=$1", [arquivo]);
        });
    }
    return resultado;
}
async function tentarLimpeza(nomes) {
    try { return await processar(nomes); }
    catch (erro) { console.error("Limpeza de imagens pendente; será repetida:", codigoFalha(erro)); }
}
async function compensar(nome) {
    if (!nome) return;
    try {
        await pool.query("UPDATE limpezas_imagens SET proxima_tentativa=NOW() WHERE arquivo=$1", [nome]);
        await tentarLimpeza([nome]);
    } catch (erro) { console.error("Preparação pendente de limpeza:", codigoFalha(erro)); }
}
function iniciarWorker() {
    let executando = false;
    async function tick() {
        if (executando) return;
        executando = true;
        try {
            if (process.env.INVENTARIO_TEST_SCHEMA) await tentarLimpeza();
            else {
                const unidades=require("../models/unidades.model");
                const contexto=require("../database/contexto-unidade");
                for(const schema of await unidades.schemasAtivos()) {
                    try { await contexto.executar(schema,()=>tentarLimpeza()); }
                    catch(erro) { console.error("Limpeza de imagens pendente em "+schema,codigoFalha(erro)); }
                }
            }
        } catch (erro) {
            console.error("Limpeza de imagens: falha ao listar unidades:", codigoFalha(erro));
        } finally { executando = false; }
    }
    function agendar() {
        void tick().catch(erro => console.error("Limpeza de imagens: falha inesperada no agendamento:",
            codigoFalha(erro)));
    }
    agendar();
    const timer = setInterval(agendar, 30000); timer.unref();
    return () => clearInterval(timer);
}
module.exports = { preparar, confirmar, bloquear, agendar, compensar, processar, tentarLimpeza, removerArquivo, iniciarWorker };
