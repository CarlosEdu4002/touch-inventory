"use strict";

function slug(valor, padrao = "relatorio") {
    const normalizado = String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return normalizado || padrao;
}

function dataArquivo(data = new Date()) {
    const partes = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Cuiaba",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(data);
    const obter = (tipo) => partes.find((p) => p.type === tipo)?.value;
    return `${obter("year")}-${obter("month")}-${obter("day")}`;
}

function nomeArquivo(prefixo, extensao, detalhe = "") {
    const partes = [slug(prefixo), detalhe && slug(detalhe), dataArquivo()]
        .filter(Boolean);
    return `${partes.join("-")}.${String(extensao).replace(/[^a-z0-9]/gi, "")}`;
}

function contentDisposition(nome) {
    const seguro = String(nome).replace(/["\r\n\\/]/g, "-");
    return `attachment; filename="${seguro}"; filename*=UTF-8''${encodeURIComponent(seguro)}`;
}

module.exports = { contentDisposition, dataArquivo, nomeArquivo, slug };
