const router = require("express").Router();
const controller = require("../controllers/checklists.controller");

router.get("/", controller.listar);
router.get("/:tipo/:patrimonio", controller.detalhar);
router.post("/:tipo/:patrimonio/executar", controller.executar);

module.exports = router;
