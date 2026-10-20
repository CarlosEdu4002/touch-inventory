const router = require("express").Router();
const controller = require("../controllers/vinculos.controller");

router.get("/candidatos", controller.candidatos);
router.get("/ativo/:tipo/:patrimonio", controller.detalhar);
router.get("/", controller.listar);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id/membros/:ativoId", controller.desvincular);

module.exports = router;
