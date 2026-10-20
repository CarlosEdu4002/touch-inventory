const model = require("../models/checklists.model");

function falha(mensagem, status = 400) {
    const erro = new Error(mensagem);
    erro.status = status;
    return erro;
}

function dataIso(valor) {
    return new Date(`${somenteData(valor)}T12:00:00Z`);
}

function somenteData(valor) {
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor || "").slice(0, 10);
}

function adicionarMeses(valor, meses) {
    const data = dataIso(valor);
    const dia = data.getUTCDate();
    data.setUTCDate(1);
    data.setUTCMonth(data.getUTCMonth() + meses);
    const ultimoDia = new Date(Date.UTC(
        data.getUTCFullYear(), data.getUTCMonth() + 1, 0
    )).getUTCDate();
    data.setUTCDate(Math.min(dia, ultimoDia));
    return data.toISOString().slice(0, 10);
}

function adicionarDias(valor, dias) {
    const data = dataIso(valor);
    data.setUTCDate(data.getUTCDate() + dias);
    return data.toISOString().slice(0, 10);
}

function hojeIso() {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const obter = (tipo) => partes.find((parte) => parte.type === tipo).value;
    return `${obter("year")}-${obter("month")}-${obter("day")}`;
}

function proximaData(ativo) {
    const hoje = hojeIso();
    // Uma conclusão antecipada também precisa avançar além da ocorrência concluída.
    const vencimento = somenteData(ativo.checklist_proxima_data);
    const referencia = ativo.checklist_modo === "calendario"
        ? vencimento
        : (vencimento > hoje ? vencimento : hoje);
    if (ativo.checklist_recorrencia === "personalizado") {
        return (ativo.checklist_datas_personalizadas || [])
            .map(somenteData)
            .filter((data) => data > somenteData(ativo.checklist_proxima_data))
            .sort()[0] || null;
    }
    if (ativo.checklist_recorrencia === "semanal") {
        let proxima = adicionarDias(
            referencia,
            7
        );

        return proxima;
    }
    if(!Number.isInteger(ativo.checklist_intervalo_meses) || ativo.checklist_intervalo_meses<1) return null;
    let proxima = adicionarMeses(
        referencia,
        ativo.checklist_intervalo_meses
    );

    if(ativo.checklist_modo==='calendario' && ativo.checklist_referencia) {
        const referencia=dataIso(ativo.checklist_referencia), alvo=dataIso(proxima);
        const ultimo=new Date(Date.UTC(alvo.getUTCFullYear(),alvo.getUTCMonth()+1,0)).getUTCDate();
        alvo.setUTCDate(Math.min(referencia.getUTCDate(),ultimo));proxima=alvo.toISOString().slice(0,10);
    }
    return proxima;
}

async function listar(usuario) {
    return model.listar(usuario);
}

async function detalhar(tipo, patrimonio, usuario) {
    const ativo = await model.buscarAtivo(tipo, patrimonio, usuario);
    if (!ativo) {
        throw falha("Ativo não encontrado ou sem checklist habilitado", 404);
    }
    const contexto = require("../database/contexto-unidade");
    const historico = (await model.historico(ativo.id, usuario)).map((registro) => ({
        ...registro,
        imagens: (registro.imagens || []).map((nome) => contexto.urlArquivo(
            `/uploads/checklists/${registro.id}/${encodeURIComponent(nome)}`
        ))
    }));
    return { ...ativo, historico, alteracoes_agenda:(await model.alteracoesAgenda(ativo.id,usuario)).map(a=>({...a,...require("./agendaChecklist.service").contar(a)})).filter(a=>a.quantidade>0) };
}

async function executar(tipo, patrimonio, body, usuario) {
    if(!body || typeof body!=="object" || Array.isArray(body)) throw falha("Envio de checklist inválido");
    const ativo = await model.buscarAtivo(tipo, patrimonio, usuario);
    if (!ativo) {
        throw falha("Ativo não encontrado ou sem checklist habilitado", 404);
    }
    if (!body.ocorrencia_id || !body.modelo_id) {
        throw falha("Abra a ocorrência atual para responder ao checklist",409);
    }
    if (String(body.ocorrencia_id)!==String(ativo.ocorrencia_id)) {
        const situacao = await model.situacaoOcorrencia(ativo.id, body.ocorrencia_id);
        if (situacao === "concluida") throw model.ocorrenciaConcluida();
        throw falha("Esta ocorrência não está disponível para resposta.",409);
    }
    if (String(body.modelo_id)!==String(ativo.modelo_id)) throw falha("O modelo desta ocorrência mudou. Consulte os dados atuais.",409);
    const itens = ativo.perguntas || [];
    if(!itens.length) throw falha("Ocorrência legada sem perguntas recuperáveis. Solicite a revisão do cadastro ao administrador.",409);
    if (!Array.isArray(body.respostas) || body.respostas.length !== itens.length) {
        throw falha("Responda todos os itens do checklist");
    }
    const respostas = itens.map((item) => {
        const resposta = body.respostas.find(r => r?.pergunta_id === item.id)?.resposta;
        if (!["conforme", "nao_conforme", "nao_aplica"].includes(resposta)) {
            throw falha(`Resposta inválida para: ${item.texto}`);
        }
        return { pergunta_id: item.id, item: item.texto, resposta };
    });
    const resultado = respostas.some((item) => item.resposta === "nao_conforme")
        ? "nao_conforme" : "conforme";
    const observacao = String(body.observacao || "").trim();
    if (resultado === "nao_conforme" && !observacao) {
        throw falha("Descreva a não conformidade encontrada");
    }
    const anexos = body.imagens === undefined ? [] : body.imagens;
    if (!Array.isArray(anexos) || anexos.length > 6 ||
        anexos.some((imagem) => typeof imagem !== "string" || !/^data:image\/(?:jpeg|png);base64,/.test(imagem))) {
        throw falha("Anexe no máximo 6 imagens JPG ou PNG");
    }
    const imagens = require("./imagens.service");
    const arquivos = [];
    try {
        for (const imagem of anexos) arquivos.push(await imagens.preparar(imagem));
        return await model.registrar(ativo, {
            respostas,
            body: { ocorrencia_id:body.ocorrencia_id, modelo_id:body.modelo_id,
                respostas:body.respostas, observacao:body.observacao },
            resultado,
            observacao,
            arquivos,
            proxima_data: ativo.permite_checklist ? proximaData(ativo) : null
        }, usuario);
    } catch (erro) {
        await Promise.all(arquivos.map((nome) => imagens.compensar(nome)));
        throw erro;
    }
}

module.exports = { listar, detalhar, executar, adicionarMeses, adicionarDias, proximaData, hojeIso };
