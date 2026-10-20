const elLixeira=id=>document.getElementById(id);
const dataLixeira=valor=>new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(valor));
const acoesLixeira={exclusao:"Exclusão recuperável",restauracao:"Restauração",exclusao_definitiva:"Exclusão definitiva"};

function mensagemLixeira(texto,erro=false) {
    elLixeira("mensagemLixeira").textContent=texto;
    elLixeira("mensagemLixeira").classList.toggle("erro",erro);
}
async function apiLixeira(url,opcoes={}) {
    const resposta=await fetch(url,opcoes); const dados=await resposta.json();
    if (!resposta.ok) {
        const erro=new Error(dados.erro||"Não foi possível concluir a operação");
        erro.status=resposta.status;erro.codigo=dados.codigo;throw erro;
    }
    return dados;
}
function celulaLixeira(tr,texto) {
    const td=document.createElement("td"); td.textContent=texto;
    const rotulos=tr.dataset.ativoId
        ? ["Patrimônio","Tipo / categoria","Excluído por","Exclusão","Recuperável até","Ações"]
        : ["Patrimônio","Tipo","Ação","Responsável","Data e hora"];
    td.dataset.rotulo=rotulos[tr.children.length]; tr.appendChild(td); return td;
}

async function atualizarLixeira() {
    try {
        const [ativos,log]=await Promise.all([apiLixeira("/api/ativos/lixeira"),apiLixeira("/api/ativos/log-exclusoes")]);
        elLixeira("ativosLixeira").replaceChildren(); elLixeira("logLixeira").replaceChildren();
        document.getElementById("avisoRevisaoAlterada")?.remove();
        for (const ativo of ativos) {
            const tr=document.createElement("tr"); tr.dataset.ativoId=ativo.id;
            [ativo.patrimonio,`${ativo.tipo_nome} / ${ativo.categoria_nome}`,ativo.excluido_por_nome,
                dataLixeira(ativo.excluido_em),dataLixeira(ativo.recuperavel_ate)].forEach(texto=>celulaLixeira(tr,texto));
            const td=celulaLixeira(tr,""); const acoes=document.createElement("div"); acoes.className="acoes-lixeira";
            const restaurar=document.createElement("button"); restaurar.type="button"; restaurar.textContent="Restaurar";
            restaurar.disabled=!ativo.pode_restaurar;
            if (!ativo.pode_restaurar) { const prazo=document.createElement("span"); prazo.textContent="Prazo encerrado; aguardando limpeza automática"; acoes.appendChild(prazo); }
            restaurar.addEventListener("click",async()=>{
                if (!window.confirm(`Restaurar ${ativo.patrimonio} com seu histórico e movimentações?`)) return;
                restaurar.disabled=true;
                try {
                    const dados=await apiLixeira(`/api/ativos/${ativo.id}/restaurar`,{
                        method:"POST",headers:{"Content-Type":"application/json"},
                        body:JSON.stringify({revisao:ativo.revisao})
                    });
                    mensagemLixeira(dados.mensagem); await atualizarLixeira();
                } catch (erro) {
                    mensagemLixeira(erro.message,true);
                    mostrarConflitoDeRevisao(erro,"/lixeira.html");
                    restaurar.disabled=!ativo.pode_restaurar;
                }
            });
            const historico=document.createElement("button"); historico.type="button"; historico.textContent="Histórico";
            historico.addEventListener("click",async()=>{
                try {
                    const dados=await apiLixeira(`/api/ativos/${ativo.id}/historico`);
                    let conteudo=td.querySelector(".historico-lixeira");
                    if (!conteudo) { conteudo=document.createElement("p");conteudo.className="historico-lixeira";td.appendChild(conteudo); }
                    conteudo.textContent=dados.map(item=>`${dataLixeira(item.created_at)} · ${acoesLixeira[item.acao]||item.acao} · ${item.usuario_nome}`).join("\n")||"Sem eventos registrados";
                } catch (erro) { mensagemLixeira(erro.message,true); }
            });
            acoes.append(restaurar,historico);td.appendChild(acoes);elLixeira("ativosLixeira").appendChild(tr);
        }
        if (!ativos.length) { const tr=document.createElement("tr"); const td=celulaLixeira(tr,"Nenhum ativo na lixeira.");td.colSpan=6;elLixeira("ativosLixeira").appendChild(tr); }
        for (const evento of log) {
            const tr=document.createElement("tr");
            [evento.patrimonio,evento.tipo_nome,acoesLixeira[evento.acao],evento.usuario_nome,dataLixeira(evento.created_at)].forEach(texto=>celulaLixeira(tr,texto));
            elLixeira("logLixeira").appendChild(tr);
        }
        if (!log.length) {const tr=document.createElement("tr");const td=celulaLixeira(tr,"Nenhum evento registrado.");td.colSpan=5;elLixeira("logLixeira").appendChild(tr);}
    } catch (erro) { mensagemLixeira(erro.message,true); }
}
elLixeira("atualizarLixeira").addEventListener("click",atualizarLixeira);
protegerPagina().then(atualizarLixeira).catch(erro=>mensagemLixeira(erro.message,true));
