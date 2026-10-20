// Função: Normaliza um emoji ou símbolo curto usado nos marcadores do mapa.
function normalizarIcone(valor) {
    const icone = String(valor || "").trim();
    const partes = [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(icone)];
    if (partes.length > 1 || icone.length > 32) {
        const erro = new Error(
            "Escolha apenas um emoji ou símbolo para o ícone"
        );
        erro.status = 400;
        throw erro;
    }
    return icone || null;
}

module.exports = { normalizarIcone };
