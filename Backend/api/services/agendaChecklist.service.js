// Conta ciclos nominais sem materializar uma linha por dia ou por ciclo perdido.
function iso(valor) {return valor instanceof Date ? valor.toISOString().slice(0,10) : String(valor).slice(0,10);}
function data(valor) {return new Date(`${iso(valor)}T12:00:00Z`);}
function contar(registro) {
    const inicio=iso(registro.inicio),fim=iso(registro.fim),ref=iso(registro.referencia);
    const regra=registro.configuracao_anterior;
    if(regra.recorrencia==='personalizado') {
        const dias=[...new Set(regra.datas||[])].filter(d=>d>=inicio && d<=fim).sort();
        return {quantidade:dias.length,primeiro:dias[0],ultimo:dias.at(-1)};
    }
    if(regra.recorrencia==='semanal') {
        const base=data(ref).getTime(),semana=7*86400000;
        const primeiro=Math.max(1,Math.ceil((data(inicio)-base)/semana));
        const ultimo=Math.floor((data(fim)-base)/semana);
        return {quantidade:Math.max(0,ultimo-primeiro+1),
            primeiro:iso(new Date(base+primeiro*semana)),ultimo:iso(new Date(base+ultimo*semana))};
    }
    const meses=Number(regra.meses);if(!Number.isInteger(meses)||meses<1) return {quantidade:0};
    const origem=data(ref),distancia=d=>(d.getUTCFullYear()-origem.getUTCFullYear())*12+d.getUTCMonth()-origem.getUTCMonth();
    const vencimento=n=>{
        const d=new Date(Date.UTC(origem.getUTCFullYear(),origem.getUTCMonth()+n*meses,1,12));
        const ultimo=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
        d.setUTCDate(Math.min(origem.getUTCDate(),ultimo));return iso(d);
    };
    let primeiro=Math.max(1,Math.floor(distancia(data(inicio))/meses));
    if(vencimento(primeiro)<inicio) primeiro++;
    let ultimo=Math.floor(distancia(data(fim))/meses);
    if(vencimento(ultimo)>fim) ultimo--;
    return {quantidade:Math.max(0,ultimo-primeiro+1),primeiro:vencimento(primeiro),ultimo:vencimento(ultimo)};
}
module.exports={contar};
