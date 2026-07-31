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
            mostrarNotificacao(
                "Selecione um ativo antes de editar.",
                "aviso"
            );
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
            mostrarNotificacao(
                "Selecione um ativo antes de remover.",
                "aviso"
            );
            return;
        }

        confirmarExclusao(`Deseja remover ${ativoSelecionado}?`, async () => {

            try {

                const resposta = await fetch(`/api/${tipo}/${ativoSelecionado}`, {
                    method: "DELETE"
                });

                const dados = await resposta.json();

                mostrarNotificacao(
                    dados.mensagem || "Ativo removido com sucesso.",
                    "sucesso"
                );

                ativoSelecionado = null;
                carregarAtivos();

            } catch (erro) {

                console.error(erro);
                mostrarNotificacao(
                    "Não foi possível remover o ativo.",
                    "erro"
                );

            }

        });

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
