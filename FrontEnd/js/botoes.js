// =====================
// Buscar
// =====================
const btnBuscar = document.getElementById("btnBuscar");

if (btnBuscar) {
    btnBuscar.addEventListener("click", buscarAtivo);
}

// =====================
// Adicionar
// =====================
const btnAdicionar = document.getElementById("btnAdicionar");

btnAdicionar.addEventListener("click", () => {
    abrirModal();
});

// =====================
// Editar
// =====================
const btnEditar = document.getElementById("btnEditar");

if (btnEditar) {

    btnEditar.addEventListener("click", async () => {

        if (!ativoSelecionado) {
            alert("Selecione um ativo");
            return;
        }

        const res = await fetch(`/api/${tipo}/${ativoSelecionado}`);
        const ativo = await res.json();

        abrirModalEdicao(ativo);
    });
}

// =====================
// Remover
// =====================
const btnRemover = document.getElementById("btnRemover");

if (btnRemover) {

    btnRemover.addEventListener("click", () => {

        if (!ativoSelecionado) {
            alert("Selecione um ativo");
            return;
        }

        confirmarExclusao(`Deseja remover ${ativoSelecionado}?`, async () => {

            try {

                const resposta = await fetch(`/api/${tipo}/${ativoSelecionado}`, {
                    method: "DELETE"
                });

                const dados = await resposta.json();

                alert(dados.mensagem);

                ativoSelecionado = null;
                carregarAtivos();

            } catch (erro) {

                console.error(erro);
                alert("Erro ao remover ativo");

            }

        });

    });

}

// =====================
// Imprimir Etiqueta
// =====================

const btnEtiqueta = document.getElementById("btnEtiqueta");

if (btnEtiqueta) {

    btnEtiqueta.addEventListener("click", () => {

        if (!ativoSelecionado) {
            alert("Selecione um ativo");
            return;
        }

        window.open(
            `etiqueta.html?tipo=${tipo}&id=${ativoSelecionado}`,
            "_blank"
        );

    });

}

// =====================
// Retornar a tela de seleção
// =====================

const btnRetornar = document.getElementById("btnRetornar");

if (btnRetornar) {
    btnRetornar.addEventListener("click", () => {

    window.open("index.html", "_self")

})
};
