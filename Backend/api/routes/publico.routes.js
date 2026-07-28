const express = require("express");
const publicoController = require("../controllers/publico.controller");

const router = express.Router();

router.get("/ativos/:tipo/:id", publicoController.buscarAtivo);

module.exports = router;
