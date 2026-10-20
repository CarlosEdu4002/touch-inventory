// =====================
// Dependências e configurações
// =====================

const express = require("express");
const camposController = require("../controllers/campos.controller");
const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/:id", camposController.buscar);
router.post("/", camposController.criar);
router.put("/:id", camposController.atualizar);
router.delete("/:id", camposController.remover);

// =====================
// Exportações
// =====================

module.exports = router;
