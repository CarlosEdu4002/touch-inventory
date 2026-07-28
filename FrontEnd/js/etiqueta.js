const params = new URLSearchParams(window.location.search);

const tipo = params.get("tipo");
const id = params.get("id");

async function carregarEtiqueta() {

    try {
        await protegerPagina();

        const res = await fetch(`/api/${tipo}/${id}`);

        const ativo = await res.json();

        document.getElementById("tipo").textContent = ativo.categoria;
        document.getElementById("patrimonio").textContent = ativo.patrimonio;

    } catch (erro) {

        console.error(erro);

    }

}

carregarEtiqueta();
