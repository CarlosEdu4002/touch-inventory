const crypto=require("node:crypto");
module.exports=async pool=>{
    const row=async(sql,params=[]) => (await pool.query(sql,params)).rows[0];
    const setor=await row("INSERT INTO setores(nome) VALUES('Navegador lixeira') RETURNING id");
    const categoria=await row("INSERT INTO categorias(nome,setor_id) VALUES('Navegador lixeira',$1) RETURNING id",[setor.id]);
    const tipo=await row("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('Navegador lixeira',$1) RETURNING id",[categoria.id]);
    const usuario=await row("INSERT INTO usuarios(login,nome,senha_hash,perfil) VALUES('browser_lixeira','Operador de teste','sem-login','admin') RETURNING id,nome,perfil");
    const token=crypto.randomBytes(32).toString("hex");
    await require("../models/auth.model").criarSessao(crypto.createHash("sha256").update(token).digest("hex"),usuario.id);
    await require("./formularios.fixture.cjs").servico("ativos").criarAtivo(String(tipo.id),{patrimonio:"UI-DESKTOP",setor_id:setor.id},usuario);
    await require("./formularios.fixture.cjs").servico("ativos").criarAtivo(String(tipo.id),{patrimonio:"UI-MOBILE",setor_id:setor.id},usuario);
    return {token,tipoId:tipo.id};
};
