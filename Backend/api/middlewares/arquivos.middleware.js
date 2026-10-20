const path = require("node:path");
const fs = require("node:fs/promises");
const pool = require("../database/connection");

function conteudoPrivado(req, res, next) {
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.vary("Cookie");
    next();
}

// Somente nomes internos simples e associados no banco. Sem middleware estático.
function arquivoProtegido(classe) {
    const diretorio = path.resolve(__dirname, "../../../uploads", classe);
    return async (req, res, next) => {
        try {
            const nome = req.params.nome;
            if (!/^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|pdf)$/i.test(nome || "")) {
                return res.status(404).json({ erro: "Arquivo não encontrado" });
            }
            const usuario = req.usuario;
            const consulta = classe === "ativos"
                ? `SELECT a.id FROM ativos a
                   JOIN tipos_ativo t ON t.id = a.tipo_ativo_id
                   JOIN categorias c ON c.id = t.categoria_id
                   WHERE a.imagem = $1 AND a.excluido_em IS NULL AND ($2 = 'admin' OR c.setor_id = $3)`
                : `SELECT id FROM plantas_baixas
                   WHERE arquivo = $1 AND ($2 = 'admin' OR ativo = TRUE)`;
            const parametros = [nome, usuario.perfil];
            if (classe === "ativos") parametros.push(usuario.setor_id);
            if (!(await pool.query(consulta, parametros)).rows.length) {
                return res.status(404).json({ erro: "Arquivo não encontrado" });
            }
            const arquivo = path.join(diretorio, nome);
            // Não seguir links simbólicos de arquivos para fora do armazenamento.
            if ((await fs.lstat(arquivo)).isSymbolicLink() ||
                path.dirname(await fs.realpath(arquivo)) !== await fs.realpath(diretorio)) {
                return res.status(404).json({ erro: "Arquivo não encontrado" });
            }
            res.set("X-Content-Type-Options", "nosniff");
            res.sendFile(nome, { root: diretorio, cacheControl: false, lastModified: false, etag: false }, (erro) => {
                if (erro) next(erro);
            });
        } catch (erro) {
            if (erro.code === "ENOENT") return res.status(404).json({ erro: "Arquivo não encontrado" });
            next(erro);
        }
    };
}

module.exports = { conteudoPrivado, arquivoProtegido };
