// =====================
// Ações da interface
// =====================

const btnBuscar = document.getElementById("btnBuscar");

if (btnBuscar) {
    btnBuscar.addEventListener("click", buscarAtivo);
}

const btnAdicionar = document.getElementById("btnAdicionar");

btnAdicionar.addEventListener("click", () => {
    abrirModal();
});

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

        try {
            const resposta = await fetch(
                `/api/ativos/${encodeURIComponent(ativoSelecionadoId)}`
            );
            const ativo = await lerResposta(
                resposta,
                "Não foi possível carregar o ativo"
            );

            await abrirModalEdicao(ativo);
        } catch (erro) {
            console.error(erro);
            mostrarNotificacao(erro.message, "erro");
        }
    });
}

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

        const idConfirmado = ativoSelecionadoId;
        const patrimonioConfirmado = ativoSelecionado;
        const revisaoConfirmada = ativoSelecionadoRevisao;
        if (!Number.isSafeInteger(Number(revisaoConfirmada)) || Number(revisaoConfirmada) < 1) {
            mostrarNotificacao("Recarregue a lista para conferir a revisão do ativo.", "erro");
            return;
        }
        confirmarExclusao(
            `Excluir ${patrimonioConfirmado}? O ativo, seu histórico, movimentações e imagem ficarão na lixeira por 30 dias. Nesse prazo, o patrimônio ficará reservado e poderá ser restaurado. Após o prazo, a exclusão será definitiva e o patrimônio poderá ser reutilizado. A etiqueta deste ID deixará de abrir o ativo; grave uma nova etiqueta para o novo cadastro.`,
            async () => {
                try {
                    const resposta = await fetch(
                        `/api/ativos/${encodeURIComponent(idConfirmado)}`,
                        { method: "DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({confirmar_exclusao:true,revisao:revisaoConfirmada}) }
                    );
                    const dados = await lerResposta(
                        resposta,
                        "Não foi possível remover o ativo"
                    );

                    mostrarNotificacao(
                        dados.mensagem || "Ativo removido com sucesso.",
                        "sucesso"
                    );
                    ativoSelecionado = null;
                    ativoSelecionadoId = null;
                    ativoSelecionadoRevisao = null;
                    await carregarAtivos();
                } catch (erro) {
                    console.error(erro);
                    if (!mostrarConflitoDeRevisao(erro, `/ativo.html?unidade=${encodeURIComponent(usuarioAtual.unidade_id)}&ativo=${encodeURIComponent(idConfirmado)}`)) {
                        mostrarNotificacao(erro.message, "erro");
                    }
                }
            }
        );
    });
}

const btnRetornar = document.getElementById("btnRetornar");

if (btnRetornar) {
    btnRetornar.addEventListener("click", () => {
        window.location.href = "index.html";
    });
}
