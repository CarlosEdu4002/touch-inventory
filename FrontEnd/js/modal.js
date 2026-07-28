const modal = document.getElementById("modal");
const tituloModal = document.getElementById("tituloModal");
const camposModal = document.getElementById("camposModal");
const formModal = document.getElementById("formModal");
const btnCancelar = document.getElementById("cancelarModal");

let modoModal = "cadastro";
let ativoEditando = null;
let camposFormulario = [];

function criarControleCampo(campo, valor, edicao) {
    const grupo = document.createElement("div");
    const label = document.createElement("label");
    const tipoControle = tipoInput(campo);
    const controle = document.createElement(
        tipoControle === "textarea"
            ? "textarea"
            : tipoControle === "select"
              ? "select"
              : "input"
    );

    grupo.className = "grupo-campo";
    label.htmlFor = `campo-${campo.nome}`;
    label.textContent = campo.label;

    controle.id = `campo-${campo.nome}`;
    controle.name = campo.nome;
    controle.required = campo.obrigatorio === true;

    if (
        tipoControle !== "textarea" &&
        tipoControle !== "select"
    ) {
        controle.type = tipoControle;
    }

    if (tipoControle === "select") {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent =
            campo.opcoes?.length > 0
                ? "Selecione"
                : "Configure as opções na administração";
        placeholder.disabled = true;
        placeholder.selected = !valor;
        controle.appendChild(placeholder);

        const opcoes = (campo.opcoes || []).map((opcao) =>
            typeof opcao === "object"
                ? opcao
                : { valor: opcao, label: opcao }
        );

        if (
            valor !== undefined &&
            valor !== null &&
            valor !== "" &&
            !opcoes.some(
                (opcao) => String(opcao.valor) === String(valor)
            )
        ) {
            opcoes.unshift({ valor, label: valor });
        }

        opcoes.forEach((opcao) => {
            const option = document.createElement("option");
            option.value = opcao.valor;
            option.textContent = opcao.label;
            option.selected =
                String(opcao.valor) === String(valor);
            controle.appendChild(option);
        });
    } else if (tipoControle === "checkbox") {
        controle.checked = valor === true;
    } else {
        controle.value = valor ?? "";
    }

    if (edicao && campo.editavel === false) {
        controle.disabled = true;
    }

    grupo.appendChild(label);
    grupo.appendChild(controle);
    return grupo;
}

async function montarFormulario(ativo = {}) {
    const contexto = await obterContextoTipo(tipo);
    camposFormulario = contexto.campos;
    camposModal.innerHTML = "";

    camposFormulario.forEach((campo) => {
        const valor =
            campo.nome === "status" && !ativo[campo.nome]
                ? "em_uso"
                : ativo[campo.nome];
        camposModal.appendChild(
            criarControleCampo(
                campo,
                valor,
                modoModal === "edicao"
            )
        );
    });
}

async function abrirModal() {
    try {
        modoModal = "cadastro";
        ativoEditando = null;
        tituloModal.textContent = "Novo Ativo";
        await montarFormulario();
        modal.classList.remove("oculto");
    } catch (erro) {
        console.error(erro);
        alert(erro.message);
    }
}

async function abrirModalEdicao(ativo) {
    try {
        modoModal = "edicao";
        ativoEditando = ativo;
        tituloModal.textContent = "Editar Ativo";
        await montarFormulario(ativo);
        modal.classList.remove("oculto");
    } catch (erro) {
        console.error(erro);
        alert(erro.message);
    }
}

function fecharModal() {
    modal.classList.add("oculto");
    formModal.reset();
    ativoEditando = null;
    modoModal = "cadastro";
}

function coletarDadosFormulario() {
    const dados = {};

    camposFormulario.forEach((campo) => {
        const controle = document.getElementById(
            `campo-${campo.nome}`
        );

        if (controle.disabled && modoModal === "edicao") {
            dados[campo.nome] = ativoEditando[campo.nome];
            return;
        }

        if (campo.tipo === "booleano") {
            dados[campo.nome] = controle.checked;
            return;
        }

        dados[campo.nome] = controle.value.trim();
    });

    return dados;
}

btnCancelar.addEventListener("click", fecharModal);

formModal.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    try {
        const dados = coletarDadosFormulario();
        const url =
            modoModal === "cadastro"
                ? `/api/${encodeURIComponent(tipo)}`
                : `/api/${encodeURIComponent(
                      tipo
                  )}/${encodeURIComponent(ativoEditando.patrimonio)}`;
        const response = await fetch(url, {
            method: modoModal === "cadastro" ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados)
        });

        await lerResposta(response, "Erro ao salvar ativo");
        fecharModal();
        await carregarAtivos();
    } catch (erro) {
        console.error(erro);
        alert(erro.message);
    }
});

function confirmarExclusao(texto, callback) {
    const modalConfirmacao = document.getElementById(
        "modalConfirmacao"
    );
    const textoConfirmacao = document.getElementById(
        "textoConfirmacao"
    );
    const btnCancelarRemocao = document.getElementById(
        "btnCancelarRemocao"
    );
    const btnConfirmarRemocao = document.getElementById(
        "btnConfirmarRemocao"
    );

    textoConfirmacao.textContent = texto;
    modalConfirmacao.classList.remove("oculto");

    function fechar() {
        modalConfirmacao.classList.add("oculto");
        btnCancelarRemocao.removeEventListener("click", cancelar);
        btnConfirmarRemocao.removeEventListener("click", confirmar);
    }

    function cancelar() {
        fechar();
    }

    function confirmar() {
        fechar();
        callback();
    }

    btnCancelarRemocao.addEventListener("click", cancelar);
    btnConfirmarRemocao.addEventListener("click", confirmar);
}
