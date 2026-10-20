const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validarPedido, validarCampos } = require("../services/validacaoCampos.service");
const campo = (tipo, extra = {}) => ({ nome: "valor", label: "Valor", tipo, ...extra });
const erro = { status: 400 };

test("tipos rejeitam coerções, números não finitos e datas inexistentes", () => {
    for (const [tipo, invalidos, validos] of [
        ["texto", [12, true, {}, []], ["texto"]],
        ["textarea", [12, {}], ["texto\ncompleto"]],
        ["numero", [true, [], {}, "0x10", "Infinity", "abc", Infinity, "1e999"], [0, -2.5, "0", "12.5", "1e2"]],
        ["booleano", [0, "false", "true", {}, []], [true, false]],
        ["data", ["2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01", "2026-1-01", 20260101], ["2024-02-29", "2026-10-06"]]
    ]) {
        for (const valor of invalidos) assert.throws(() => validarCampos({ valor }, [campo(tipo)]), erro, `${tipo}: ${JSON.stringify(valor)}`);
        for (const valor of validos) assert.deepEqual(validarCampos({ valor }, [campo(tipo)]), { valor });
    }
});

test("obrigatoriedade aceita zero e falso; opcionais aceitam vazio", () => {
    for (const valor of [undefined, null, "", "   "]) {
        assert.throws(() => validarCampos({ valor }, [campo("texto", { obrigatorio: true })]), erro);
        assert.doesNotThrow(() => validarCampos({ valor }, [campo("texto")]));
    }
    assert.deepEqual(validarCampos({ valor: false }, [campo("booleano", { obrigatorio: true })]), { valor: false });
    assert.deepEqual(validarCampos({ valor: 0 }, [campo("numero", { obrigatorio: true })]), { valor: 0 });
});

test("seleções respeitam opções simples e opções legadas com valor e rótulo", () => {
    for (const tipo of ["select", "selecao"]) {
        const campos = [campo(tipo, { opcoes: ["220 V", { valor: 1, label: "Um" }] })];
        assert.throws(() => validarCampos({ valor: "999 V" }, campos), erro);
        assert.throws(() => validarCampos({ valor: {} }, campos), erro);
        assert.deepEqual(validarCampos({ valor: "1" }, campos), { valor: "1" });
        assert.deepEqual(validarCampos({ valor: "220 V" }, campos), { valor: "220 V" });
    }
});

test("edição preserva omitidos e legado; bloqueados não mudam nem são apagados", () => {
    const campos = [campo("numero", { editavel: false }), { nome: "texto", tipo: "texto" }];
    const anterior = { valor: 12, texto: "original", antigo: "preservar" };
    assert.deepEqual(validarCampos({ valor: "12", texto: "novo" }, campos, anterior), { ...anterior, texto: "novo" });
    assert.deepEqual(validarCampos({}, campos, anterior), anterior);
    for (const valor of [13, null, "", false]) assert.throws(() => validarCampos({ valor }, campos, anterior), erro);
    assert.throws(() => validarCampos({ valor: " " }, campos, { valor: 0 }), erro);
    assert.throws(() => validarCampos({ antigo: "alterar" }, campos, anterior), erro);
    assert.deepEqual(validarCampos({}, [campo("numero", { editavel: false, obrigatorio: true })], {}), {});
    assert.deepEqual(validarCampos({ valor: "legado" }, campos, { valor: "legado" }), { valor: "legado" });
});

test("pedidos malformados, controles inválidos e chaves reservadas são rejeitados", () => {
    const body = { patrimonio: "TESTE", setor_id: "1" };
    assert.doesNotThrow(() => validarPedido(body));
    for (const invalido of [null, [], {}, { ...body, patrimonio: 123 }, { ...body, patrimonio: " " },
        { ...body, patrimonio: "a".repeat(51) }, { ...body, setor_id: [1] }, { ...body, setor_id: true },
        { ...body, status: [] }, { ...body, imagem: {} }, { ...body, remover_imagem: "true" },
        { ...body, imagem: "imagem", remover_imagem: true }]) assert.throws(() => validarPedido(invalido), erro);
    for (const chave of ["id", "dados", "constructor", "prototype", "imagem_url", "inventado", "__proto__"]) {
        assert.throws(() => validarCampos(JSON.parse(`{"${chave}":"invasao"}`), [campo("texto")]), erro);
    }
});
