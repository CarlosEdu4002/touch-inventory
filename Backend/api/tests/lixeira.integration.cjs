const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs/promises");
const path=require("node:path");
const lixeira=require("../services/lixeira.service");
const imagens=require("../services/imagens.service");
const unidadeFixture=require("./unidade.fixture.cjs");
const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkXkAAAAASUVORK5CYII=";

module.exports=async function executar(pool,base) {
    const row=async(sql,params=[]) => (await pool.query(sql,params)).rows[0];
    const setor=await row("INSERT INTO setores(nome) VALUES('LIX-A') RETURNING id");
    const outroSetor=await row("INSERT INTO setores(nome) VALUES('LIX-B') RETURNING id");
    const categoria=await row("INSERT INTO categorias(nome,setor_id) VALUES('LIX-CAT',$1) RETURNING id",[setor.id]);
    const categoriaB=await row("INSERT INTO categorias(nome,setor_id) VALUES('LIX-CAT-B',$1) RETURNING id",[outroSetor.id]);
    const tipo=await row("INSERT INTO tipos_ativo(nome,categoria_id,permite_emprestimo,permite_vinculo,permite_checklist) VALUES('LIX-TIPO',$1,TRUE,TRUE,TRUE) RETURNING id",[categoria.id]);
    await row("INSERT INTO tipos_ativo(nome,categoria_id) VALUES('LIX-TIPO',$1) RETURNING id",[categoriaB.id]);
    const cookies={};
    for(const [login,perfil,setorId] of [["lix_admin","admin",null],["lix_a","setor",setor.id],["lix_b","setor",outroSetor.id]]) {
        const u=await row("INSERT INTO usuarios(login,nome,senha_hash,perfil,setor_id) VALUES($1,$1,'teste-sem-login',$2,$3) RETURNING id",[login,perfil,setorId]);
        const token=crypto.randomBytes(32).toString("hex");
        cookies[login]=await unidadeFixture.criarSessao(pool,token,{...u,perfil,setor_id:setorId});
    }
    async function request(url,method="GET",body,cookie=cookies.lix_a) {
        body=await require("./formularios.fixture.cjs").pedido(url,method,body);
        const pedido=await unidadeFixture.prepararPedido(pool,url,cookie,body?{"Content-Type":"application/json"}:{});
        const r=await fetch(base+pedido.url,{method,headers:pedido.headers,body:body?JSON.stringify(body):undefined});
        return {status:r.status,body:await r.json().catch(()=>null)};
    }
    const body={patrimonio:"LIX-PAT",setor_id:setor.id,imagem:png};
    assert.equal((await request(`/api/${tipo.id}`,"POST",body)).status,201);
    const ativo=await row("SELECT * FROM ativos WHERE patrimonio=$1",[body.patrimonio]);
    const api=`/api/ativos/${ativo.id}`;
    const arquivo=path.resolve(__dirname,"../../../uploads/ativos",ativo.imagem);
    const historicoOriginal=(await request(api+"/historico")).body;
    assert.equal(historicoOriginal.length,1);
    assert.equal((await request(`/api/LIX-TIPO`,"GET",undefined,cookies.lix_admin)).status,409);
    const numerico=await row("INSERT INTO tipos_ativo(nome,categoria_id) VALUES($1,$2) RETURNING id",[String(tipo.id),categoriaB.id]);
    await pool.query("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio) VALUES($1,$2,'LIX-NUMERICO')",[numerico.id,outroSetor.id]);
    assert.deepEqual((await request(`/api/${tipo.id}`,"GET",undefined,cookies.lix_admin)).body.map(a=>a.id),[ativo.id]);
    assert.equal((await request(api)).body.id,ativo.id);
    assert.equal((await request(api,"GET",undefined,cookies.lix_b)).status,404);
    assert.equal((await request(api,"DELETE",{})).status,400);
    assert.equal((await request(api,"PUT",{patrimonio:"ALTERADO",setor_id:setor.id})).status,400);
    // Histórico técnico e movimentações pertencem ao ID, não ao código reutilizável.
    await pool.query("INSERT INTO execucoes_checklist(ativo_id,patrimonio,tipo_ativo_id,data_prevista,resultado,respostas,usuario_nome) VALUES($1,$2,$3,CURRENT_DATE,'conforme','[]','Teste')",[ativo.id,body.patrimonio,tipo.id]);
    const emprestimo=await row("INSERT INTO emprestimos_ativos(ativo_id,patrimonio,tipo_ativo_id,responsavel,prazo_devolucao,usuario_saida_nome) VALUES($1,$2,$3,'Teste',NOW()+INTERVAL '1 day','Teste') RETURNING id",[ativo.id,body.patrimonio,tipo.id]);
    assert.equal((await request(api,"DELETE",{confirmar_exclusao:true})).status,409);
    await pool.query("UPDATE emprestimos_ativos SET devolvido_em=NOW() WHERE id=$1",[emprestimo.id]);
    const grupo=await row("INSERT INTO grupos_ativos(nome) VALUES('LIX-GRUPO') RETURNING id");
    await pool.query("INSERT INTO grupos_ativos_membros(grupo_id,ativo_id) VALUES($1,$2)",[grupo.id,ativo.id]);
    assert.equal((await request(api,"DELETE",{confirmar_exclusao:true})).status,409);
    await pool.query("DELETE FROM grupos_ativos WHERE id=$1",[grupo.id]);
    await pool.query("INSERT INTO tags_nfc(uid,ativo_id) VALUES('ABCDEF01',$1)",[ativo.id]);
    const excluir=await request(api,"DELETE",{confirmar_exclusao:true,forcar:true,recuperavel_ate:"2000-01-01"});
    assert.equal(excluir.status,200);
    const excluido=await row("SELECT * FROM ativos WHERE id=$1",[ativo.id]);
    const prazoMs=new Date(excluido.recuperavel_ate)-new Date(excluido.excluido_em);
    assert.ok(Math.abs(prazoMs-30*24*3600000)<100);
    await fs.access(arquivo);
    assert.equal((await request(api)).status,404);
    assert.equal((await request(api+"/detalhes?unidade=1")).status,404);
    assert.equal((await request(`/api/publico/ativos/${tipo.id}/${body.patrimonio}`)).status,404);
    assert.equal((await request(`/uploads/ativos/${ativo.imagem}`)).status,404);
    assert.equal((await request("/api/nfc/tags/ABCDEF01")).status,404);
    assert.ok(!(await request(`/api/${tipo.id}`)).body.some(a=>a.id===ativo.id));
    assert.ok(!(await require("../models/checklists.model").listar({perfil:"admin"})).some(a=>a.ativo_id===ativo.id));
    assert.ok(!(await require("../models/exportacoes.model").listarAtivos({perfil:"admin"})).some(a=>a.id===ativo.id));
    assert.equal((await request(`/api/${tipo.id}`,"POST",{patrimonio:body.patrimonio,setor_id:setor.id})).status,409);
    assert.equal((await request(api+"/restaurar","POST",{},cookies.lix_b)).status,404);
    assert.equal((await request("/api/ativos/lixeira","GET",undefined,cookies.lix_b)).body.length,0);
    assert.equal((await request("/api/ativos/log-exclusoes","GET",undefined,cookies.lix_b)).body.length,0);
    const naLixeira=(await request("/api/ativos/lixeira")).body.find(a=>a.id===ativo.id);
    assert.equal(naLixeira.pode_restaurar,true);
    assert.equal((await lixeira.limparExpirados()).excluidos,0);
    assert.equal((await request(api+"/restaurar","POST",{})).status,200);
    assert.equal((await request(api)).body.id,ativo.id);
    assert.equal((await request(`/uploads/ativos/${ativo.imagem}`)).status,200);
    assert.equal((await request(api+"/historico")).body.length,3);
    assert.equal((await row("SELECT count(*)::int n FROM execucoes_checklist WHERE ativo_id=$1",[ativo.id])).n,1);
    assert.equal((await request(api,"DELETE",{confirmar_exclusao:true})).status,200);
    await pool.query("UPDATE ativos SET excluido_em=NOW()-INTERVAL '31 days',recuperavel_ate=NOW() WHERE id=$1",[ativo.id]);
    assert.equal((await request(api+"/restaurar","POST",{})).status,409);
    assert.equal((await request(`/api/${tipo.id}`,"POST",{patrimonio:body.patrimonio,setor_id:setor.id})).status,409);
    assert.equal((await request(api+"/forcar-exclusao","POST",{})).status,404);
    // Falha na auditoria faz rollback de todas as eliminações.
    await pool.query(`CREATE FUNCTION falha_log_lixeira() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.acao='exclusao_definitiva' THEN RAISE EXCEPTION 'falha log induzida'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER falha_log BEFORE INSERT ON log_exclusoes_ativos FOR EACH ROW EXECUTE FUNCTION falha_log_lixeira()`);
    await assert.rejects(lixeira.limparExpirados(),/falha log induzida/);
    assert.ok(await row("SELECT id FROM ativos WHERE id=$1",[ativo.id]));
    assert.equal((await row("SELECT count(*)::int n FROM execucoes_checklist WHERE ativo_id=$1",[ativo.id])).n,1);
    await fs.access(arquivo);
    await pool.query("DROP TRIGGER falha_log ON log_exclusoes_ativos; DROP FUNCTION falha_log_lixeira()");
    // Limpeza de arquivo falha após COMMIT sem perder o registro para retentativa.
    const remover=imagens.removerArquivo;
    imagens.removerArquivo=async()=>{const erro=new Error("disco indisponível");erro.code="EACCES";throw erro;};
    try { assert.equal((await lixeira.limparExpirados()).excluidos,1); }
    finally {imagens.removerArquivo=remover;}
    assert.equal(await row("SELECT id FROM ativos WHERE id=$1",[ativo.id]),undefined);
    for(const tabela of ["historico_ativos","execucoes_checklist","emprestimos_ativos","tags_nfc"]) {
        assert.equal((await row(`SELECT count(*)::int n FROM ${tabela} WHERE ativo_id=$1`,[ativo.id])).n,0);
    }
    await fs.access(arquivo);
    assert.equal((await row("SELECT tentativas FROM limpezas_imagens WHERE arquivo=$1",[ativo.imagem])).tentativas,1);
    await pool.query("UPDATE limpezas_imagens SET proxima_tentativa=NOW() WHERE arquivo=$1",[ativo.imagem]);
    await imagens.processar([ativo.imagem]); await assert.rejects(fs.access(arquivo),{code:"ENOENT"});
    const log=(await request("/api/ativos/log-exclusoes")).body.filter(a=>a.ativo_id===ativo.id);
    assert.deepEqual(log.map(a=>a.acao),["exclusao_definitiva","exclusao","restauracao","exclusao"]);
    assert.equal((await request(`/api/${tipo.id}`,"POST",{patrimonio:body.patrimonio,setor_id:setor.id})).status,201);
    const novo=await row("SELECT id FROM ativos WHERE patrimonio=$1",[body.patrimonio]);
    assert.notEqual(novo.id,ativo.id);
    assert.equal((await request(`/api/ativos/${novo.id}/historico`)).body.length,1);
    assert.equal((await request(`/api/${tipo.id}/${body.patrimonio}/historico`)).body.length,1);
    assert.equal((await request(api+"/restaurar","POST",{})).status,404);
    const novoApi=`/api/ativos/${novo.id}`;
    assert.deepEqual((await Promise.all([request(novoApi,"DELETE",{confirmar_exclusao:true}),request(novoApi,"DELETE",{confirmar_exclusao:true})])).map(r=>r.status).sort(),[200,404]);
    assert.deepEqual((await Promise.all([request(novoApi+"/restaurar","POST",{}),request(novoApi+"/restaurar","POST",{})])).map(r=>r.status).sort(),[200,404]);
    await request(novoApi,"DELETE",{confirmar_exclusao:true});
    await pool.query("UPDATE ativos SET recuperavel_ate=clock_timestamp()+INTERVAL '500 milliseconds' WHERE id=$1",[novo.id]);
    const bloqueio=await pool.connect(); await bloqueio.query("BEGIN"); await bloqueio.query("SELECT id FROM ativos WHERE id=$1 FOR UPDATE",[novo.id]);
    const restauracaoAguardando=request(novoApi+"/restaurar","POST",{});
    try {
        await new Promise(resolve=>setTimeout(resolve,700));
        assert.equal((await lixeira.limparExpirados()).excluidos,0,"Worker não deve interferir em um registro bloqueado");
    } finally {await bloqueio.query("COMMIT");bloqueio.release();}
    assert.equal((await restauracaoAguardando).status,409,"Prazo é reavaliado depois de adquirir o bloqueio");
    const limpezas=await Promise.all([lixeira.limparExpirados(),lixeira.limparExpirados()]);
    assert.equal(limpezas.reduce((total,r)=>total+r.excluidos,0),1);
    assert.equal((await row("SELECT count(*)::int n FROM log_exclusoes_ativos WHERE ativo_id=$1 AND acao='exclusao_definitiva'",[novo.id])).n,1);
    console.log("PASSOU: ID permanente, homônimos, lixeira 30 dias, permissões, reserva/reuso, restauração e log durável; rollback, retentativa e concorrência no limite do prazo.");
};
