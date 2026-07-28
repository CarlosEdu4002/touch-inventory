const express = require("express");
const setoresController = require("../controllers/setores.controller");
const { exigirAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", setoresController.listar);
router.post("/", exigirAdmin, setoresController.criar);
router.put("/:id", exigirAdmin, setoresController.atualizar);

module.exports = router;
