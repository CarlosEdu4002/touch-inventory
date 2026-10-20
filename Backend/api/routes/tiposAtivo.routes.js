// =====================
// Dependências e configurações
// =====================

const express = require("express");
const tiposAtivoController = require(
    "../controllers/tiposAtivo.controller"
);
const camposController = require("../controllers/campos.controller");
const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/", tiposAtivoController.listar);

router.get(
    "/categoria/:categoriaId",
    tiposAtivoController.listarPorCategoria
);

router.get("/:tipoId/campos", camposController.listarPorTipo);
router.get("/:id", tiposAtivoController.buscar);
router.post("/", tiposAtivoController.criar);
router.put("/:id", tiposAtivoController.atualizar);
router.delete("/:id", tiposAtivoController.remover);

// =====================
// Exportações
// =====================

module.exports = router;
