const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const mapasModel = require("../models/mapas.model");
const setoresModel = require("../models/setores.model");
const historicoModel = require("../models/historico.model");
const vinculosModel = require("../models/vinculos.model");
const ativosModel = require("../models/ativos.model");
const transacao = require("../database/transacao");

const DIRETORIO_PLANTAS = path.join(__dirname, "../../../uploads/plantas");
const TIPOS = {
    "application/pdf": { extensao: "pdf", assinatura: (b) => b.toString("ascii", 0, 5) === "%PDF-" },
    "image/jpeg": { extensao: "jpg", assinatura: (b) => b[0] === 0xff && b[1] === 0xd8 },
    "image/png": { extensao: "png", assinatura: (b) => b.toString("hex", 0, 8) === "89504e470d0a1a0a" },
    "image/webp": { extensao: "webp", assinatura: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" }
};

function erro(mensagem, status = 400) {
    const falha = new Error(mensagem);
    falha.status = status;
    return falha;
}

function texto(valor, limite) {
    return String(valor || "").trim().slice(0, limite);
}

function urlPlanta(arquivo) {
    return require("../database/contexto-unidade").urlArquivo(`/uploads/plantas/${encodeURIComponent(arquivo)}`);
}

async function salvarArquivo(valor) {
    const correspondencia = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(valor || ""));
    const tipo = correspondencia && TIPOS[correspondencia[1]];
    if (!tipo) throw erro("Planta inválida. Use PDF, JPG, PNG ou WebP");

    const conteudo = Buffer.from(correspondencia[2], "base64");
    if (!conteudo.length || conteudo.length > 10 * 1024 * 1024) {
        throw erro("A planta deve ter no máximo 10 MB");
    }
    if (!tipo.assinatura(conteudo)) throw erro("O conteúdo do arquivo não corresponde ao formato informado");

    await fs.mkdir(DIRETORIO_PLANTAS, { recursive: true });
    const nome = `${crypto.randomUUID()}.${tipo.extensao}`;
    await fs.writeFile(path.join(DIRETORIO_PLANTAS, nome), conteudo, { flag: "wx" });
    return nome;
}

async function apagarArquivo(nome) {
    if (!nome) return;
    await fs.unlink(path.join(DIRETORIO_PLANTAS, path.basename(nome))).catch((falha) => {
        if (falha.code !== "ENOENT") throw falha;
    });
}

function normalizarPonto(ponto) {
    const x = Number(ponto?.x);
    const y = Number(ponto?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        throw erro("Os pontos do ambiente precisam estar dentro da planta");
    }
    return { x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) };
}

function orientacao(a, b, c) {
    return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}

function segmentosCruzam(a, b, c, d) {
    return orientacao(a, b, c) !== orientacao(a, b, d) && orientacao(c, d, a) !== orientacao(c, d, b);
}

function validarPoligono(valor) {
    if (!Array.isArray(valor) || valor.length < 3 || valor.length > 100) {
        throw erro("Desenhe um ambiente com pelo menos 3 e no máximo 100 pontos");
    }
    const pontos = valor.map(normalizarPonto);
    for (let i = 0; i < pontos.length; i += 1) {
        const a = pontos[i];
        const b = pontos[(i + 1) % pontos.length];
        for (let j = i + 1; j < pontos.length; j += 1) {
            if (Math.abs(i - j) <= 1 || (i === 0 && j === pontos.length - 1)) continue;
            const c = pontos[j];
            const d = pontos[(j + 1) % pontos.length];
            if (segmentosCruzam(a, b, c, d)) throw erro("As linhas do ambiente não podem se cruzar");
        }
    }
    return pontos;
}

function centroide(pontos) {
    let area = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < pontos.length; i += 1) {
        const atual = pontos[i];
        const proximo = pontos[(i + 1) % pontos.length];
        const fator = atual.x * proximo.y - proximo.x * atual.y;
        area += fator;
        x += (atual.x + proximo.x) * fator;
        y += (atual.y + proximo.y) * fator;
    }
    area /= 2;
    if (Math.abs(area) < 0.0000001) throw erro("O ambiente desenhado não possui área válida");
    const ponto = { x: x / (6 * area), y: y / (6 * area) };
    if (pontoNoPoligono(ponto, pontos)) return ponto;

    const limites = pontos.reduce(
        (resultado, item) => ({
            minX: Math.min(resultado.minX, item.x),
            maxX: Math.max(resultado.maxX, item.x),
            minY: Math.min(resultado.minY, item.y),
            maxY: Math.max(resultado.maxY, item.y)
        }),
        { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );
    let melhor = null;
    let distancia = Infinity;
    for (let linha = 1; linha < 40; linha += 1) {
        for (let coluna = 1; coluna < 40; coluna += 1) {
            const candidato = {
                x: limites.minX +
                    (limites.maxX - limites.minX) * (coluna / 40),
                y: limites.minY +
                    (limites.maxY - limites.minY) * (linha / 40)
            };
            if (!pontoNoPoligono(candidato, pontos)) continue;
            const distanciaAtual =
                (candidato.x - ponto.x) ** 2 +
                (candidato.y - ponto.y) ** 2;
            if (distanciaAtual < distancia) {
                melhor = candidato;
                distancia = distanciaAtual;
            }
        }
    }
    if (melhor) return melhor;

    return {
        x: (pontos[0].x + pontos[1].x) / 2,
        y: (pontos[0].y + pontos[1].y) / 2
    };
}

function pontoNoSegmento(ponto, a, b) {
    const cruzado = (ponto.y - a.y) * (b.x - a.x) - (ponto.x - a.x) * (b.y - a.y);
    if (Math.abs(cruzado) > 0.000001) return false;
    return ponto.x >= Math.min(a.x, b.x) - 0.000001 && ponto.x <= Math.max(a.x, b.x) + 0.000001 && ponto.y >= Math.min(a.y, b.y) - 0.000001 && ponto.y <= Math.max(a.y, b.y) + 0.000001;
}

function pontoNoPoligono(ponto, poligono) {
    let dentro = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        if (pontoNoSegmento(ponto, poligono[j], poligono[i])) return true;
        const cruza = poligono[i].y > ponto.y !== poligono[j].y > ponto.y &&
            ponto.x < ((poligono[j].x - poligono[i].x) * (ponto.y - poligono[i].y)) /
                (poligono[j].y - poligono[i].y) + poligono[i].x;
        if (cruza) dentro = !dentro;
    }
    return dentro;
}

function validarPlanta(body, exigeArquivo) {
    const nome = texto(body.nome, 120);
    const largura = Number(body.largura);
    const altura = Number(body.altura);
    if (!nome) throw erro("Informe o nome da planta");
    if (exigeArquivo && !body.imagem) throw erro("Selecione o arquivo da planta");
    if (exigeArquivo && (!Number.isInteger(largura) || !Number.isInteger(altura) || largura <= 0 || altura <= 0 || largura > 50000 || altura > 50000)) {
        throw erro("As dimensões da planta são inválidas");
    }
    return {
        nome,
        descricao: texto(body.descricao, 300),
        largura,
        altura,
        ordem: Number.isInteger(Number(body.ordem)) ? Number(body.ordem) : 0,
        ativo: body.ativo !== false
    };
}

async function listar(usuario) {
    const plantas = await mapasModel.listarPlantas(usuario.perfil === "admin", usuario);
    return plantas.map((planta) => ({ ...planta, imagem_url: urlPlanta(planta.arquivo) }));
}

async function detalhar(id, usuario) {
    const planta = await mapasModel.buscarPlanta(Number(id));
    if (!planta || (!planta.ativo && usuario.perfil !== "admin")) throw erro("Planta não encontrada", 404);
    const [ambientes, ativos] = await Promise.all([
        mapasModel.listarAmbientes(planta.id, usuario),
        mapasModel.listarAtivosDaPlanta(planta.id, usuario)
    ]);
    return { ...planta, imagem_url: urlPlanta(planta.arquivo), ambientes, ativos };
}

async function criar(body, usuario) {
    const dados = validarPlanta(body, true);
    const arquivo = await salvarArquivo(body.imagem);
    try {
        const planta = await mapasModel.criarPlanta({ ...dados, arquivo }, usuario.id);
        return { ...planta, imagem_url: urlPlanta(arquivo) };
    } catch (falha) {
        await apagarArquivo(arquivo);
        throw falha;
    }
}

async function atualizar(id, body) {
    const atual = await mapasModel.buscarPlanta(Number(id));
    if (!atual) throw erro("Planta não encontrada", 404);
    const dados = validarPlanta({ ...body, largura: atual.largura, altura: atual.altura }, false);
    return mapasModel.atualizarPlanta(atual.id, dados);
}

async function remover(id) {
    const removida = await mapasModel.removerPlanta(Number(id));
    if (!removida) throw erro("Planta não encontrada", 404);
    await apagarArquivo(removida.arquivo);
}

async function salvarAmbiente(id, body) {
    const plantaId = Number(body.planta_id);
    const setorId = Number(body.setor_id);
    const nome = texto(body.nome, 120);
    const planta = await mapasModel.buscarPlanta(plantaId);
    const setor = await setoresModel.buscarPorId(setorId);
    if (!planta) throw erro("Planta não encontrada", 404);
    if (!setor) throw erro("Setor inválido");
    if (!nome) throw erro("Informe o nome do ambiente");
    const poligono = validarPoligono(body.poligono);
    const centro = centroide(poligono);
    const cor = /^#[0-9a-f]{6}$/i.test(body.cor) ? body.cor : "#2563eb";
    if (id && !(await mapasModel.buscarAmbiente(Number(id)))) {
        throw erro("Ambiente não encontrado", 404);
    }
    const ambiente = await mapasModel.salvarAmbiente(id ? Number(id) : null, {
        planta_id: plantaId,
        setor_id: setorId,
        nome,
        poligono,
        centro_x: Number(centro.x.toFixed(6)),
        centro_y: Number(centro.y.toFixed(6)),
        cor,
        padrao: body.padrao === true
    });
    if (id) {
        const posicoes = await mapasModel.listarPosicoesAmbiente(ambiente.id);
        const foraDoAmbiente = posicoes
            .filter((posicao) => !pontoNoPoligono(posicao, poligono))
            .map((posicao) => posicao.ativo_id);
        await mapasModel.centralizarAtivos(
            ambiente.id,
            foraDoAmbiente,
            ambiente.centro_x,
            ambiente.centro_y
        );
    }
    return ambiente;
}

async function removerAmbiente(id) {
    if (!(await mapasModel.removerAmbiente(Number(id)))) throw erro("Ambiente não encontrado", 404);
}

async function moverAtivo(ativoId, body, usuario) {
    return transacao.executar(async cliente => {
        if (!(await ativosModel.bloquearPorId(Number(ativoId), usuario, cliente))) throw erro("Ativo não encontrado ou sem permissão", 404);
        const ativo = await mapasModel.buscarAtivoParaMapa(Number(ativoId), usuario, cliente);
        if (!ativo) throw erro("Ativo não encontrado ou sem permissão", 404);
        require("../database/concorrencia").conferir(body.revisao,ativo.revisao);
        const ambiente = await mapasModel.buscarAmbiente(Number(body.ambiente_id), cliente, true);
        if (!ambiente || !ambiente.planta_ativa) throw erro("Ambiente não encontrado", 404);
        if (Number(ambiente.setor_id) !== Number(ativo.setor_id)) throw erro("O ativo não pode sair do setor ao qual está alocado", 409);
        const ponto = normalizarPonto({ x: body.x, y: body.y });
        if (!pontoNoPoligono(ponto, ambiente.poligono)) throw erro("A posição precisa permanecer dentro do ambiente", 409);
        const grupo = await vinculosModel.buscarGrupoPorAtivo(ativo.id, usuario, cliente);
        if (grupo) {
            if (grupo.membros.some((membro) => Number(membro.setor_id) !== Number(ambiente.setor_id))) {
                throw erro("Todos os ativos vinculados precisam permanecer no mesmo setor", 409);
            }
            const posicoes = await mapasModel.atualizarPosicoesGrupo(
                grupo.membros, ambiente, ponto.x, ponto.y, usuario, cliente
            );
            return { grupo_id: grupo.id, grupo_nome: grupo.nome, posicoes };
        }
        const anterior = ativo.ambiente_id ? { ambiente_id: ativo.ambiente_id, ambiente: ativo.ambiente_nome, x: ativo.x, y: ativo.y } : null;
        const posicao = await mapasModel.atualizarPosicao(ativo.id, ambiente.id, ponto.x, ponto.y, usuario.id, cliente);
        await historicoModel.registrar({
            ativo_id: ativo.id,
            patrimonio: ativo.patrimonio,
            tipo_ativo_id: ativo.tipo_ativo_id,
            usuario_id: usuario.id,
            usuario_nome: usuario.nome,
            acao: "posicionamento_mapa",
            descricao: `Posicionado em ${ambiente.nome}`,
            setor_anterior_id: ativo.setor_id,
            setor_novo_id: ativo.setor_id,
            status_anterior: ativo.status,
            status_novo: ativo.status,
            dados_anteriores: anterior,
            dados_novos: { ambiente_id: ambiente.id, ambiente: ambiente.nome, x: ponto.x, y: ponto.y },
            campos_alterados: ["ambiente_mapa", "posicao_mapa"]
        }, cliente);
        return {...posicao,revisao:(await mapasModel.buscarAtivoParaMapa(ativo.id,usuario,cliente)).revisao};
    });
}

module.exports = {
    listar,
    detalhar,
    criar,
    atualizar,
    remover,
    salvarAmbiente,
    removerAmbiente,
    moverAtivo,
    validarPoligono,
    centroide,
    pontoNoPoligono
};
