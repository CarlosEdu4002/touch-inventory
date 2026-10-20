let checklists = [];
let checklistAtual = null;
let imagensSelecionadas = [];
const el = (id) => document.getElementById(id);

function dataBr(valor) {
    if (!valor) return "—";
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })
        .format(new Date(`${String(valor).slice(0, 10)}T12:00:00Z`));
}
function dataHoraBr(valor) { return valor ? new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(valor)) : "—"; }
function notificar(texto, erro = false) { el("notificacao").textContent=texto; el("notificacao").classList.toggle("erro",erro); el("notificacao").hidden=false; setTimeout(()=>el("notificacao").hidden=true,4500); }
async function api(url, opcoes={}) { const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opcoes.headers||{})},...opcoes}); const d=await r.json().catch(()=>({})); if(!r.ok) { const erro=new Error(d.erro||"Não foi possível concluir a operação"); erro.status=r.status; erro.codigo=d.codigo; throw erro; } return d; }
function mostrarEstadoChecklist(texto="") { el("mensagemEstadoChecklist").textContent=texto; el("estadoChecklist").hidden=!texto; }
function limparImagens() { imagensSelecionadas.forEach(i=>URL.revokeObjectURL(i.url)); imagensSelecionadas=[]; el("imagensChecklist").value=""; el("previaImagensChecklist").replaceChildren(); }
function renderizarPreviaImagens() {
    const box=el("previaImagensChecklist");box.replaceChildren();
    imagensSelecionadas.forEach((item,indice)=>{const bloco=document.createElement("div");bloco.className="imagem-checklist";
        const imagem=document.createElement("img");imagem.src=item.url;imagem.alt=`Imagem ${indice+1} selecionada`;
        const nome=document.createElement("small");nome.textContent=item.arquivo.name;
        const remover=document.createElement("button");remover.type="button";remover.textContent="×";remover.setAttribute("aria-label",`Remover ${item.arquivo.name}`);
        remover.addEventListener("click",()=>{URL.revokeObjectURL(item.url);imagensSelecionadas.splice(indice,1);renderizarPreviaImagens()});
        bloco.append(imagem,nome,remover);box.appendChild(bloco);
    });
}
function lerImagem(arquivo) { return new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(leitor.result);leitor.onerror=()=>reject(new Error(`Não foi possível ler ${arquivo.name}`));leitor.readAsDataURL(arquivo);}); }
async function exportarHistorico(item,botao) {
    botao.disabled=true;
    try {
        const params=new URLSearchParams({tipo_checklist_id:String(item.tipo_ativo_id),patrimonio:item.patrimonio});
        const resposta=await fetch(`/api/exportacoes/checklist.pdf?${params}`);
        if(!resposta.ok){const dados=await resposta.json().catch(()=>({}));throw new Error(dados.erro||"Não foi possível exportar o histórico");}
        const objeto=URL.createObjectURL(await resposta.blob());const link=document.createElement("a");link.href=objeto;
        link.download=`historico-checklist-${item.patrimonio.replace(/[^a-z0-9_-]/gi,"-")}.pdf`;document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(objeto),1000);
        notificar("Histórico exportado em PDF.");
    } catch(erro){notificar(erro.message,true)} finally{botao.disabled=false}
}

function atualizarResumo() {
    el("totalVencidos").textContent=checklists.filter(i=>i.situacao==="vencido").length;
    el("totalProximos").textContent=checklists.filter(i=>i.situacao==="proximo").length;
    el("totalEmDia").textContent=checklists.filter(i=>i.situacao==="em_dia").length;
    el("totalNaoConformes").textContent=checklists.filter(i=>i.ultimo_resultado==="nao_conforme").length;
}
function renderizar() {
    const termo=el("buscaChecklist").value.trim().toLocaleLowerCase("pt-BR"); const situacao=el("filtroSituacao").value;
    const lista=checklists.filter(i=>(!situacao||i.situacao===situacao)&&`${i.patrimonio} ${i.tipo_nome} ${i.setor_nome||""}`.toLocaleLowerCase("pt-BR").includes(termo));
    const tbody=el("listaChecklists"); tbody.replaceChildren(); el("mensagemVazia").hidden=lista.length>0;
    for(const item of lista){ const tr=document.createElement("tr"); [item.patrimonio,item.tipo_nome,item.setor_nome||"—",dataBr(item.checklist_proxima_data)].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)}); const tdS=document.createElement("td");const selo=document.createElement("span");selo.className=`selo ${item.situacao}`;selo.textContent={vencido:"Vencido",proximo:"Próximo",em_dia:"Em dia"}[item.situacao];tdS.appendChild(selo);const tdA=document.createElement("td");const acoes=document.createElement("div");acoes.className="acoes-tabela";const b=document.createElement("button");b.type="button";b.textContent="Realizar";b.addEventListener("click",()=>abrir(item));const exportar=document.createElement("button");exportar.type="button";exportar.className="exportar-historico";exportar.textContent="Exportar histórico";exportar.addEventListener("click",()=>exportarHistorico(item,exportar));acoes.append(b,exportar);tdA.appendChild(acoes);tr.append(tdS,tdA);tbody.appendChild(tr); }
}
async function carregar(){ checklists=await api("/api/checklists"); atualizarResumo(); renderizar(); }
async function abrir(item) {
    let detalhe;
    try { detalhe=await api(`/api/checklists/${encodeURIComponent(item.tipo_ativo_id)}/${encodeURIComponent(item.patrimonio)}`); }
    catch (erro) { notificar(erro.message,true); return; }
    checklistAtual=detalhe;
    mostrarEstadoChecklist();
    el("rotuloChecklist").textContent=detalhe.tipo_nome;
    el("tituloChecklist").textContent=detalhe.patrimonio;
    el("detalheChecklist").textContent=`${detalhe.setor_nome||"Sem setor"} · prevista para ${dataBr(detalhe.checklist_proxima_data)}`;
    el("observacaoChecklist").value="";
    limparImagens();
    const itens=el("itensChecklist");itens.replaceChildren();
    const perguntas=Array.isArray(detalhe.perguntas)?detalhe.perguntas:[];
    const disponivel=Boolean(detalhe.ocorrencia_id&&detalhe.modelo_id&&perguntas.length&&perguntas.every(p=>p.id&&p.texto));
    if(!disponivel) mostrarEstadoChecklist(detalhe.historico?.length ? "Consulte os registros respondidos na data solicitada!" : "Não há ocorrência disponível para resposta.");
    else perguntas.forEach((pergunta,indice)=>{
        const bloco=document.createElement("div");bloco.className="item";
        const p=document.createElement("p");p.textContent=pergunta.texto;
        const respostas=document.createElement("div");respostas.className="respostas";
        [["conforme","Conforme"],["nao_conforme","Não conforme"],["nao_aplica","Não se aplica"]].forEach(([valor,rotulo])=>{
            const label=document.createElement("label");const input=document.createElement("input");
            input.type="radio";input.name=`resposta-${indice}`;input.value=valor;input.required=true;
            label.append(input,document.createTextNode(rotulo));respostas.appendChild(label);
        });
        bloco.append(p,respostas);itens.appendChild(bloco);
    });
    el("registrarChecklist").disabled=!disponivel;
    renderizarHistorico(detalhe.historico||[]);
    el("dialogChecklist").showModal();
}
function renderizarHistorico(historico){const box=el("historicoChecklist");box.replaceChildren();if(!historico.length){box.textContent="Nenhuma verificação realizada.";return;}historico.forEach(i=>{const d=document.createElement("div");d.className="historico-item";const s=document.createElement("strong");s.textContent=`${i.resultado==="conforme"?"Conforme":"Não conforme"} · ${dataHoraBr(i.executado_em)}`;const p=document.createElement("p");p.textContent=`${i.usuario_nome} · próxima: ${dataBr(i.proxima_data)}${i.observacao?` · ${i.observacao}`:""}`;d.append(s,p);if(Array.isArray(i.respostas)){const lista=document.createElement("ul");i.respostas.forEach(r=>{const item=document.createElement("li");item.textContent=`${r.item}: ${{conforme:"Conforme",nao_conforme:"Não conforme",nao_aplica:"Não se aplica"}[r.resposta]||r.resposta}`;lista.appendChild(item)});d.appendChild(lista)}if(Array.isArray(i.imagens)&&i.imagens.length){const galeria=document.createElement("div");galeria.className="historico-imagens";i.imagens.forEach((url,indice)=>{const link=document.createElement("a");link.href=url;link.target="_blank";link.rel="noopener noreferrer";const img=document.createElement("img");img.src=url;img.loading="lazy";img.alt=`Imagem ${indice+1} da verificação`;link.appendChild(img);galeria.appendChild(link)});d.appendChild(galeria)}box.appendChild(d)})}
el("imagensChecklist").addEventListener("change",(evento)=>{
    const arquivos=[...evento.target.files];evento.target.value="";
    if(imagensSelecionadas.length+arquivos.length>6){notificar("Selecione no máximo 6 imagens.",true);return;}
    if(arquivos.some(a=>!["image/jpeg","image/png"].includes(a.type)||a.size>2*1024*1024||!a.size)){notificar("Use imagens JPG ou PNG de até 2 MB cada.",true);return;}
    arquivos.forEach(arquivo=>imagensSelecionadas.push({arquivo,url:URL.createObjectURL(arquivo)}));renderizarPreviaImagens();
});
el("formChecklist").addEventListener("submit",async(e)=>{
    e.preventDefault();
    if(!checklistAtual?.ocorrencia_id||!checklistAtual?.modelo_id) return;
    const botao=e.submitter;botao.disabled=true;
    let ocorrenciaConcluida=false;
    try {
        const envioChecklist={
            ocorrencia_id:checklistAtual.ocorrencia_id,
            modelo_id:checklistAtual.modelo_id,
            respostas:checklistAtual.perguntas.map((pergunta,i)=>({
                pergunta_id:pergunta.id,
                resposta:el("formChecklist").querySelector(`input[name="resposta-${i}"]:checked`)?.value
            })),
            observacao:el("observacaoChecklist").value,
            imagens:await Promise.all(imagensSelecionadas.map(item=>lerImagem(item.arquivo)))
        };
        await api(`/api/checklists/${encodeURIComponent(checklistAtual.tipo_ativo_id)}/${encodeURIComponent(checklistAtual.patrimonio)}/executar`,{
            method:"POST",body:JSON.stringify(envioChecklist)
        });
        el("dialogChecklist").close();
        limparImagens();notificar("Checklist registrado com sucesso.");
        await carregar();
    } catch(erro) {
        if(erro.codigo==="OCORRENCIA_CONCLUIDA") {
            ocorrenciaConcluida=true;
            el("notificacao").hidden=true;
            mostrarEstadoChecklist(erro.message);
        } else {
            notificar(erro.message,true);
            if(erro.status===409&&erro.codigo!=="CONTEXTO_ALTERADO") mostrarEstadoChecklist(`${erro.message} Suas respostas e a observação continuam aqui.`);
        }
    } finally {if(!ocorrenciaConcluida) botao.disabled=false}
});
["fecharChecklist","cancelarChecklist"].forEach(id=>el(id).addEventListener("click",()=>el("dialogChecklist").close()));
el("buscaChecklist").addEventListener("input",renderizar);el("filtroSituacao").addEventListener("change",renderizar);
document.addEventListener("DOMContentLoaded",async()=>{try{await protegerPagina();await carregar();}catch(erro){notificar(erro.message,true)}});
