const grade=document.getElementById("grade"), mensagem=document.getElementById("mensagem");
const dialogo=document.getElementById("dialogo");
let usuario=null;
async function api(url,opcoes={}) {
    const r=await fetch(url,{...opcoes,headers:opcoes.body?{"Content-Type":"application/json"}:undefined});
    const dados=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(dados.erro||"Operação não concluída");
    return dados;
}
function destinoSeguro() {
    const valor=new URLSearchParams(location.search).get("retorno");
    if(!valor||!valor.startsWith("/")||valor.startsWith("//")||/[\\\u0000-\u0020\u007f]/.test(valor))return "/index.html";
    const url=new URL(valor,location.origin);
    const paginas=new Set(["/index.html","/ativo.html","/exibeAtivos.html","/administracao.html","/checklists.html","/exportacoes.html","/gestao.html","/grupos.html","/mapa.html","/mapa-admin.html","/lixeira.html"]);
    return url.origin===location.origin&&paginas.has(url.pathname)?url.pathname+url.search+url.hash:"/index.html";
}
function unidadeDaEtiqueta() {
    const destino=new URL(destinoSeguro(),location.origin);
    if(destino.pathname!=="/ativo.html")return null;
    const id=destino.searchParams.get("unidade");
    return /^[1-9]\d*$/.test(id||"") && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}
async function carregar() {
    const me=await fetch("/api/auth/me");
    if(!me.ok){location.replace("/login.html?retorno="+encodeURIComponent(location.pathname+location.search));return;}
    usuario=(await me.json()).usuario;
    const alvo=unidadeDaEtiqueta();
    document.getElementById("nova").hidden=usuario.perfil!=="admin" || alvo!==null;
    const unidades=await api("/api/unidades");
    const disponiveis=alvo===null ? unidades : unidades.filter(unidade=>Number(unidade.id)===alvo);
    const linkGeral=document.getElementById("selecaoGeral");
    linkGeral.hidden=alvo===null;
    grade.replaceChildren();
    mensagem.textContent=alvo!==null
        ? disponiveis.length ? `Esta etiqueta pertence à unidade ${disponiveis[0].nome}. Selecione-a para abrir o ativo.` : "Esta etiqueta aponta para uma unidade indisponível para sua conta. Solicite acesso ao administrador ou regrave a etiqueta."
        : unidades.length ? usuario.nome+", escolha uma unidade para continuar."
        : usuario.perfil==="admin" ? "Crie a primeira unidade para iniciar." : "Nenhuma unidade liberada para sua conta. Solicite acesso ao administrador.";
    for(const unidade of disponiveis) {
        const artigo=document.createElement("article");artigo.className="cartao";
        const botao=document.createElement("button");botao.type="button";botao.className="entrar";
        const foto=document.createElement("div");foto.className="imagem";
        if(unidade.tem_logo) {
            const img=document.createElement("img");img.src="/api/unidades/"+unidade.id+"/logo";img.alt="Logo de "+unidade.nome;foto.append(img);
        } else {
            const iniciais=document.createElement("span");iniciais.className="sigla";
            iniciais.textContent=unidade.nome.split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();foto.append(iniciais);
        }
        const texto=document.createElement("div");texto.className="texto";
        const titulo=document.createElement("strong");titulo.textContent=unidade.nome;
        const dica=document.createElement("small");dica.textContent="Acessar unidade →";
        texto.append(titulo,dica);botao.append(foto,texto);artigo.append(botao);
        botao.addEventListener("click",async()=>{
            try {await api("/api/unidades/"+unidade.id+"/selecionar",{method:"POST",body:"{}"});location.replace(destinoSeguro());}
            catch(e){mensagem.textContent=e.message;}
        });
        if(usuario.perfil==="admin") {
            const editar=document.createElement("button");editar.type="button";editar.className="editar";editar.textContent="Editar";
            editar.addEventListener("click",()=>abrir(unidade));artigo.append(editar);
        }
        grade.append(artigo);
    }
}
function abrir(unidade) {
    document.getElementById("formUnidade").reset();
    document.getElementById("erroDialogo").hidden=true;
    document.getElementById("idUnidade").value=unidade?.id||"";
    document.getElementById("nomeUnidade").value=unidade?.nome||"";
    document.getElementById("tituloDialogo").textContent=unidade?"Editar unidade":"Nova unidade";
    dialogo.showModal();
}
document.getElementById("nova").addEventListener("click",()=>abrir(null));
document.getElementById("cancelar").addEventListener("click",()=>dialogo.close());
document.getElementById("sair").addEventListener("click",async()=>{await fetch("/api/auth/logout",{method:"POST"});location.replace("/login.html");});
document.getElementById("formUnidade").addEventListener("submit",async e=>{
    e.preventDefault();
    try {
        const id=document.getElementById("idUnidade").value, arquivo=document.getElementById("logoUnidade").files[0];
        const body={nome:document.getElementById("nomeUnidade").value};
        if(arquivo){
            if(arquivo.size>2*1024*1024)throw new Error("Logo maior que 2 MB");
            body.logo=await new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(leitor.result);leitor.onerror=reject;leitor.readAsDataURL(arquivo);});
        }
        await api(id?"/api/unidades/"+id:"/api/unidades",{method:id?"PUT":"POST",body:JSON.stringify(body)});
        dialogo.close();await carregar();
    } catch(erro){
        const aviso=document.getElementById("erroDialogo");
        aviso.textContent=erro.message;aviso.hidden=false;
    }
});
carregar().catch(e=>mensagem.textContent=e.message);
