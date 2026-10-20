"use strict";

const express = require("express");
const exportacoesController = require("../controllers/exportacoes.controller");
const { exigirAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/opcoes", exportacoesController.opcoes);
router.get("/completa.zip", exigirAdmin, exportacoesController.completa);
router.get("/:relatorio.:formato", exportacoesController.relatorio);

module.exports = router;
