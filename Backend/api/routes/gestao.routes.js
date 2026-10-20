// =====================
// Dependências e configurações
// =====================

const express = require("express");
const gestaoController = require("../controllers/gestao.controller");
const { exigirAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/dashboard", gestaoController.dashboard);
router.get("/emprestimos", gestaoController.listarEmprestimos);
router.get("/status", gestaoController.listarStatus);
router.put("/status/:codigo", exigirAdmin, gestaoController.salvarStatus);
router.get("/usuarios", exigirAdmin, gestaoController.listarUsuarios);
router.get("/usuarios/:id/acessos", exigirAdmin, gestaoController.acessosUsuario);
router.post("/usuarios", exigirAdmin, gestaoController.criarUsuario);
router.put("/usuarios/:id", exigirAdmin, gestaoController.atualizarUsuario);
router.post(
    "/usuarios/:id/encerrar-sessoes",
    exigirAdmin,
    gestaoController.encerrarSessoes
);

// =====================
// Exportações
// =====================

module.exports = router;
