const model=require("../models/lixeira.model");
const lixeira=require("./lixeira.service");
const ativos=require("./ativos.service");
const historico=require("../models/historico.model");
const publico=require("./publico.service");

async function encontrar(id,usuario,incluirExcluido=false) {
    const ativo=await model.buscar(lixeira.validarId(id),usuario);
    if (!ativo || (!incluirExcluido && ativo.excluido_em)) {
        const erro=new Error("Ativo não encontrado"); erro.status=404; throw erro;
    }
    return ativo;
}
async function buscar(id,usuario) {
    const a=await encontrar(id,usuario);
    return {...a.dados,revisao:a.revisao,tipo_revisao:a.tipo_revisao,id:a.id,tipo_ativo_id:a.tipo_ativo_id,patrimonio:a.patrimonio,setor_id:a.setor_id,
        setor:a.setor_nome,status:a.status,imagem_url:a.imagem?require("../database/contexto-unidade").urlArquivo(`/uploads/ativos/${encodeURIComponent(a.imagem)}`):null,atualizado_em:a.updated_at};
}
async function atualizar(id,body,usuario) {
    const a=await encontrar(id,usuario);
    await ativos.atualizarAtivo(String(a.tipo_ativo_id),a.patrimonio,body,usuario,a.id);
    return {mensagem:"Ativo atualizado com sucesso"};
}
async function listarHistorico(id,usuario) {
    const a=await encontrar(id,usuario,true);
    return historico.listarPorAtivo(a.tipo_ativo_id,a.patrimonio,usuario,a.id);
}
async function excluir(id,body,usuario) {
    await encontrar(id,usuario);
    if (body?.confirmar_exclusao!==true) {const erro=new Error("Confirme a exclusão recuperável por 30 dias");erro.status=400;throw erro;}
    return {mensagem:"Ativo enviado à lixeira. Recuperação disponível por 30 dias.",...await lixeira.excluir(id,usuario,body.revisao)};
}
module.exports={ buscar,atualizar,listarHistorico,excluir,
    detalhes:(id,usuario,unidade)=>{
        if (!/^[1-9]\d*$/.test(String(unidade)) || !Number.isSafeInteger(Number(unidade))) {
            const erro=new Error("Informe a unidade da etiqueta");erro.status=400;throw erro;
        }
        if (Number(usuario.unidade_id)!==Number(unidade)) {
            const erro=new Error("Ativo não encontrado nesta unidade");erro.status=404;throw erro;
        }
        return publico.buscarAtivo(lixeira.validarId(id),usuario);
    },
    restaurar:async(id,usuario,body={})=>({mensagem:"Ativo restaurado com seu patrimônio e histórico",...await lixeira.restaurar(id,usuario,body.revisao)}) };
