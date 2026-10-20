// =====================
// Estado e configurações da interface
// =====================

const painelLeitura = document.getElementById("painelLeituraContinua");
const controleLeitura = document.getElementById("leituraContinua");
const estadoLeitura = document.getElementById("estadoLeituraContinua");
const modalMovimentacao = document.getElementById("modalMovimentacaoChave");
const formMovimentacao = document.getElementById("formMovimentacaoChave");

let bufferLeitura = "";
let temporizadorBuffer = null;
let leituraEmProcessamento = false;
let ativoMovimentacao = null;
let ultimaLeitura = { valor: "", instante: 0 };
let relogioMovimentacao = null;
let leitorNfc = null;
let dispositivosNfcAutorizados = [];
let esperaHidAtual = null;
let leituraPaginasNfc = null;
let temporizadorCicloNfc = null;
let cicloNfcEmAndamento = false;
let ultimaTagNfc = { uid: null, bloqueadaAte: 0 };

const NFC_X_VID = 0x0483;
const NFC_X_PID = 0x4343;
const TEMPO_BLOQUEIO_TAG_MS = 5000;
const PACOTE_NFC_ATIVAR = "550051000101fe01";
const PACOTE_NFC_LER_UID =
    "55008300120401ffffffff00000000ffffffff78563412f20d";
const PACOTE_NFC_DESATIVAR = "550051000100ff";
const PACOTE_NFC_LER_CONTEUDO =
    "5500810010ffffffff000000000200000000000000fd02";

// =====================
// Funções da interface
// =====================

// Função: Mostra a leitura quando o tipo foi configurado para empréstimo e devolução.
function tipoAtualPermiteLeitura() {
    return Boolean(contextoTipoAtual?.tipo?.permite_emprestimo);
}

// Função: Escolhe o nome singular usado nas mensagens conforme o tipo de ativo atual.
function nomeAtivoMovimentado() {
    const nomeTipo = normalizarNomeTipo(contextoTipoAtual?.tipo?.nome);
    if (nomeTipo === "ferramentas") return "ferramenta";
    if (nomeTipo === "chaves") return "chave";
    return "ativo";
}

// Função: Converte uma data em valor local compatível com o campo datetime-local.
function valorDataHoraLocal(data) {
    const doisDigitos = (numero) => String(numero).padStart(2, "0");
    return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-` +
        `${doisDigitos(data.getDate())}T${doisDigitos(data.getHours())}:` +
        doisDigitos(data.getMinutes());
}

// Função: Atualiza o texto e a aparência que indicam se a leitura contínua está ativa.
function exibirEstadoLeitor(texto, ativo = controleLeitura.checked) {
    painelLeitura.classList.toggle("ativo", ativo);
    estadoLeitura.textContent = texto;
}

// Função: Sincroniza o estado visual do leitor com a conexão NFC e com a opção selecionada.
function atualizarEstadoLeitor() {
    const ativo = controleLeitura.checked;
    exibirEstadoLeitor(
        ativo ? "Aguardando aproximação de uma tag…" : "Desativada",
        ativo
    );
    bufferLeitura = "";
}

// Função: Verifica se a sequência de bytes recebida começa com os valores esperados.
function comecaCom(bytes, valores) {
    return valores.every((valor, indice) => bytes[indice] === valor);
}

// Função: Converte uma instrução hexadecimal em pacote binário compatível com o leitor NFC.
function montarPacoteNfc(hexadecimal) {
    const pacote = new Uint8Array(64);
    hexadecimal.match(/../g).forEach((valor, indice) => {
        pacote[indice] = Number.parseInt(valor, 16);
    });
    return pacote;
}

// Função: Classifica o relatório recebido do dispositivo e encaminha UID, páginas ou respostas aos aguardadores.
function receberRelatorioNfc(evento) {
    const bytes = new Uint8Array(
        evento.data.buffer,
        evento.data.byteOffset,
        evento.data.byteLength
    );

    if (
        leituraPaginasNfc &&
        comecaCom(bytes, [0x55, 0x00, 0x85, 0x00, 0x06]) &&
        bytes[6] === 0x01
    ) {
        const pagina = bytes[5];
        leituraPaginasNfc.paginas.set(pagina, bytes.slice(7, 11));
        if (pagina === 44) {
            window.clearTimeout(leituraPaginasNfc.temporizador);
            const { paginas, concluir } = leituraPaginasNfc;
            leituraPaginasNfc = null;
            concluir(paginas);
        }
    }

    if (esperaHidAtual?.aceitar(bytes)) {
        esperaHidAtual.concluir(bytes);
        esperaHidAtual = null;
    }
}

// Função: Cria uma espera com limite de tempo para a próxima resposta NFC que satisfaça o filtro informado.
function aguardarRespostaNfc(aceitar, limite = 2200) {
    return new Promise((resolve, reject) => {
        const temporizador = window.setTimeout(() => {
            esperaHidAtual = null;
            const erro = new Error("Nenhuma tag detectada");
            erro.tagAusente = true;
            reject(erro);
        }, limite);
        esperaHidAtual = {
            aceitar,
            concluir: (bytes) => {
                window.clearTimeout(temporizador);
                resolve(bytes);
            }
        };
    });
}

// Função: Envia um comando ao leitor e aguarda a resposta NFC correspondente dentro do prazo definido.
async function enviarEEsperarNfc(hexadecimal, aceitar, limite) {
    const resposta = aguardarRespostaNfc(aceitar, limite);
    await leitorNfc.sendReport(0, montarPacoteNfc(hexadecimal));
    return resposta;
}

// Função: Aguarda o conjunto de páginas de memória necessário para interpretar o conteúdo da tag.
function aguardarPaginasNfc() {
    return new Promise((resolve, reject) => {
        const temporizador = window.setTimeout(() => {
            leituraPaginasNfc = null;
            const erro = new Error("Nenhuma tag disponível para leitura");
            erro.tagAusente = true;
            reject(erro);
        }, 6000);
        leituraPaginasNfc = {
            paginas: new Map(),
            concluir: resolve,
            temporizador
        };
    });
}

// Função: Ordena as páginas NFC recebidas e reúne seus bytes na área de memória do usuário.
function juntarAreaUsuarioNfc(paginas) {
    const bytes = [];
    for (let pagina = 4; pagina <= 44; pagina += 1) {
        const dadosPagina = paginas.get(pagina);
        if (!dadosPagina) {
            throw new Error(`A página ${pagina} da tag não foi recebida`);
        }
        bytes.push(...dadosPagina);
    }
    return new Uint8Array(bytes);
}

// Função: Percorre os registros TLV da memória da tag e extrai a mensagem NDEF, quando existente.
function localizarNdef(area) {
    let posicao = 0;
    while (posicao < area.length) {
        const tipoTlv = area[posicao++];
        if (tipoTlv === 0x00) continue;
        if (tipoTlv === 0xfe || posicao >= area.length) break;
        let tamanho = area[posicao++];
        if (tamanho === 0xff) {
            tamanho = (area[posicao] << 8) | area[posicao + 1];
            posicao += 2;
        }
        if (tipoTlv === 0x03) {
            return area.slice(posicao, posicao + tamanho);
        }
        posicao += tamanho;
    }
    throw new Error("Nenhuma mensagem NDEF foi encontrada na tag");
}

// Função: Decodifica um registro NDEF de URI e devolve a URL completa gravada na tag.
function extrairUrlNdef(ndef) {
    let posicao = 0;
    const cabecalho = ndef[posicao++];
    const registroCurto = Boolean(cabecalho & 0x10);
    const possuiId = Boolean(cabecalho & 0x08);
    const tamanhoTipo = ndef[posicao++];
    let tamanhoPayload;

    if (registroCurto) {
        tamanhoPayload = ndef[posicao++];
    } else {
        tamanhoPayload =
            ndef[posicao] * 0x1000000 +
            (ndef[posicao + 1] << 16) +
            (ndef[posicao + 2] << 8) +
            ndef[posicao + 3];
        posicao += 4;
    }
    const tamanhoId = possuiId ? ndef[posicao++] : 0;
    const tipoRegistro = new TextDecoder().decode(
        ndef.slice(posicao, posicao + tamanhoTipo)
    );
    posicao += tamanhoTipo + tamanhoId;
    const payload = ndef.slice(posicao, posicao + tamanhoPayload);
    if (tipoRegistro !== "U" || !payload.length) {
        throw new Error("O conteúdo NDEF da tag não é uma URL");
    }

    const prefixos = [
        "", "http://www.", "https://www.", "http://", "https://",
        "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.",
        "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://",
        "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:",
        "sip:", "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://",
        "tcpobex://", "irdaobex://", "file://", "urn:epc:id:",
        "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:",
        "urn:nfc:"
    ];
    return (prefixos[payload[0]] ?? "") +
        new TextDecoder().decode(payload.slice(1));
}

// Função: Consulta na API o ativo associado ao UID da tag, aceitando como normal uma tag ainda não vinculada.
async function buscarVinculoNfc(uid) {
    const response = await fetch(`/api/nfc/tags/${encodeURIComponent(uid)}`);
    if (response.status === 404) return null;
    return lerResposta(response, "Não foi possível consultar a tag NFC");
}

// Função: Associa o UID ao ID permanente identificado no conteúdo da tag.
async function vincularTagNfc(uid, valorLido) {
    const leitura = await resolverLeitura(valorLido);
    const response = await fetch(
        `/api/nfc/tags/${encodeURIComponent(uid)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ativo_id: leitura.ativoId })
        }
    );
    return lerResposta(response, "Não foi possível memorizar a tag NFC");
}

// Função: Executa a sequência de comandos do leitor NFC-X para obter UID, URL NDEF e vínculo da tag.
async function lerUrlComNfcX() {
    await enviarEEsperarNfc(
        PACOTE_NFC_ATIVAR,
        (bytes) => comecaCom(bytes, [0x55, 0x00, 0x51])
    );
    const identificacao = await enviarEEsperarNfc(
        PACOTE_NFC_LER_UID,
        (bytes) => comecaCom(bytes, [0x55, 0x00, 0x83, 0x00, 0x40])
    );
    const uid = [
        identificacao[14], identificacao[15], identificacao[16],
        identificacao[18], identificacao[19], identificacao[20],
        identificacao[21]
    ].map((valor) => valor.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    if (
        uid === ultimaTagNfc.uid &&
        Date.now() < ultimaTagNfc.bloqueadaAte
    ) {
        const erro = new Error("A mesma tag está no intervalo de segurança");
        erro.tagEmEspera = true;
        erro.tempoRestante = Math.max(
            1,
            Math.ceil((ultimaTagNfc.bloqueadaAte - Date.now()) / 1000)
        );
        throw erro;
    }
    const vinculo = await buscarVinculoNfc(uid);
    const paginasEsperadas = aguardarPaginasNfc();
    await leitorNfc.sendReport(0, montarPacoteNfc(PACOTE_NFC_LER_CONTEUDO));
    const paginas = await paginasEsperadas;
    const url = extrairUrlNdef(localizarNdef(juntarAreaUsuarioNfc(paginas)));
    const leitura = interpretarLeitura(url);
    if (vinculo && (Number(vinculo.ativo_id) !== Number(leitura.ativoId) ||
        Number(vinculo.unidade_id) !== Number(leitura.unidadeId))) {
        throw new Error("O UID e a URL desta etiqueta apontam para ativos diferentes");
    }
    return { uid, url, precisaVincular: !vinculo };
}

// Função: Interrompe ciclos pendentes, limpa a conexão e atualiza a interface para o estado desligado.
async function desativarLeitorNfc() {
    if (!leitorNfc?.opened) return;
    try {
        await leitorNfc.sendReport(0, montarPacoteNfc(PACOTE_NFC_DESATIVAR));
    } catch {
        // O desligamento é apenas uma limpeza após cada tentativa.
    }
}

// Função: Programa a próxima tentativa de leitura contínua após o atraso informado.
function agendarCicloNfc(atraso = 700) {
    window.clearTimeout(temporizadorCicloNfc);
    if (!controleLeitura.checked || !leitorNfc?.opened) return;
    temporizadorCicloNfc = window.setTimeout(executarCicloNfc, atraso);
}

// Função: Realiza um ciclo completo de leitura, processamento e reagendamento enquanto o leitor estiver ativo.
async function executarCicloNfc() {
    if (
        cicloNfcEmAndamento ||
        leituraEmProcessamento ||
        !controleLeitura.checked ||
        !leitorNfc?.opened
    ) return;

    cicloNfcEmAndamento = true;
    try {
        const leituraNfc = await lerUrlComNfcX();
        ultimaTagNfc = {
            uid: leituraNfc.uid,
            bloqueadaAte: Date.now() + TEMPO_BLOQUEIO_TAG_MS
        };
        exibirEstadoLeitor(`Tag lida. Identificando ${nomeAtivoMovimentado()}…`);
        const processada = await processarLeitura(leituraNfc.url);
        if (processada && leituraNfc.precisaVincular) {
            try {
                await vincularTagNfc(leituraNfc.uid, leituraNfc.url);
            } catch (erro) {
                console.error(erro);
                mostrarNotificacao(
                    `A ${nomeAtivoMovimentado()} foi aberta, mas o UID não pôde ser memorizado`,
                    "aviso"
                );
            }
        }
    } catch (erro) {
        if (erro.tagEmEspera) {
            exibirEstadoLeitor(
                `Aguardando ${erro.tempoRestante}s para uma nova leitura…`
            );
        }
        if (
            controleLeitura.checked &&
            !erro.tagAusente &&
            !erro.tagEmEspera
        ) {
            mostrarNotificacao(erro.message, "erro");
        }
        if (
            controleLeitura.checked &&
            !leituraEmProcessamento &&
            !erro.tagEmEspera
        ) {
            exibirEstadoLeitor("Aguardando aproximação de uma tag…");
        }
    } finally {
        await desativarLeitorNfc();
        cicloNfcEmAndamento = false;
        if (!leituraEmProcessamento) agendarCicloNfc();
    }
}

// Função: Solicita acesso ao dispositivo NFC-X compatível, abre a conexão HID e inicia a recepção de relatórios.
async function conectarNfcX() {
    if (!("hid" in navigator)) {
        throw new Error(
            "O leitor NFC-X exige Chrome ou Edge em uma conexão segura/localhost"
        );
    }

    if (!leitorNfc) {
        let dispositivos = dispositivosNfcAutorizados.filter(
            (item) => item.vendorId === NFC_X_VID && item.productId === NFC_X_PID
        );
        if (!dispositivos.length) {
            dispositivos = await navigator.hid.requestDevice({
                filters: [{ vendorId: NFC_X_VID, productId: NFC_X_PID }]
            });
        }
        if (!dispositivos.length) {
            throw new Error("Nenhum leitor NFC-X foi selecionado");
        }
        leitorNfc = dispositivos[0];
        leitorNfc.addEventListener("inputreport", receberRelatorioNfc);
    }

    if (!leitorNfc.opened) await leitorNfc.open();
    exibirEstadoLeitor("Leitor conectado. Aguardando uma tag…");
    agendarCicloNfc(100);
}

// Função: Ativa ou desativa o leitor conforme a opção da interface e trata falhas de conexão.
async function alterarLeituraContinua() {
    atualizarEstadoLeitor();
    window.clearTimeout(temporizadorCicloNfc);

    if (!controleLeitura.checked) {
        await desativarLeitorNfc();
        if (leitorNfc?.opened) await leitorNfc.close();
        return;
    }

    exibirEstadoLeitor("Conectando ao leitor NFC-X…");
    try {
        await conectarNfcX();
    } catch (erro) {
        controleLeitura.checked = false;
        atualizarEstadoLeitor();
        mostrarNotificacao(erro.message, "erro");
    }
}

// Função: Aceita somente a URL nova com unidade e ID permanente.
function interpretarLeitura(valor) {
    let url;
    try { url = new URL(String(valor || "").trim(), window.location.origin); }
    catch { throw new Error("URL da etiqueta inválida. Regrave a etiqueta."); }
    const ativoId = url.searchParams.get("ativo");
    const unidadeId = url.searchParams.get("unidade");
    if (url.origin !== window.location.origin || url.pathname !== "/ativo.html" ||
        !/^[1-9]\d*$/.test(ativoId || "") ||
        !/^[1-9]\d*$/.test(unidadeId || "") || !Number.isSafeInteger(Number(ativoId)) ||
        !Number.isSafeInteger(Number(unidadeId))) {
        throw new Error("Etiqueta antiga ou inválida. Regrave a URL com unidade e ID do ativo.");
    }
    return { ativoId, unidadeId };
}

// Confere a unidade antes de buscar o ativo na sessão atual.
async function resolverLeitura(valor) {
    const leitura = interpretarLeitura(valor);
    if (Number(usuarioAtual?.unidade_id) !== Number(leitura.unidadeId)) {
        throw new Error("Esta etiqueta pertence a outra unidade. Troque de unidade para continuar.");
    }
    const ativo = await lerResposta(
        await fetch(`/api/ativos/${encodeURIComponent(leitura.ativoId)}`),
        "Ativo da etiqueta não encontrado"
    );
    return { ...leitura, patrimonio: ativo.patrimonio, tipoLido: String(ativo.tipo_ativo_id), ativo };
}

// Função: Confere se o tipo contido na leitura corresponde ao tipo atualmente aberto na página.
function validarTipoLido(tipoLido) {
    if (!tipoLido) return;
    const tipoContexto = contextoTipoAtual.tipo;
    const corresponde = String(tipoLido) === String(tipoContexto.id) ||
        normalizarNomeTipo(tipoLido) === normalizarNomeTipo(tipoContexto.nome);
    if (!corresponde) {
        throw new Error(`A etiqueta lida não pertence ao tipo ${contextoTipoAtual.tipo.nome}`);
    }
}

// Função: Produz o horário local atual no formato exibido pela movimentação de chaves.
function formatarHorarioAtual() {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium"
    }).format(new Date());
}

// Função: Fecha a janela de movimentação e descarta o ativo temporariamente selecionado.
function fecharMovimentacao() {
    modalMovimentacao.classList.add("oculto");
    formMovimentacao.reset();
    ativoMovimentacao = null;
    leituraEmProcessamento = false;
    ultimaLeitura.instante = Date.now();
    window.clearInterval(relogioMovimentacao);
    if (controleLeitura.checked) {
        atualizarEstadoLeitor();
        agendarCicloNfc(900);
    }
}

// Função: Carrega os setores disponíveis e preenche a seleção usada na retirada de chaves.
async function carregarSetoresMovimentacao() {
    const select = document.getElementById("setorResponsavelChave");
    const setores = await lerResposta(
        await fetch("/api/setores"),
        "Não foi possível carregar os setores"
    );
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione o setor";
    select.appendChild(placeholder);
    setores.forEach((setor) => {
        const option = document.createElement("option");
        option.value = setor.id;
        option.textContent = setor.nome;
        select.appendChild(option);
    });
}

// Função: Preenche e abre a janela de retirada ou devolução conforme o status atual do ativo.
async function abrirMovimentacao(ativo) {
    const nomeAtivo = nomeAtivoMovimentado();
    const feminino = nomeAtivo !== "ativo";
    const saida = ativo.status === "disponivel" ||
        (!feminino && ativo.status === "em_uso");
    if (!saida && ativo.status !== "emprestado") {
        throw new Error(
            `${feminino ? "A" : "O"} ${nomeAtivo} precisa estar Disponível` +
            `${feminino ? "" : ", Em uso"} ou Emprestad${feminino ? "a" : "o"}`
        );
    }

    ativoMovimentacao = ativo;
    document.getElementById("rotuloAcaoChave").textContent =
        saida ? "Registrar saída" : "Registrar devolução";
    document.getElementById("tituloMovimentacaoChave").textContent =
        saida ? `Entrega d${feminino ? "a" : "o"} ${nomeAtivo}`
            : `Recebimento d${feminino ? "a" : "o"} ${nomeAtivo}`;
    document.getElementById("rotuloAtivoMovimentacao").textContent =
        nomeAtivo[0].toLocaleUpperCase("pt-BR") + nomeAtivo.slice(1);
    document.getElementById("patrimonioMovimentacao").textContent =
        ativo.patrimonio;
    document.getElementById("statusMovimentacao").textContent =
        saida ? (ativo.status === "em_uso" ? "Em uso" : "Disponível")
            : `Emprestad${feminino ? "a" : "o"}`;
    document.getElementById("labelResponsavelChave").textContent = saida
        ? "Responsável pela retirada"
        : "Responsável pela devolução (opcional)";
    const responsavel = document.getElementById("responsavelChave");
    responsavel.required = saida;
    const prazo = document.getElementById("prazoDevolucao");
    document.getElementById("grupoPrazoDevolucao")
        .classList.toggle("oculto", !saida);
    prazo.required = saida;
    prazo.min = valorDataHoraLocal(new Date());
    prazo.value = "";
    document.getElementById("confirmarMovimentacaoChave").textContent =
        saida ? "Confirmar saída" : "Confirmar devolução";
    await carregarSetoresMovimentacao();

    // Função: Atualiza continuamente o horário mostrado enquanto a janela de movimentação permanece aberta.
    const atualizarRelogio = () => {
        document.getElementById("horarioMovimentacao").textContent =
            formatarHorarioAtual();
    };
    atualizarRelogio();
    relogioMovimentacao = window.setInterval(atualizarRelogio, 1000);
    modalMovimentacao.classList.remove("oculto");
    window.setTimeout(() => responsavel.focus(), 0);
}

// Função: Evita leituras duplicadas, identifica o ativo lido e inicia sua consulta ou movimentação.
async function processarLeitura(valor) {
    if (leituraEmProcessamento || !controleLeitura.checked) return;
    const agora = Date.now();
    if (valor === ultimaLeitura.valor && agora - ultimaLeitura.instante < 2500) {
        ultimaLeitura.instante = agora;
        return;
    }
    ultimaLeitura = { valor, instante: agora };
    leituraEmProcessamento = true;
    estadoLeitura.textContent = "Identificando etiqueta…";

    try {
        const leitura = await resolverLeitura(valor);
        validarTipoLido(leitura.tipoLido);
        await abrirMovimentacao(leitura.ativo);
        return true;
    } catch (erro) {
        mostrarNotificacao(erro.message, "erro");
        leituraEmProcessamento = false;
        atualizarEstadoLeitor();
        return false;
    }
}

// Função: Acumula caracteres enviados por leitores que simulam teclado e processa o valor ao receber Enter.
function capturarTeclado(evento) {
    if (!controleLeitura.checked || leituraEmProcessamento) return;
    if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

    if (evento.key === "Enter") {
        evento.preventDefault();
        window.clearTimeout(temporizadorBuffer);
        const leitura = bufferLeitura;
        bufferLeitura = "";
        if (leitura.trim()) processarLeitura(leitura);
        return;
    }
    if (evento.key.length === 1) {
        evento.preventDefault();
        bufferLeitura += evento.key;
        window.clearTimeout(temporizadorBuffer);
        temporizadorBuffer = window.setTimeout(() => {
            bufferLeitura = "";
        }, 1200);
    }
}

controleLeitura.addEventListener("change", alterarLeituraContinua);
document.addEventListener("keydown", capturarTeclado, true);
document.addEventListener("paste", (evento) => {
    if (!controleLeitura.checked || leituraEmProcessamento) return;
    const texto = evento.clipboardData?.getData("text");
    if (texto) {
        evento.preventDefault();
        processarLeitura(texto);
    }
}, true);

document.getElementById("cancelarMovimentacaoChave")
    .addEventListener("click", fecharMovimentacao);

document.querySelectorAll("[data-prazo-dias]").forEach((botao) => {
    botao.addEventListener("click", () => {
        const dias = Number(botao.dataset.prazoDias);
        const data = new Date();
        data.setDate(data.getDate() + dias);
        document.getElementById("prazoDevolucao").value =
            valorDataHoraLocal(data);
    });
});

document.getElementById("btnEmprestimo").addEventListener("click", async () => {
    if (!ativoSelecionado) {
        mostrarNotificacao("Selecione um ativo para emprestar ou devolver", "aviso");
        return;
    }
    try {
        const response = await fetch(
            `/api/${encodeURIComponent(tipo)}/${encodeURIComponent(ativoSelecionado)}`
        );
        const ativo = await lerResposta(response, "Ativo não encontrado");
        await abrirMovimentacao(ativo);
    } catch (erro) {
        mostrarNotificacao(erro.message, "erro");
    }
});

formMovimentacao.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!ativoMovimentacao) return;
    const botao = document.getElementById("confirmarMovimentacaoChave");
    botao.disabled = true;

    try {
        const saida = ativoMovimentacao.status !== "emprestado";
        const prazoLocal = document.getElementById("prazoDevolucao").value;
        if (saida && !prazoLocal) {
            throw new Error("Informe a data e hora previstas para a devolução");
        }
        const prazoDevolucao = saida ? new Date(prazoLocal) : null;
        if (saida && Number.isNaN(prazoDevolucao.getTime())) {
            throw new Error("Informe uma data e hora válidas para a devolução");
        }
        const nomeAtivo = nomeAtivoMovimentado();
        const caminho = nomeAtivo === "ferramenta"
            ? "movimentar-ferramenta"
            : nomeAtivo === "chave"
                ? "movimentar-chave" : "movimentar-emprestimo";
        const response = await fetch(
            `/api/${encodeURIComponent(tipo)}/${encodeURIComponent(
                ativoMovimentacao.patrimonio
            )}/${caminho}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao_esperada: saida ? "saida" : "devolucao",
                    revisao: ativoMovimentacao.revisao,
                    responsavel: document.getElementById("responsavelChave").value,
                    setor_responsavel_id: document.getElementById(
                        "setorResponsavelChave"
                    ).value,
                    observacao: document.getElementById("observacaoChave").value,
                    prazo_devolucao: prazoDevolucao?.toISOString() || null
                })
            }
        );
        const resultado = await lerResposta(
            response,
            "Não foi possível registrar a movimentação"
        );
        fecharMovimentacao();
        ativoSelecionado = null;
        await carregarAtivos();
        mostrarNotificacao(resultado.mensagem, "sucesso");
    } catch (erro) {
        if (!mostrarConflitoDeRevisao(erro,
            `/ativo.html?unidade=${encodeURIComponent(usuarioAtual.unidade_id)}&ativo=${encodeURIComponent(ativoMovimentacao?.id)}`)) {
            mostrarNotificacao(erro.message, "erro");
        }
    } finally {
        botao.disabled = false;
    }
});

const aguardarContextoLeitura = window.setInterval(() => {
    if (!contextoTipoAtual) return;
    window.clearInterval(aguardarContextoLeitura);
    if (tipoAtualPermiteLeitura()) painelLeitura.classList.remove("oculto");
}, 50);

if ("hid" in navigator) {
    navigator.hid.getDevices().then((dispositivos) => {
        dispositivosNfcAutorizados = dispositivos;
    });
    navigator.hid.addEventListener("disconnect", (evento) => {
        if (evento.device !== leitorNfc) return;
        leitorNfc = null;
        controleLeitura.checked = false;
        atualizarEstadoLeitor();
        mostrarNotificacao("O leitor NFC-X foi desconectado", "aviso");
    });
}
