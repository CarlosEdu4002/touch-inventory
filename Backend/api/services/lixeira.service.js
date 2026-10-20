const model = require("../models/lixeira.model");
const historico = require("../models/historico.model");
const transacao = require("../database/transacao");
const imagens = require("./imagens.service");
const codigoFalha = (erro) => erro?.code || erro?.name || "desconhecido";

function falha(mensagem, status=409) { const erro=new Error(mensagem); erro.status=status; return erro; }
function validarId(valor) {
    if (!/^\d+$/.test(String(valor)) || !Number.isSafeInteger(Number(valor)) || Number(valor)<=0 || Number(valor)>2147483647) throw falha("ID do ativo inválido",400);
    return Number(valor);
}
function evento(ativo, usuario, acao) {
    return { ativo_id: ativo.id, patrimonio: ativo.patrimonio, tipo_ativo_id: ativo.tipo_ativo_id,
        usuario_id: usuario.id, usuario_nome: usuario.nome, acao, campos_alterados: ["excluido_em"],
        dados_anteriores: { excluido_em: ativo.excluido_em }, dados_novos: { excluido_em: acao==="restauracao" ? null : ativo.excluido_em } };
}

async function excluir(id, usuario, revisao) {
    return transacao.executar(async cliente => {
        const ativo=await model.buscar(validarId(id), usuario, cliente, true);
        if (!ativo || ativo.excluido_em) throw falha("Ativo não encontrado",404);
        require("../database/concorrencia").conferir(revisao,ativo.revisao);
        const impedimento=await model.temImpedimento(ativo.id,cliente);
        if (impedimento.grupo) throw falha("Desvincule o ativo antes de excluí-lo");
        if (ativo.status==="emprestado" || impedimento.emprestimo) throw falha("Devolva o ativo antes de excluí-lo");
        const excluido={ ...ativo, ...await model.excluir(ativo.id,usuario,cliente) };
        await model.registrarLog(excluido,"exclusao",usuario,cliente);
        await historico.registrar({ ...evento(excluido,usuario,"exclusao"), dados_anteriores: { excluido_em:null } },cliente);
        return { id:ativo.id, recuperavel_ate:excluido.recuperavel_ate };
    });
}

async function restaurar(id, usuario, revisao) {
    return transacao.executar(async cliente => {
        const ativo=await model.buscar(validarId(id),usuario,cliente,true);
        if (!ativo || !ativo.excluido_em) throw falha("Ativo excluído não encontrado",404);
        require("../database/concorrencia").conferir(revisao,ativo.revisao);
        const restaurado=await model.restaurar(ativo.id,cliente);
        if (!restaurado) throw falha("O prazo de 30 dias para recuperação terminou");
        const posicao=await model.validarPosicao(ativo.id,cliente);
        if (posicao && !require("./mapas.service").pontoNoPoligono(posicao,posicao.poligono)) {
            await model.removerPosicao(ativo.id,cliente);
        }
        await model.registrarLog(ativo,"restauracao",usuario,cliente);
        await historico.registrar(evento(ativo,usuario,"restauracao"),cliente);
        return { id:ativo.id, patrimonio:ativo.patrimonio };
    });
}

// Função: Limpa apenas prazos vencidos; sem parâmetro de tempo ou opção para antecipar.
async function limparExpirados() {
    const arquivos=[];
    const total=await transacao.executar(async cliente => {
        const ativos=await model.expirados(cliente);
        let excluidos=0;
        for (const ativo of ativos) {
            const anexos=await model.arquivosChecklist(ativo.id,cliente);
            if (!(await model.apagarExpirado(ativo.id,cliente))) continue;
            excluidos++;
            await model.registrarLog(ativo,"exclusao_definitiva",null,cliente);
            await imagens.agendar(ativo.imagem,cliente);
            if (ativo.imagem) arquivos.push(ativo.imagem);
            for (const nome of anexos) { await imagens.agendar(nome,cliente); arquivos.push(nome); }
        }
        return excluidos;
    },undefined,{semEspera:true});
    if (arquivos.length) await imagens.tentarLimpeza(arquivos);
    return { excluidos:total };
}

function iniciarWorker() {
    let executando=false;
    async function tick() {
        if (executando) return;
        executando=true;
        try {
            if(process.env.INVENTARIO_TEST_SCHEMA) await limparExpirados();
            else {
                const unidades=require("../models/unidades.model");
                const contexto=require("../database/contexto-unidade");
                for(const schema of await unidades.schemasAtivos()) {
                    try { await contexto.executar(schema,()=>limparExpirados()); }
                    catch(erro) { console.error("Limpeza da lixeira pendente em "+schema,codigoFalha(erro)); }
                }
            }
        } catch (erro) { console.error("Limpeza da lixeira pendente:",codigoFalha(erro)); }
        finally { executando=false; }
    }
    function agendar() {
        void tick().catch(erro => console.error("Limpeza da lixeira: falha inesperada no agendamento:",
            codigoFalha(erro)));
    }
    agendar(); const timer=setInterval(agendar,60000); timer.unref();
    return () => clearInterval(timer);
}

module.exports={ excluir, restaurar, limparExpirados, iniciarWorker, validarId, listar:model.listar, listarLog:model.listarLog };
