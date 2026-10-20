const express = require("express");
const mapasController = require("../controllers/mapas.controller");
const { exigirAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", mapasController.listar);
router.get("/:id", mapasController.detalhar);
router.post("/", exigirAdmin, mapasController.criar);
router.put("/:id", exigirAdmin, mapasController.atualizar);
router.delete("/:id", exigirAdmin, mapasController.remover);
router.post("/ambientes/novo", exigirAdmin, mapasController.criarAmbiente);
router.put("/ambientes/:id", exigirAdmin, mapasController.atualizarAmbiente);
router.delete("/ambientes/:id", exigirAdmin, mapasController.removerAmbiente);
router.put("/ativos/:id/posicao", mapasController.moverAtivo);

module.exports = router;
