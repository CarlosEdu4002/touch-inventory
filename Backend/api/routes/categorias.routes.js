// =====================
// Dependências e configurações
// =====================

const express = require("express");
const categoriasController = require(
    "../controllers/categorias.controller"
);
const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/", categoriasController.listar);
router.get("/:id", categoriasController.buscar);
router.post("/", categoriasController.criar);
router.put("/:id", categoriasController.atualizar);
router.delete("/:id", categoriasController.remover);

// =====================
// Exportações
// =====================

module.exports = router;
