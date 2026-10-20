// =====================
// Dependências e configurações
// =====================

const express = require("express");
const setoresController = require("../controllers/setores.controller");
const { exigirAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/", setoresController.listar);
router.post("/", exigirAdmin, setoresController.criar);
router.put("/:id", exigirAdmin, setoresController.atualizar);

// =====================
// Exportações
// =====================

module.exports = router;
