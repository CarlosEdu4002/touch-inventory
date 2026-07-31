require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const initDatabase = require("./database/init");

const categoriasRoutes = require("./routes/categorias.routes");
const tiposAtivoRoutes = require("./routes/tiposAtivo.routes");
const ativosRoutes = require("./routes/ativos.routes");
const camposRoutes = require("./routes/campos.routes");
const authRoutes = require("./routes/auth.routes");
const setoresRoutes = require("./routes/setores.routes");
const gestaoRoutes = require("./routes/gestao.routes");
const publicoRoutes = require("./routes/publico.routes");
const authModel = require("./models/auth.model");
const {
    exigirAutenticacao
} = require("./middlewares/auth.middleware");

// =====================
// Configurações
// =====================

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "3mb" }));

app.use(
    "/Imagens",
    express.static(path.join(__dirname, "../../Imagens"))
);

app.use(
    "/uploads/ativos",
    express.static(path.join(__dirname, "../../uploads/ativos"), {
        fallthrough: false,
        maxAge: "1d"
    })
);

app.use(
    express.static(path.join(__dirname, "../../FrontEnd"))
);

// =====================
// Rotas
// =====================

app.use("/api/auth", authRoutes);
app.use("/api/publico", publicoRoutes);
app.use("/api", exigirAutenticacao);
app.use("/api/setores", setoresRoutes);
app.use("/api/gestao", gestaoRoutes);
app.use("/api/categorias", categoriasRoutes);
app.use("/api/tipos", tiposAtivoRoutes);
app.use("/api/campos", camposRoutes);
app.use("/api", ativosRoutes);

// =====================
// Inicialização
// =====================

async function iniciarServidor() {
    await initDatabase();
    await authModel.limparSessoesExpiradas();

    return new Promise((resolve) => {
        const servidor = app.listen(PORT, () => {
            console.log(
                `Servidor rodando em http://localhost:${PORT}`
            );
            resolve(servidor);
        });
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
