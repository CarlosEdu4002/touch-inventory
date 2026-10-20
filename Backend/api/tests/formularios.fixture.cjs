// As regressões anteriores aos itens 6/7 simulam abrir um formulário aqui.
// Testes de formulário obsoleto usam diretamente os serviços, sem este auxiliar.
const pool = require('../database/connection');
async function revisoes(tipo,patrimonio) {
    return (await pool.query(`SELECT a.revisao,t.revisao AS tipo_revisao FROM ativos a
        JOIN tipos_ativo t ON t.id=a.tipo_ativo_id WHERE a.patrimonio=$1
        AND (t.id::text=$2 OR lower(t.nome)=lower($2)) AND a.excluido_em IS NULL`,[patrimonio,String(tipo)])).rows[0] || {};
}
function servico(nome) {
    const original=require(`../services/${nome}.service`), copia={...original};
    if(nome==='ativos') {
        copia.transferirAtivo=async(tipo,p,body,u)=>original.transferirAtivo(tipo,p,{...await revisoes(tipo,p),grupo_esperado:(await original.buscarAtivo(tipo,p,u)).grupo_esperado,...body},u);
        copia.removerAtivo=async(tipo,p,u)=>original.removerAtivo(tipo,p,u,await revisoes(tipo,p));
        copia.criarAtivo=async(tipo,body,u)=>original.criarAtivo(tipo,{tipo_revisao:(await require('../models/ativos.model').buscarTipoPorNome(String(tipo),u))?.revisao,...body},u);
        for(const metodo of ['atualizarAtivo','movimentarEmprestimo','movimentarChave','movimentarFerramenta','prorrogarEmprestimo']) copia[metodo]=async(tipo,patrimonio,body,...resto)=>original[metodo](tipo,patrimonio,{...await revisoes(tipo,patrimonio),...body},...resto);
    }
    if(nome==='vinculos') {
        const membros=async ids=>Object.fromEntries((await pool.query('SELECT id,revisao FROM ativos WHERE id=ANY($1::int[])',[ids])).rows.map(a=>[a.id,a.revisao]));
        copia.criar=async(body,u)=>original.criar({revisoes:await membros(body.ativo_ids),...body},u);
        copia.atualizar=async(id,body,u)=>original.atualizar(id,{revisoes:await membros(body.ativo_ids),revisao:(await pool.query('SELECT revisao FROM grupos_ativos WHERE id=$1',[id])).rows[0]?.revisao,...body},u);
        copia.desvincular=async(id,ativoId,u)=>original.desvincular(id,ativoId,u,{revisao:(await pool.query('SELECT revisao FROM grupos_ativos WHERE id=$1',[id])).rows[0]?.revisao});
    }
    if(nome==='mapas') copia.moverAtivo=async(id,body,u)=>{
        const a=(await pool.query('SELECT revisao FROM ativos WHERE id=$1',[id])).rows[0];
        return original.moverAtivo(id,{revisao:a?.revisao,...body},u);
    };
    if(nome==='tiposAtivo') copia.atualizarTipo=async(id,body,u)=>original.atualizarTipo(id,{revisao:(await original.buscarTipo(id,u)).revisao,...body},u);
    if(nome==='checklists') copia.executar=async(tipo,patrimonio,body,u)=>{
        const d=await original.detalhar(String(tipo),patrimonio,u);
        return original.executar(tipo,patrimonio,{...body,ocorrencia_id:d.ocorrencia_id,modelo_id:d.modelo_id,
            respostas:body.respostas.map((r,i)=>({...r,pergunta_id:d.perguntas[i].id}))},u);
    };
    return copia;
}
async function pedido(url,method,body) {
    if(!body) return body;
    if(method==='POST' && /^\/api\/\d+$/.test(url)) {
        const t=(await pool.query('SELECT revisao FROM tipos_ativo WHERE id=$1',[url.split('/')[2]])).rows[0];return {tipo_revisao:t?.revisao,...body};
    }
    if((method==='DELETE' || method==='POST') && /^\/api\/ativos\/\d+(?:\/restaurar)?$/.test(url)) {
        const a=(await pool.query('SELECT revisao FROM ativos WHERE id=$1',[url.split('/')[3]])).rows[0];return {...a,...body};
    }
    if(method!=='PUT') return body;
    const partes=url.split('/').filter(Boolean);
    if(partes[1]==='ativos' && partes.length===3) {
        const r=(await pool.query(`SELECT a.revisao,t.revisao AS tipo_revisao FROM ativos a JOIN tipos_ativo t ON t.id=a.tipo_ativo_id WHERE a.id=$1`,[partes[2]])).rows[0];
        return {...r,...body};
    }
    if(partes.length===3 && !['tipos','campos','mapas'].includes(partes[1])) return {...await revisoes(partes[1],decodeURIComponent(partes[2])),...body};
    return body;
}
function modeloAtivos() {
    const model=require('../models/ativos.model');return {...model,
        movimentarAtivoLido:async(tipo,p,u,dados,m)=>model.movimentarAtivoLido(tipo,p,u,{...await revisoes(tipo,p),...dados},m),
        prorrogarEmprestimo:async(tipo,p,u,prazo)=>model.prorrogarEmprestimo(tipo,p,u,prazo,(await revisoes(tipo,p)).revisao)};
}
module.exports={servico,pedido,modeloAtivos};
