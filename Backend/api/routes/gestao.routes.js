const express = require("express");
const gestaoController = require("../controllers/gestao.controller");
const { exigirAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/dashboard", gestaoController.dashboard);
router.get("/status", gestaoController.listarStatus);
router.put("/status/:codigo", exigirAdmin, gestaoController.salvarStatus);
router.get("/usuarios", exigirAdmin, gestaoController.listarUsuarios);
router.post("/usuarios", exigirAdmin, gestaoController.criarUsuario);
router.put("/usuarios/:id", exigirAdmin, gestaoController.atualizarUsuario);
router.post(
    "/usuarios/:id/encerrar-sessoes",
    exigirAdmin,
    gestaoController.encerrarSessoes
);

module.exports = router;
