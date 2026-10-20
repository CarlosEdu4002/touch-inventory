require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const path = require("path");
const { version } = require("./package.json");

const initDatabase = require("./database/init");

const categoriasRoutes = require("./routes/categorias.routes");
const tiposAtivoRoutes = require("./routes/tiposAtivo.routes");
const ativosRoutes = require("./routes/ativos.routes");
const camposRoutes = require("./routes/campos.routes");
const authRoutes = require("./routes/auth.routes");
const setoresRoutes = require("./routes/setores.routes");
const gestaoRoutes = require("./routes/gestao.routes");
const nfcRoutes = require("./routes/nfc.routes");
const mapasRoutes = require("./routes/mapas.routes");
const exportacoesRoutes = require("./routes/exportacoes.routes");
const checklistsRoutes = require("./routes/checklists.routes");
const vinculosRoutes = require("./routes/vinculos.routes");
const authModel = require("./models/auth.model");
const { exigirUnidade } = require("./middlewares/unidade.middleware");
const {
    exigirAutenticacao
} = require("./middlewares/auth.middleware");

// =====================
// Configurações
// =====================

const app = express();
app.disable("etag");
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/versao", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ versao: version });
});

app.use(
    "/Imagens",
    express.static(path.join(__dirname, "../../Imagens"))
);

const { conteudoPrivado, arquivoProtegido } = require("./middlewares/arquivos.middleware");
app.use(["/api", "/uploads"], conteudoPrivado);
app.use("/uploads", exigirAutenticacao, exigirUnidade);
app.get("/uploads/ativos/:nome", arquivoProtegido("ativos"));
app.get("/uploads/plantas/:nome", arquivoProtegido("plantas"));
app.get("/uploads/checklists/:execucao/:nome", require("./controllers/checklists.controller").imagem);
app.use("/uploads", (req, res) => res.status(404).json({ erro: "Arquivo não encontrado" }));

app.use(
    express.static(path.join(__dirname, "../../FrontEnd"), {
        setHeaders(res, arquivo) {
            if (path.extname(arquivo) === ".html") {
                res.setHeader("Cache-Control", "private, no-store, max-age=0");
            }
        }
    })
);

// =====================
// Rotas
// =====================

app.use("/api/auth", authRoutes);
app.use("/api", exigirAutenticacao);
app.use("/api/unidades", require("./routes/unidades.routes"));
app.use("/api", exigirUnidade);
app.use("/api/setores", setoresRoutes);
app.use("/api/gestao", gestaoRoutes);
app.use("/api/nfc", nfcRoutes);
app.use("/api/mapas", mapasRoutes);
app.use("/api/exportacoes", exportacoesRoutes);
app.use("/api/checklists", checklistsRoutes);
app.use("/api/vinculos", vinculosRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/tipos", tiposAtivoRoutes);
app.use("/api/ativos", require("./routes/identidadeAtivos.routes"));
app.use("/api/campos", camposRoutes);
app.use("/api", ativosRoutes);
app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    res.status(erro.status || 500).json({ erro: "Não foi possível atender a requisição" });
});

// =====================
// Inicialização
// =====================

// Função: Inicializa o banco de dados e inicia o servidor HTTP na porta configurada.
async function iniciarServidor() {
    await initDatabase();
    await authModel.limparSessoesExpiradas();
    const pararLimpeza = require("./services/imagens.service").iniciarWorker();
    const pararLixeira = require("./services/lixeira.service").iniciarWorker();

    return new Promise((resolve) => {
        const servidor = app.listen(PORT, () => {
            console.log(
                `Servidor rodando em http://localhost:${PORT}`
            );
            resolve(servidor);
        });
        servidor.on("close", pararLimpeza);
        servidor.on("close", pararLixeira);
    });
}

if (require.main === module) {
    iniciarServidor().catch((erro) => {
        console.error("Erro ao iniciar o servidor:", erro);
        process.exit(1);
    });
}

module.exports = {
    app,
    iniciarServidor
};
