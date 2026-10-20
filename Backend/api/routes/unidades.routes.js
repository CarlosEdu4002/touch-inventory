const express=require("express");
const model=require("../models/unidades.model");
const service=require("../services/unidades.service");
const {exigirAdmin}=require("../middlewares/auth.middleware");
const {conferirContexto}=require("../middlewares/unidade.middleware");
const router=express.Router();
function falha(res,e) { console.error(e);res.status(e.status||500).json({erro:e.status?e.message:"Erro ao acessar unidades"}); }
router.get("/",async(req,res)=>{try{res.json(await model.listar(req.usuario));}catch(e){falha(res,e)}});
router.post("/",exigirAdmin,async(req,res)=>{try{res.status(201).json(await service.criar(req.body));}catch(e){falha(res,e)}});
router.put("/:id",exigirAdmin,async(req,res)=>{try{res.json(await service.atualizar(req.params.id,req.body));}catch(e){falha(res,e)}});
router.get("/:id/logo",async(req,res)=>{
    try {
        const unidade=await model.buscar(Number(req.params.id));
        if(!unidade || !unidade.logo)return res.status(404).end();
        const permitidos=await model.permissoes(req.usuario,unidade.id);
        if(req.usuario.perfil!=="admin" && !permitidos.length)return res.status(403).end();
        res.set("Content-Type",unidade.logo_mime);
        res.set("X-Content-Type-Options","nosniff");
        res.send(unidade.logo);
    } catch(e){falha(res,e)}
});
router.post("/setor/selecionar",conferirContexto,async(req,res)=>{
    try {
        if(!req.usuario.unidade_id)throw service.erro("Selecione uma unidade",409);
        res.json(await service.selecionar(req.usuario,req.tokenSessaoHash,req.usuario.unidade_id,req.body.setor_id));
    } catch(e){falha(res,e)}
});
router.get("/:id/setores",async(req,res)=>{
    try {
        const unidade=await model.buscar(Number(req.params.id));
        if(!unidade)return res.status(404).json({erro:"Unidade não encontrada"});
        const permitidos=await model.permissoes(req.usuario,unidade.id);
        if(req.usuario.perfil!=="admin" && !permitidos.length)return res.status(403).json({erro:"Acesso negado"});
        if(!/^public$|^unidade_[1-9][0-9]*$/.test(unidade.schema_nome))throw new Error("Esquema inválido");
        const pool=require("../database/connection");
        const r=await pool.query('SELECT id,nome,ativo FROM "'+unidade.schema_nome+'".setores ORDER BY nome');
        res.json(r.rows);
    } catch(e){falha(res,e)}
});
router.post("/:id/selecionar",async(req,res)=>{
    try {res.json(await service.selecionar(req.usuario,req.tokenSessaoHash,req.params.id,req.body.setor_id));}
    catch(e){falha(res,e)}
});
module.exports=router;
