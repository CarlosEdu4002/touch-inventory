const express = require("express");
const tiposAtivoController = require(
    "../controllers/tiposAtivo.controller"
);
const camposController = require("../controllers/campos.controller");
const router = express.Router();

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

module.exports = router;
