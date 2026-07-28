document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("tiposAtivo");
    const instrucao = document.getElementById("instrucao");

    try {
        await protegerPagina();
        const dashboardResponse = await fetch("/api/gestao/dashboard");
        const dashboard = await dashboardResponse.json();
        if (dashboardResponse.ok) {
            document.getElementById("totalAtivos").textContent =
                dashboard.total;
            document.getElementById("totalManutencao").textContent =
                dashboard.em_manutencao;
            document.getElementById("totalDesatualizados").textContent =
                dashboard.sem_atualizacao;
            const recentes = document.getElementById(
                "movimentacoesRecentes"
            );
            recentes.innerHTML = dashboard.movimentacoes_recentes.length
                ? ""
                : "<p>Nenhuma movimentação registrada.</p>";
            dashboard.movimentacoes_recentes.forEach((item) => {
                const linha = document.createElement("p");
                linha.textContent =
                    `${item.patrimonio} · ${item.acao} · ${item.usuario_nome}`;
                recentes.appendChild(linha);
            });
        }
        const response = await fetch("/api/tipos");
        const tipos = await response.json();

        if (!response.ok) {
            throw new Error(tipos.erro || "Erro ao carregar tipos");
        }

        container.innerHTML = "";

        if (tipos.length === 0) {
            instrucao.textContent =
                "Nenhum tipo de ativo foi cadastrado.";

            const mensagem = document.createElement("p");
            mensagem.className = "mensagem-vazia";
            mensagem.textContent =
                "Cadastre uma categoria e um tipo de ativo para começar.";
            container.appendChild(mensagem);
            return;
        }

        const categorias = tipos.reduce((grupos, tipo) => {
            const nomeCategoria =
                tipo.categoria_nome || "Sem categoria";

            if (!grupos.has(nomeCategoria)) {
                grupos.set(nomeCategoria, []);
            }

            grupos.get(nomeCategoria).push(tipo);
            return grupos;
        }, new Map());

        categorias.forEach((tiposDaCategoria, categoria) => {
            const card = document.createElement("section");
            const titulo = document.createElement("h2");
            const lista = document.createElement("div");

            card.className = "categoria-card";
            titulo.className = "categoria-titulo";
            titulo.textContent = categoria;
            lista.className = "tipos-lista";

            tiposDaCategoria.forEach((tipo) => {
                const botao = document.createElement("button");
                botao.type = "button";
                botao.className = "tipo-ativo";
                botao.textContent = tipo.nome;
                botao.addEventListener("click", () => {
                    window.location.href =
                        `/exibeAtivos.html?tipo=${encodeURIComponent(
                            tipo.id
                        )}`;
                });

                lista.appendChild(botao);
            });

            card.appendChild(titulo);
            card.appendChild(lista);
            container.appendChild(card);
        });
    } catch (erro) {
        console.error(erro);
        instrucao.textContent =
            "Não foi possível carregar os tipos de ativo.";
        container.innerHTML =
            '<p class="mensagem-vazia">Verifique se o servidor está em execução.</p>';
    }
});
