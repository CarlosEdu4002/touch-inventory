const modalHistorico = document.getElementById("modalHistorico");
const modalTransferencia = document.getElementById("modalTransferencia");

function exigirAtivoSelecionado() {
    if (!ativoSelecionado) {
        alert("Selecione um ativo");
        return false;
    }
    return true;
}

function formatarDataHora(valor) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(new Date(valor));
}

document.getElementById("btnHistorico").addEventListener("click", async () => {
    if (!exigirAtivoSelecionado()) return;
    try {
        const response = await fetch(
            `/api/${encodeURIComponent(tipo)}/${encodeURIComponent(
                ativoSelecionado
            )}/historico`
        );
        const registros = await lerResposta(
            response,
            "Erro ao carregar histórico"
        );
        const lista = document.getElementById("listaHistorico");
        lista.innerHTML = registros.length
            ? ""
            : '<p class="historico-vazio">Nenhuma movimentação registrada.</p>';
        registros.forEach((registro) => {
            const item = document.createElement("article");
            item.className = "historico-item";
            const setores =
                registro.setor_anterior || registro.setor_novo
                    ? `<p>${registro.setor_anterior || "Sem setor"} → ${
                          registro.setor_novo || "Sem setor"
                      }</p>`
                    : "";
            item.innerHTML = `
                <div>
                    <strong>${registro.acao}</strong>
                    <span>${formatarDataHora(registro.created_at)}</span>
                </div>
                <p>Responsável: ${registro.usuario_nome}</p>
                ${setores}
                ${
                    registro.campos_alterados?.length
                        ? `<p>Campos: ${registro.campos_alterados.join(", ")}</p>`
                        : ""
                }
                ${registro.descricao ? `<p>${registro.descricao}</p>` : ""}
            `;
            lista.appendChild(item);
        });
        modalHistorico.classList.remove("oculto");
    } catch (erro) {
        alert(erro.message);
    }
});

document.getElementById("fecharHistorico").addEventListener("click", () => {
    modalHistorico.classList.add("oculto");
});

document.getElementById("btnTransferir").addEventListener("click", async () => {
    if (!exigirAtivoSelecionado()) return;
    const setores = await lerResposta(
        await fetch("/api/setores"),
        "Erro ao carregar setores"
    );
    const select = document.getElementById("setorDestino");
    select.innerHTML =
        '<option value="">Selecione o setor de destino</option>';
    setores.forEach((setor) => {
        const option = document.createElement("option");
        option.value = setor.id;
        option.textContent = setor.nome;
        select.appendChild(option);
    });
    modalTransferencia.classList.remove("oculto");
});

document
    .getElementById("cancelarTransferencia")
    .addEventListener("click", () => {
        modalTransferencia.classList.add("oculto");
    });

document
    .getElementById("formTransferencia")
    .addEventListener("submit", async (evento) => {
        evento.preventDefault();
        try {
            const response = await fetch(
                `/api/${encodeURIComponent(tipo)}/${encodeURIComponent(
                    ativoSelecionado
                )}/transferir`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        setor_id: document.getElementById("setorDestino").value,
                        observacao: document.getElementById(
                            "observacaoTransferencia"
                        ).value
                    })
                }
            );
            await lerResposta(response, "Erro ao transferir ativo");
            modalTransferencia.classList.add("oculto");
            ativoSelecionado = null;
            await carregarAtivos();
        } catch (erro) {
            alert(erro.message);
        }
    });
