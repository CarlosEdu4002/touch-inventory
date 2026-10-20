"use strict";

const BOM_UTF8 = "\uFEFF";

function formatarData(valor, incluirHora = true) {
    if (!valor) return "";
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    const partes = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Cuiaba",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(incluirHora && {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        })
    }).formatToParts(data);
    const obter = (tipo) => partes.find((p) => p.type === tipo)?.value || "";
    const dataTexto = `${obter("year")}-${obter("month")}-${obter("day")}`;
    return incluirHora
        ? `${dataTexto} ${obter("hour")}:${obter("minute")}:${obter("second")}`
        : dataTexto;
}

function neutralizarFormula(valor) {
    const texto = String(valor ?? "");
    return /^[\t\r\n ]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
}

function escaparCelula(valor) {
    if (valor === null || valor === undefined) return '""';
    let texto;
    if (valor instanceof Date) texto = formatarData(valor);
    else if (typeof valor === "object") texto = JSON.stringify(valor);
    else texto = String(valor);
    texto = neutralizarFormula(texto).replace(/"/g, '""');
    return `"${texto}"`;
}

function gerarCsv(colunas, registros = []) {
    const cabecalho = colunas.map((coluna) =>
        escaparCelula(coluna.label)
    ).join(";");
    const linhas = registros.map((registro) =>
        colunas.map((coluna) => {
            const valor = typeof coluna.valor === "function"
                ? coluna.valor(registro)
                : registro[coluna.chave];
            return escaparCelula(valor);
        }).join(";")
    );
    return `${BOM_UTF8}${[cabecalho, ...linhas].join("\r\n")}\r\n`;
}

module.exports = {
    BOM_UTF8,
    escaparCelula,
    formatarData,
    gerarCsv,
    neutralizarFormula
};
