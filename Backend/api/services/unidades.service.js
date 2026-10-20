const model = require("../models/unidades.model");
function erro(mensagem,status=400) { const e=new Error(mensagem);e.status=status;return e; }
function logoDoBody(body) {
    if (body.logo === undefined) return {logo:null,mime:null,alterar:false};
    if (body.logo === null) return {logo:null,mime:null,alterar:true};
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.logo || "");
    if (!m) throw erro("Use uma logo PNG, JPEG ou WebP");
    const b=Buffer.from(m[2],"base64");
    if (!b.length || b.length>2*1024*1024) throw erro("A logo deve ter no máximo 2 MB");
    return {logo:b,mime:m[1],alterar:true};
}
function nomeValido(body) {
    const nome=String(body.nome || "").trim();
    if (!nome || nome.length>120) throw erro("Informe o nome da unidade (até 120 caracteres)");
    return nome;
}
async function criar(body) {
    const nome=nomeValido(body), logo=logoDoBody(body);
    try { return await model.criar(nome,logo.logo,logo.mime); }
    catch(e) { if(e.code==="23505")throw erro("Já existe uma unidade com esse nome",409);throw e; }
}
async function atualizar(id,body) {
    const nome=nomeValido(body),logo=logoDoBody(body);
    try {
        const r=await model.atualizar(Number(id),nome,logo.logo,logo.mime,logo.alterar);
        if(!r)throw erro("Unidade não encontrada",404);
        return r;
    } catch(e) { if(e.code==="23505")throw erro("Já existe uma unidade com esse nome",409);throw e; }
}
async function selecionar(usuario,token,id,setorInformado) {
    const unidade=await model.buscar(Number(id));
    if(!unidade)throw erro("Unidade não encontrada",404);
    const setores=await model.permissoes(usuario,unidade.id);
    if(usuario.perfil!=="admin" && !setores.length)throw erro("Acesso não autorizado a esta unidade",403);
    const setorId=usuario.perfil==="admin" ? null :
        (setorInformado === undefined ? setores[0] : Number(setorInformado));
    if(usuario.perfil!=="admin" && !setores.includes(setorId))throw erro("Setor não autorizado",403);
    await model.selecionar(token,unidade.id,setorId);
    return {id:unidade.id,nome:unidade.nome,setor_id:setorId};
}
module.exports={criar,atualizar,selecionar,erro};
