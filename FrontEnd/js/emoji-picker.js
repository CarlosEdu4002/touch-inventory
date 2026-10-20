// Catálogo local: funciona sem conexão externa e aceita qualquer emoji colado manualmente.
const GRUPOS_EMOJI = [
    { nome: "Recentes", icone: "🕘", itens: [] },
    { nome: "Objetos", icone: "🧰", itens: [
        ["📦", "caixa pacote estoque material"], ["🖥️", "computador desktop monitor pc"],
        ["💻", "notebook laptop computador"], ["⌨️", "teclado"], ["🖱️", "mouse"],
        ["🖨️", "impressora"], ["📱", "celular telefone smartphone"], ["☎️", "telefone fixo"],
        ["📷", "camera fotografia"], ["📹", "camera video"], ["🎥", "filmadora"],
        ["📺", "televisao tv tela"], ["📻", "radio"], ["🎙️", "microfone"],
        ["🎧", "fone headset"], ["🔈", "alto falante som"], ["📡", "antena sinal"],
        ["📶", "wifi rede internet"], ["🔋", "bateria"], ["🔌", "tomada cabo energia"],
        ["💡", "lampada luz"], ["🔦", "lanterna"], ["🕯️", "vela"],
        ["🧯", "extintor incendio"], ["🧰", "caixa ferramentas"], ["🔧", "chave inglesa ferramenta soprador termico"],
        ["🔨", "martelo ferramenta"], ["🪛", "chave fenda ferramenta"], ["🪚", "serrote ferramenta"],
        ["🗜️", "morsa ferramenta"], ["🛠️", "ferramentas manutencao"], ["⚙️", "engrenagem maquina"],
        ["🔩", "parafuso porca"], ["⛓️", "corrente"], ["🧲", "ima magneto"],
        ["🪜", "escada"], ["📏", "regua medida"], ["📐", "esquadro medida"],
        ["⚖️", "balanca peso"], ["🧪", "tubo ensaio laboratorio"], ["🔬", "microscopio"],
        ["🔭", "telescopio"], ["🧫", "placa petri laboratorio"], ["🧬", "dna ciencia"],
        ["🌡️", "termometro temperatura"], ["💉", "seringa"], ["🩺", "estetoscopio saude"],
        ["🩹", "curativo"], ["💊", "medicamento remedio"], ["🪑", "cadeira banco movel mesa mobiliario"],
        ["🛋️", "sofa poltrona movel"], ["🛏️", "cama"], ["🚪", "porta"],
        ["🪟", "janela"], ["🗄️", "armario arquivo gaveta"], ["🗃️", "caixa arquivo gaveta"],
        ["🧹", "vassoura limpeza"], ["🪣", "balde limpeza"], ["🧽", "esponja limpeza"],
        ["🧴", "frasco limpeza"], ["🧺", "cesto roupa"], ["🧻", "papel higienico"],
        ["🪞", "espelho"], ["🚽", "vaso sanitario banheiro"], ["🚿", "chuveiro"],
        ["🛁", "banheira"], ["🧊", "gelo refrigeracao"], ["❄️", "frio ar condicionado"],
        ["🧲", "ima"], ["🪤", "armadilha"], ["🪒", "barbeador"],
        ["🔑", "chave acesso"], ["🔒", "cadeado fechado seguranca"], ["🔓", "cadeado aberto"],
        ["🪪", "crachá identificacao cartao"], ["💳", "cartao pagamento"], ["🪙", "moeda"],
        ["💰", "dinheiro"], ["🧾", "recibo nota"], ["🧷", "alfinete"],
        ["📎", "clipe papel"], ["📌", "tachinha pino"], ["✂️", "tesoura"],
        ["🖊️", "caneta"], ["✏️", "lapis"], ["🖍️", "giz"],
        ["📚", "livros"], ["📖", "livro"], ["📒", "caderno"],
        ["📁", "pasta arquivo"], ["📂", "pasta aberta"], ["🗂️", "organizador arquivo"],
        ["📋", "prancheta lista"], ["🗓️", "calendario"], ["🕰️", "relogio"],
        ["⏱️", "cronometro"], ["🧭", "bussola"], ["🗺️", "mapa"],
        ["🧳", "mala bagagem"], ["🎒", "mochila"], ["👜", "bolsa"],
        ["🪪", "identidade cracha"], ["🦺", "colete seguranca"], ["🥽", "oculos protecao"],
        ["🧤", "luva protecao"], ["⛑️", "capacete protecao"], ["🎽", "uniforme roupa"],
        ["🧵", "linha costura"], ["🪡", "agulha"], ["🧶", "la tecido"],
        ["🪢", "corda no"], ["🧴", "frasco"], ["🪥", "escova dentes"]
    ] },
    { nome: "Transporte", icone: "🚗", itens: [
        ["🚗", "carro automovel"], ["🚙", "utilitario suv"], ["🚕", "taxi"],
        ["🚐", "van"], ["🚌", "onibus"], ["🚎", "trolebus"],
        ["🚓", "viatura policia"], ["🚑", "ambulancia"], ["🚒", "bombeiros"],
        ["🚚", "caminhao entrega"], ["🚛", "caminhao carga"], ["🚜", "trator"],
        ["🏎️", "carro corrida"], ["🛻", "caminhonete pickup"], ["🏍️", "moto"],
        ["🛵", "scooter"], ["🚲", "bicicleta"], ["🛴", "patinete"],
        ["🚂", "trem locomotiva"], ["🚆", "trem"], ["🚇", "metro"],
        ["✈️", "aviao"], ["🚁", "helicoptero"], ["🚀", "foguete"],
        ["🚢", "navio"], ["⛵", "veleiro barco"], ["🚤", "lancha barco"],
        ["⚓", "ancora"], ["⛽", "combustivel posto"], ["🛞", "pneu roda"],
        ["🚧", "obra barreira"], ["🚦", "semaforo"], ["🅿️", "estacionamento"]
    ] },
    { nome: "Locais", icone: "🏢", itens: [
        ["🏢", "predio escritorio"], ["🏠", "casa"], ["🏭", "fabrica industria"],
        ["🏪", "loja"], ["🏥", "hospital"], ["🏫", "escola"],
        ["🏛️", "instituicao predio"], ["🏗️", "construcao"], ["🏦", "banco"],
        ["🏨", "hotel"], ["🏬", "shopping"], ["🏚️", "casa antiga"],
        ["⛺", "barraca acampamento"], ["🏕️", "acampamento"], ["🌳", "arvore jardim"],
        ["🌲", "pinheiro"], ["🌴", "palmeira"], ["🪴", "planta vaso"],
        ["🌷", "flor"], ["🌻", "girassol"], ["🔥", "fogo"],
        ["💧", "agua gota"], ["☀️", "sol"], ["🌙", "lua"],
        ["☁️", "nuvem"], ["🌧️", "chuva"], ["⚡", "raio eletricidade"],
        ["♻️", "reciclagem"], ["🗑️", "lixeira"], ["🚮", "depositar lixo"]
    ] },
    { nome: "Pessoas", icone: "😀", itens: [
        ["😀", "sorriso feliz"], ["😃", "alegre"], ["😄", "rindo"],
        ["😁", "sorrindo"], ["😆", "risada"], ["😅", "alivio"],
        ["😂", "lagrimas alegria"], ["🙂", "leve sorriso"], ["🙃", "invertido"],
        ["😉", "piscadela"], ["😊", "feliz"], ["🥰", "carinho"],
        ["😍", "apaixonado"], ["🤩", "estrela"], ["😘", "beijo"],
        ["😋", "gostoso"], ["😛", "lingua"], ["🤪", "bobo"],
        ["😎", "oculos escuros"], ["🤓", "nerd"], ["🥳", "festa"],
        ["😐", "neutro"], ["😑", "sem expressao"], ["🤔", "pensando"],
        ["😕", "confuso"], ["🙁", "triste"], ["😟", "preocupado"],
        ["😮", "surpreso"], ["😲", "espantado"], ["😴", "dormindo"],
        ["😷", "mascara"], ["🤒", "doente"], ["🤕", "machucado"],
        ["😢", "chorando"], ["😭", "choro"], ["😤", "irritado"],
        ["😠", "bravo"], ["🤯", "mente explodindo"], ["🤖", "robo"],
        ["👷", "trabalhador obra"], ["🧑‍🔧", "mecanico manutencao"],
        ["🧑‍💻", "tecnologia programador"], ["🧑‍🔬", "cientista laboratorio"],
        ["👮", "policial"], ["👩‍⚕️", "medica saude"], ["👨‍🏫", "professor"],
        ["👋", "ola mao"], ["👍", "positivo"], ["👎", "negativo"],
        ["👌", "ok"], ["✌️", "vitoria"], ["👏", "aplauso"]
    ] },
    { nome: "Símbolos", icone: "🔣", itens: [
        ["✅", "aprovado certo"], ["☑️", "marcado"], ["❌", "cancelado errado"],
        ["⚠️", "atencao aviso"], ["🚫", "proibido"], ["ℹ️", "informacao"],
        ["❓", "duvida"], ["❗", "exclamacao"], ["➕", "mais"],
        ["➖", "menos"], ["➡️", "direita"], ["⬅️", "esquerda"],
        ["⬆️", "cima"], ["⬇️", "baixo"], ["🔴", "vermelho"],
        ["🟠", "laranja"], ["🟡", "amarelo"], ["🟢", "verde"],
        ["🔵", "azul"], ["🟣", "roxo"], ["⚫", "preto"],
        ["⚪", "branco"], ["🟥", "quadrado vermelho"], ["🟩", "quadrado verde"],
        ["🔺", "triangulo"], ["⭐", "estrela"], ["❤️", "coracao"],
        ["🔔", "sino notificacao"], ["🔕", "silencio"], ["♿", "acessibilidade"],
        ["🚻", "banheiro"], ["🚹", "masculino"], ["🚺", "feminino"],
        ["🆘", "socorro emergencia"], ["🆕", "novo"], ["🆗", "ok"]
    ] }
];

const emojiPicker = {
    campo: null,
    grupo: "Objetos",
    recentes: []
};

function normalizarPesquisaEmoji(texto) {
    return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function lerRecentesEmoji() {
    try {
        const salvos = JSON.parse(localStorage.getItem("inventario-emojis-recentes") || "[]");
        return Array.isArray(salvos) ? salvos.filter((item) => typeof item === "string").slice(0, 24) : [];
    } catch {
        return [];
    }
}

function atualizarBotaoEmoji(campo) {
    const botao = document.querySelector(`[data-emoji-target="${campo.id}"]`);
    if (!botao) return;
    botao.querySelector(".emoji-atual").textContent = campo.value || "＋";
    botao.querySelector(".emoji-descricao").textContent = campo.value
        ? `Alterar emoji ${campo.value}`
        : campo.id === "tipoIcone" ? "Herdar da categoria" : "Escolher emoji";
}

function definirEmoji(campo, valor) {
    campo.value = valor;
    atualizarBotaoEmoji(campo);
    if (valor) {
        emojiPicker.recentes = [valor, ...emojiPicker.recentes.filter((item) => item !== valor)].slice(0, 24);
        try { localStorage.setItem("inventario-emojis-recentes", JSON.stringify(emojiPicker.recentes)); } catch { /* armazenamento opcional */ }
    }
    document.getElementById("dialogEmoji").close();
}

function renderizarEmojiPicker() {
    const abas = document.getElementById("emojiAbas");
    const grade = document.getElementById("emojiGrade");
    const busca = normalizarPesquisaEmoji(document.getElementById("buscarEmoji").value);
    abas.replaceChildren();
    grade.replaceChildren();

    GRUPOS_EMOJI.forEach((grupo) => {
        const aba = document.createElement("button");
        aba.type = "button";
        aba.setAttribute("role", "tab");
        aba.setAttribute("aria-selected", String(grupo.nome === emojiPicker.grupo));
        aba.title = grupo.nome;
        aba.setAttribute("aria-label", grupo.nome);
        aba.textContent = grupo.icone;
        aba.addEventListener("click", () => {
            emojiPicker.grupo = grupo.nome;
            document.getElementById("buscarEmoji").value = "";
            renderizarEmojiPicker();
        });
        abas.appendChild(aba);
    });

    const catalogo = busca
        ? GRUPOS_EMOJI.slice(1).flatMap((grupo) => grupo.itens)
        : emojiPicker.grupo === "Recentes"
            ? emojiPicker.recentes.map((emoji) => [emoji, "recente"])
            : GRUPOS_EMOJI.find((grupo) => grupo.nome === emojiPicker.grupo).itens;
    const vistos = new Set();
    catalogo.forEach(([emoji, palavras]) => {
        if (vistos.has(emoji) || (busca && !normalizarPesquisaEmoji(`${emoji} ${palavras}`).includes(busca))) return;
        vistos.add(emoji);
        const botao = document.createElement("button");
        botao.type = "button";
        botao.textContent = emoji;
        botao.title = palavras;
        botao.setAttribute("aria-label", palavras);
        botao.addEventListener("click", () => definirEmoji(emojiPicker.campo, emoji));
        grade.appendChild(botao);
    });
    if (!grade.children.length) {
        const vazio = document.createElement("p");
        vazio.className = "emoji-vazio";
        vazio.textContent = busca ? "Nenhum emoji encontrado. Você pode colar outro abaixo." : "Nenhum emoji recente.";
        grade.appendChild(vazio);
    }
}

function iniciarEmojiPicker() {
    emojiPicker.recentes = lerRecentesEmoji();
    document.querySelectorAll(".botao-escolher-emoji").forEach((botao) => {
        const campo = document.getElementById(botao.dataset.emojiTarget);
        botao.addEventListener("click", () => {
            emojiPicker.campo = campo;
            emojiPicker.grupo = "Objetos";
            document.getElementById("buscarEmoji").value = "";
            document.getElementById("emojiManual").value = "";
            renderizarEmojiPicker();
            document.getElementById("dialogEmoji").showModal();
            document.getElementById("buscarEmoji").focus();
        });
        atualizarBotaoEmoji(campo);
    });
    document.getElementById("buscarEmoji").addEventListener("input", renderizarEmojiPicker);
    document.getElementById("fecharEmoji").addEventListener("click", () => document.getElementById("dialogEmoji").close());
    document.getElementById("limparEmoji").addEventListener("click", () => definirEmoji(emojiPicker.campo, ""));
    document.getElementById("usarEmojiManual").addEventListener("click", () => {
        const valor = document.getElementById("emojiManual").value.trim();
        const quantidade = [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(valor)].length;
        if (!valor || quantidade !== 1 || valor.length > 32) {
            document.getElementById("emojiManual").setCustomValidity("Cole apenas um emoji ou símbolo.");
            document.getElementById("emojiManual").reportValidity();
            return;
        }
        document.getElementById("emojiManual").setCustomValidity("");
        definirEmoji(emojiPicker.campo, valor);
    });
    document.getElementById("emojiManual").addEventListener("input", (evento) => evento.target.setCustomValidity(""));
    document.getElementById("emojiManual").addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") document.getElementById("usarEmojiManual").click();
    });
}

window.EmojiPicker = { iniciar: iniciarEmojiPicker, atualizarBotao: atualizarBotaoEmoji };
