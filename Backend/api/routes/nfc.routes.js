// =====================
// Dependências e configurações
// =====================

const express = require("express");
const nfcController = require("../controllers/nfc.controller");

const router = express.Router();

// =====================
// Definição das rotas
// =====================

router.get("/tags/:uid", nfcController.buscar);
router.post("/tags/:uid", nfcController.vincular);

// =====================
// Exportações
// =====================

module.exports = router;
