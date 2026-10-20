const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function testar(pool) {
    const ativos = require('../services/ativos.service');
    const checklists = require('../services/checklists.service');
    const tipos = require('../services/tiposAtivo.service');
    const vinculos = require('../services/vinculos.service');
    const abrirGrupo=async body=>({...body,revisoes:Object.fromEntries((await pool.query('SELECT id,revisao FROM ativos WHERE id=ANY($1::int[])',[body.ativo_ids])).rows.map(a=>[a.id,a.revisao]))});
    const campos = require('../services/campos.service');
    const lock = require('../database/concorrencia');
    const row = async (sql, args=[]) => (await pool.query(sql,args)).rows[0];
    const u={id:null,nome:'Teste 67',perfil:'admin',setor_id:null};
    const setor=await row("INSERT INTO setores(nome) VALUES('Teste 67') RETURNING id");
    const categoria=await row("INSERT INTO categorias(nome,setor_id) VALUES('Teste 67',$1) RETURNING id",[setor.id]);
    const t=await row(`INSERT INTO tipos_ativo(nome,categoria_id,permite_emprestimo,permite_vinculo,
        permite_checklist,checklist_recorrencia,checklist_intervalo_meses,checklist_modo,checklist_itens)
        VALUES('Teste 67',$1,TRUE,TRUE,TRUE,'mensal',1,'calendario','["Pergunta A","Pergunta B"]') RETURNING *`,[categoria.id]);
    let n=0;
    async function novo() {return row("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio,status,checklist_proxima_data) VALUES($1,$2,$3,'disponivel','2024-01-31') RETURNING *",[t.id,setor.id,`T67-${++n}`]);}
    async function form(a) {
        const d=await checklists.detalhar(String(t.id),a.patrimonio,u);
        return {ocorrencia_id:d.ocorrencia_id,modelo_id:d.modelo_id,
            respostas:d.perguntas.map(p=>({pergunta_id:p.id,resposta:'conforme'})),observacao:''};
    }
    const concluir=(a,b)=>checklists.executar(String(t.id),a.patrimonio,b,u);
    async function configurar(extra) {const atual=await tipos.buscarTipo(t.id,u);return tipos.atualizarTipo(t.id,{...atual,...extra},u);}
    async function editar(a,extra={}) {const atual=await ativos.buscarAtivo(String(t.id),a.patrimonio,u);return {...atual,...extra};}
    // Ordem determinística: a segunda chamada chega à trava enquanto a primeira a possui.
    async function disputar(primeira,segunda) {
        const original=lock.bloquear; let avisar,soltar,avisarSegunda;
        const entrou=new Promise(r=>avisar=r), espera=new Promise(r=>soltar=r), tentou=new Promise(r=>avisarSegunda=r);
        let chamadas=0;
        lock.bloquear=async c=>{const ordem=++chamadas;if(ordem===2) avisarSegunda();await original(c);if(ordem===1){avisar();await espera;}};
        try {
            const p=primeira(); await entrou; const q=segunda(); await tentou; soltar();
            return await Promise.allSettled([p,q]);
        } finally {soltar();lock.bloquear=original;}
    }
    const a=await novo(), aberto=await form(a);
    await pool.query("UPDATE checklist_ocorrencias SET criado_em='2024-01-01' WHERE id=$1",[aberto.ocorrencia_id]);
    const original=await row('SELECT * FROM checklist_ocorrencias WHERE id=$1',[aberto.ocorrencia_id]);
    await configurar({checklist_itens:['Pergunta B','Pergunta nova'],checklist_recorrencia:'trimestral'});
    const preservada=await row('SELECT * FROM checklist_ocorrencias WHERE id=$1',[aberto.ocorrencia_id]);
    for(const chave of ['id','ativo_id','modelo_id','vencimento','situacao']) assert.deepEqual(preservada[chave],original[chave]);
    const agendaAlterada=await checklists.detalhar(String(t.id),a.patrimonio,u);
    assert.ok(agendaAlterada.alteracoes_agenda[0].quantidade>1);
    assert.equal((await row('SELECT COUNT(*)::int n FROM execucoes_checklist WHERE ativo_id=$1',[a.id])).n,0);
    await configurar({permite_checklist:false});
    assert.ok((await checklists.listar(u)).some(x=>x.ativo_id===a.id));
    await configurar({permite_checklist:true});
    const exec=await concluir(a,aberto);
    assert.equal(exec.respostas[0].item,'Pergunta A');
    const concluida = {status:409,codigo:'OCORRENCIA_CONCLUIDA',message:'Consulte os registros respondidos na data solicitada!'};
    await assert.rejects(concluir(a,aberto),concluida);
    await assert.rejects(concluir(a,{...aberto,observacao:'outro conteúdo'}),concluida);
    assert.equal((await row('SELECT COUNT(*)::int n FROM execucoes_checklist WHERE ocorrencia_id=$1',[aberto.ocorrencia_id])).n,1);
    assert.equal((await row("SELECT COUNT(*)::int n FROM historico_ativos WHERE ativo_id=$1 AND acao='checklist'",[a.id])).n,1);
    const novaOcorrencia=await form(a);
    assert.notEqual(novaOcorrencia.ocorrencia_id,aberto.ocorrencia_id);
    assert.ok((await concluir(a,novaOcorrencia)).id);
    const b=await novo(), fb=await form(b);
    const concorrentes=await disputar(()=>concluir(b,fb),()=>concluir(b,fb));
    assert.equal(concorrentes[0].status,'fulfilled');assert.match(concorrentes[1].reason.message,/^Consulte os registros respondidos na data solicitada!$/);
    assert.equal((await row('SELECT COUNT(*)::int n FROM execucoes_checklist WHERE ativo_id=$1',[b.id])).n,1);
    const c=await novo();
    const body=await editar(c); const dados={patrimonio:body.patrimonio,setor_id:body.setor_id,status:body.status,revisao:body.revisao,tipo_revisao:body.tipo_revisao};
    await ativos.atualizarAtivo(String(t.id),c.patrimonio,dados,u);
    await assert.rejects(ativos.atualizarAtivo(String(t.id),c.patrimonio,dados,u),{status:409});
    await assert.rejects(ativos.atualizarAtivo(String(t.id),c.patrimonio,{...dados,revisao:undefined},u),{status:409});
    const campo=await campos.criarCampo({tipo_ativo_id:t.id,nome:'teste',label:'Teste',tipo:'texto'},u);
    await campos.atualizarCampo(campo.id,{...campo,label:'Novo'},u);
    await assert.rejects(campos.atualizarCampo(campo.id,{...campo,label:'Obsoleto'},u),{status:409});
    const definicao=await campos.buscarCampo(campo.id,u);
    const disputaCampos=await disputar(()=>campos.atualizarCampo(campo.id,{...definicao,label:'Pessoa A'},u),
        ()=>campos.atualizarCampo(campo.id,{...definicao,label:'Pessoa B'},u));
    assert.equal(disputaCampos[0].status,'fulfilled');assert.equal(disputaCampos[1].reason.status,409);
    const atual=await editar(c);
    await campos.atualizarCampo(campo.id,{...await campos.buscarCampo(campo.id,u),label:'Outra definição'},u);
    await assert.rejects(ativos.atualizarAtivo(String(t.id),c.patrimonio,{...dados,revisao:atual.revisao,tipo_revisao:atual.tipo_revisao},u),{status:409});
    const emprestar=async a=>ativos.movimentarEmprestimo(String(t.id),a.patrimonio,{revisao:(await ativos.buscarAtivo(String(t.id),a.patrimonio,u)).revisao,acao_esperada:'saida',responsavel:'Teste',prazo_devolucao:new Date(Date.now()+86400000).toISOString()},u);
    for(const grupoPrimeiro of [true,false]) {
        const x=await novo(),y=await novo();
        const formulario=await abrirGrupo({nome:`Disputa ${x.id}`,ativo_ids:[x.id,y.id]});
        const grupo=()=>vinculos.criar(formulario,u);
        const resultados=await disputar(grupoPrimeiro?grupo:()=>emprestar(x),grupoPrimeiro?()=>emprestar(x):grupo);
        assert.equal(resultados[0].status,'fulfilled',resultados[0].reason?.stack);assert.equal(resultados[1].reason.status,409);
        const estado=await row('SELECT a.status,gm.grupo_id FROM ativos a LEFT JOIN grupos_ativos_membros gm ON gm.ativo_id=a.id WHERE a.id=$1',[x.id]);
        assert.ok(!(estado.grupo_id && estado.status==='emprestado'));
    }
    const mapas=require('../services/mapas.service');
    const destino=await row("INSERT INTO setores(nome) VALUES('Destino 67') RETURNING id");
    const planta=await row("INSERT INTO plantas_baixas(nome,arquivo,largura,altura) VALUES('Teste 67','teste.png',1000,700) RETURNING id");
    const ambiente=await mapas.salvarAmbiente(null,{planta_id:planta.id,setor_id:setor.id,nome:'Sala 67',cor:'#2563eb',padrao:true,
        poligono:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]});
    for(const operacao of ['transferencia','mapa']) for(const grupoPrimeiro of [true,false]) {
        const x=await novo(),y=await novo();
        const g=await vinculos.criar(await abrirGrupo({nome:`Composição ${x.id}`,ativo_ids:[x.id,y.id]}),u);
        const grupo=(await vinculos.detalhar(String(t.id),x.patrimonio,u)).grupo;
        const atual=await ativos.buscarAtivo(String(t.id),x.patrimonio,u);
        const edicao=await abrirGrupo({nome:`Editado ${x.id}`,ativo_ids:[x.id,y.id],revisao:grupo.revisao});
        const alterar=operacao==='transferencia'
            ? ()=>vinculos.atualizar(g.id,edicao,u)
            : ()=>vinculos.desvincular(g.id,x.id,u,{revisao:grupo.revisao});
        const movimentar=operacao==='transferencia'
            ? ()=>ativos.transferirAtivo(String(t.id),x.patrimonio,{setor_id:destino.id,revisao:atual.revisao,grupo_esperado:atual.grupo_esperado},u)
            : ()=>mapas.moverAtivo(x.id,{ambiente_id:ambiente.id,x:.4,y:.5,revisao:atual.revisao},u);
        const r=await disputar(grupoPrimeiro?alterar:movimentar,grupoPrimeiro?movimentar:alterar);
        assert.equal(r[0].status,'fulfilled');assert.equal(r[1].reason.status,409);
        if(operacao==='transferencia' && !grupoPrimeiro) {
            assert.equal((await row('SELECT COUNT(*)::int n FROM ativos WHERE id=ANY($1::int[]) AND setor_id=$2',[[x.id,y.id],destino.id])).n,2);
        }
    }
    const permissao=await row("INSERT INTO tipos_ativo(nome,categoria_id,permite_emprestimo) VALUES('Permissão 67',$1,TRUE) RETURNING *",[categoria.id]);
    const equipamento=await row("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio,status) VALUES($1,$2,'PERM67','disponivel') RETURNING *",[permissao.id,setor.id]);
    const r=await disputar(
        ()=>tipos.atualizarTipo(permissao.id,{...permissao,permite_emprestimo:false},u),
        ()=>ativos.movimentarEmprestimo(String(permissao.id),equipamento.patrimonio,{acao_esperada:'saida',responsavel:'Teste',prazo_devolucao:new Date(Date.now()+86400000).toISOString()},u));
    assert.equal(r[0].status,'fulfilled');assert.equal(r[1].reason.status,409);
    await tipos.atualizarTipo(permissao.id,{...await tipos.buscarTipo(permissao.id,u),permite_emprestimo:true},u);
    const tipoAberto=await tipos.buscarTipo(permissao.id,u);
    const inversa=await disputar(
        ()=>ativos.movimentarEmprestimo(String(permissao.id),equipamento.patrimonio,{revisao:equipamento.revisao,acao_esperada:'saida',responsavel:'Teste',prazo_devolucao:new Date(Date.now()+86400000).toISOString()},u),
        ()=>tipos.atualizarTipo(permissao.id,{...tipoAberto,permite_emprestimo:false},u));
    assert.equal(inversa[0].status,'fulfilled');assert.equal(inversa[1].reason.status,409);
    const rollback=await novo(), fr=await form(rollback);
    await pool.query(`CREATE FUNCTION falha67() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.ativo_id=${rollback.id} THEN RAISE EXCEPTION 'falha 67 induzida'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER falha67 BEFORE INSERT ON historico_ativos FOR EACH ROW EXECUTE FUNCTION falha67()`);
    await assert.rejects(concluir(rollback,fr),/falha 67 induzida/);
    assert.equal((await row('SELECT COUNT(*)::int n FROM execucoes_checklist WHERE ativo_id=$1',[rollback.id])).n,0);
    assert.equal((await row('SELECT situacao FROM checklist_ocorrencias WHERE id=$1',[fr.ocorrencia_id])).situacao,'pendente');
    assert.equal((await row("SELECT COUNT(*)::int n FROM historico_ativos WHERE ativo_id=$1 AND acao='checklist'",[rollback.id])).n,0);
    assert.equal((await row('SELECT checklist_proxima_data FROM ativos WHERE id=$1',[rollback.id])).checklist_proxima_data.toISOString().slice(0,10),'2024-01-31');
    const parceiro=await novo();
    await assert.rejects(vinculos.criar(await abrirGrupo({nome:'Rollback grupo 67',ativo_ids:[parceiro.id,rollback.id]}),u),/falha 67 induzida/);
    assert.equal((await row('SELECT COUNT(*)::int n FROM grupos_ativos_membros WHERE ativo_id=ANY($1::int[])',[[parceiro.id,rollback.id]])).n,0);
    assert.equal((await row('SELECT COUNT(*)::int n FROM historico_ativos WHERE ativo_id=ANY($1::int[])',[[parceiro.id,rollback.id]])).n,0);
    await pool.query('DROP TRIGGER falha67 ON historico_ativos; DROP FUNCTION falha67()');
    const antes=await row('SELECT COUNT(*)::int n FROM checklist_ocorrencias');
    await pool.query(fs.readFileSync(path.join(__dirname,'../database/migrations/20261007_checklists_revisoes.sql'),'utf8'));
    assert.deepEqual(await row('SELECT COUNT(*)::int n FROM checklist_ocorrencias'),antes);
    assert.equal(checklists.adicionarMeses('2024-01-31',1),'2024-02-29');
    assert.equal(checklists.adicionarMeses('2023-01-31',1),'2023-02-28');
    assert.equal(checklists.adicionarDias('2024-02-25',7),'2024-03-03');
    assert.equal(checklists.proximaData({checklist_recorrencia:'mensal',checklist_modo:'calendario',checklist_intervalo_meses:1,
        checklist_proxima_data:'2024-02-29',checklist_referencia:'2024-01-31'}),'2024-03-31');
    assert.equal(checklists.proximaData({checklist_recorrencia:'personalizado',checklist_datas_personalizadas:['2024-02-29'],checklist_proxima_data:'2024-02-29'}),null);
    assert.deepEqual(require('../services/agendaChecklist.service').contar({referencia:'2024-01-31',inicio:'2024-02-01',fim:'2024-03-31',configuracao_anterior:{recorrencia:'mensal',meses:1}}),
        {quantidade:2,primeiro:'2024-02-29',ultimo:'2024-03-31'});
    const pausa=await novo(),fp=await form(pausa);
    await configurar({permite_checklist:false});await concluir(pausa,fp);
    assert.equal((await row('SELECT checklist_proxima_data FROM ativos WHERE id=$1',[pausa.id])).checklist_proxima_data,null);
    assert.ok((await checklists.detalhar(String(t.id),pausa.patrimonio,u)).historico.length);
    await configurar({permite_checklist:true});
    assert.ok((await checklists.detalhar(String(t.id),pausa.patrimonio,u)).ocorrencia_id);
    const repetido=await novo(),frep=await form(repetido);
    const rr=await disputar(()=>concluir(repetido,frep),()=>concluir(repetido,frep));
    assert.equal(rr[0].status,'fulfilled');assert.equal(rr[1].status,'rejected');
    assert.equal(rr[1].reason.message,'Consulte os registros respondidos na data solicitada!');
    // Duas conclusões no mesmo dia devem avançar datas futuras sem perder a pendência.
    for (const recorrencia of ['mensal','semanal']) {
        await configurar({checklist_modo:'conclusao',checklist_recorrencia:recorrencia});
        const antecipado=await novo();
        const primeira=await concluir(antecipado,await form(antecipado));
        const segundaForm=await form(antecipado);
        const segunda=await concluir(antecipado,segundaForm);
        assert.ok(segunda.proxima_data>primeira.proxima_data,'segunda conclusão avança a agenda');
        await assert.rejects(concluir(antecipado,segundaForm),concluida);
        const pendencia=await checklists.detalhar(String(t.id),antecipado.patrimonio,u);
        assert.ok(pendencia.ocorrencia_id,'próxima ocorrência permanece disponível');
        assert.equal(pendencia.checklist_proxima_data.toISOString().slice(0,10),segunda.proxima_data.toISOString().slice(0,10));
        assert.ok((await checklists.listar(u)).some(x=>x.ativo_id===antecipado.id));
        assert.equal((await row('SELECT COUNT(*)::int n FROM execucoes_checklist WHERE ativo_id=$1',[antecipado.id])).n,2);
    }
    // Alterar somente o ícone não ressuscita uma data personalizada concluída.
    const hoje=checklists.hojeIso(),amanha=checklists.adicionarDias(hoje,1);
    await configurar({checklist_recorrencia:'personalizado',checklist_datas_personalizadas:[hoje]});
    const personalizado=await row("INSERT INTO ativos(tipo_ativo_id,setor_id,patrimonio,status,checklist_proxima_data) VALUES($1,$2,'PERSONAL67','disponivel',$3) RETURNING *",[t.id,setor.id,hoje]);
    await concluir(personalizado,await form(personalizado));
    await configurar({icone:null});
    assert.equal((await row('SELECT checklist_proxima_data FROM ativos WHERE id=$1',[personalizado.id])).checklist_proxima_data,null);
    assert.equal((await checklists.detalhar(String(t.id),personalizado.patrimonio,u)).ocorrencia_id,null);
    // Simula também o cadastro inconsistente deixado pela versão anterior.
    await pool.query('UPDATE ativos SET checklist_proxima_data=$2 WHERE id=$1',[personalizado.id,hoje]);
    await configurar({checklist_datas_personalizadas:[hoje,amanha]});
    const proxima=await checklists.detalhar(String(t.id),personalizado.patrimonio,u);
    assert.ok(proxima.ocorrencia_id);assert.equal(proxima.checklist_proxima_data.toISOString().slice(0,10),amanha);
    await concluir(personalizado,await form(personalizado));
    await configurar({icone:null});
    assert.equal((await row('SELECT checklist_proxima_data FROM ativos WHERE id=$1',[personalizado.id])).checklist_proxima_data,null);
    // A revisão de A pode não mudar quando B sai: conferir também o grupo aberto.
    const ga=await novo(),gb=await novo(),gc=await novo();
    const trio=await vinculos.criar(await abrirGrupo({nome:'Trio obsoleto',ativo_ids:[ga.id,gb.id,gc.id]}),u);
    const abertoA=await ativos.buscarAtivo(String(t.id),ga.patrimonio,u);
    await vinculos.desvincular(trio.id,gb.id,u,{revisao:abertoA.grupo_esperado.revisao});
    assert.equal((await ativos.buscarAtivo(String(t.id),ga.patrimonio,u)).revisao,abertoA.revisao);
    const historicos=await row('SELECT count(*)::int n FROM historico_ativos');
    await assert.rejects(ativos.transferirAtivo(String(t.id),ga.patrimonio,{setor_id:destino.id,revisao:abertoA.revisao,grupo_esperado:abertoA.grupo_esperado},u),{status:409});
    assert.deepEqual(await row('SELECT count(*)::int n FROM historico_ativos'),historicos);
    assert.equal((await row('SELECT count(*)::int n FROM ativos WHERE id=ANY($1::int[]) AND setor_id=$2',[[ga.id,gb.id,gc.id],setor.id])).n,3);
    const reabertoA=await ativos.buscarAtivo(String(t.id),ga.patrimonio,u);
    await assert.rejects(ativos.transferirAtivo(String(t.id),ga.patrimonio,{setor_id:destino.id,revisao:reabertoA.revisao},u),{status:409});
    await ativos.transferirAtivo(String(t.id),ga.patrimonio,{setor_id:destino.id,revisao:reabertoA.revisao,grupo_esperado:reabertoA.grupo_esperado},u);
    assert.equal((await row('SELECT setor_id FROM ativos WHERE id=$1',[gb.id])).setor_id,setor.id);
    // Ensaio real de upgrade: esquema antigo, ativo e execução anteriores à migração.
    const legado=await pool.connect(), esquema='legado67_'+crypto.randomBytes(6).toString('hex');
    try {
        await legado.query(`CREATE SCHEMA ${esquema}; SET search_path TO ${esquema}`);
        for(const arquivo of ['schema.sql','migrations/20261005_limpezas_imagens.sql','migrations/20261006_lixeira_ativos.sql']) {
            await legado.query(fs.readFileSync(path.join(__dirname,'../database',arquivo),'utf8'));
        }
        const c=(await legado.query("INSERT INTO categorias(nome) VALUES('Legado') RETURNING id")).rows[0];
        const tipo=(await legado.query("INSERT INTO tipos_ativo(nome,categoria_id,checklist_itens) VALUES('Legado',$1,'[\"Pergunta atual\"]') RETURNING id",[c.id])).rows[0];
        const ativo=(await legado.query("INSERT INTO ativos(tipo_ativo_id,patrimonio,checklist_proxima_data,dados) VALUES($1,'LEGADO67','2024-01-31','{\"original\":true}') RETURNING *",[tipo.id])).rows[0];
        await legado.query(`INSERT INTO execucoes_checklist(ativo_id,patrimonio,tipo_ativo_id,data_prevista,resultado,respostas,usuario_nome)
            VALUES($1,'LEGADO67',$2,'2023-12-31','conforme','[{"item":"Pergunta histórica desconhecida","resposta":"conforme"}]','Legado')`,[ativo.id,tipo.id]);
        const historico=(await legado.query('SELECT * FROM execucoes_checklist')).rows;
        const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261007_checklists_revisoes.sql'),'utf8');
        await legado.query(sql);await legado.query(sql);
        const depois=(await legado.query('SELECT * FROM ativos WHERE id=$1',[ativo.id])).rows[0];
        delete depois.revisao;assert.deepEqual(depois,ativo);
        const execucoes=(await legado.query('SELECT * FROM execucoes_checklist')).rows;
        for(const e of execucoes){assert.equal(e.ocorrencia_id,null);delete e.ocorrencia_id;delete e.chave_reenvio;delete e.pedido;}
        assert.deepEqual(execucoes,historico);
        const ocorrencias=(await legado.query('SELECT * FROM checklist_ocorrencias')).rows;
        assert.equal(ocorrencias.length,1);assert.equal(ocorrencias[0].legado,true);
        assert.equal(ocorrencias[0].vencimento.toISOString().slice(0,10),'2024-01-31');
    } finally {await legado.query(`SET search_path TO public; DROP SCHEMA ${esquema} CASCADE`);legado.release();}
    console.log('PASSOU: melhorias 6/7 — formulário antigo, pausa, recorrência, reenvio, conflito, duas conclusões, revisão de ativo/campo, grupo versus empréstimo nas duas ordens, rollback e reaplicação.');
};
