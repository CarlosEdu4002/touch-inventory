const express = require("express");
const camposController = require("../controllers/campos.controller");
const router = express.Router();

router.get("/:id", camposController.buscar);
router.post("/", camposController.criar);
router.put("/:id", camposController.atualizar);
router.delete("/:id", camposController.remover);

module.exports = router;
