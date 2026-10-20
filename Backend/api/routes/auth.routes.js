// =====================
// Dependências e configurações
// =====================

const express = require("express");
const authController = require("../controllers/auth.controller");
const {
    exigirAutenticacao
} = require("../middlewares/auth.middleware");

const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/status", authController.status);
router.post("/configurar", authController.configurar);
router.post("/login", authController.login);
router.get("/me", exigirAutenticacao, authController.me);
router.post("/logout", exigirAutenticacao, authController.logout);

// =====================
// Exportações
// =====================

module.exports = router;
