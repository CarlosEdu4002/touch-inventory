const express = require("express");
const ativosController = require("../controllers/ativos.controller");

const router = express.Router();

router.get("/:tipo", ativosController.listar);
router.get("/:tipo/:id/historico", ativosController.historico);
router.post("/:tipo/:id/transferir", ativosController.transferir);
router.get("/:tipo/:id", ativosController.buscar);
router.post("/:tipo", ativosController.criar);
router.put("/:tipo/:id", ativosController.atualizar);
router.delete("/:tipo/:id", ativosController.remover);

module.exports = router;
