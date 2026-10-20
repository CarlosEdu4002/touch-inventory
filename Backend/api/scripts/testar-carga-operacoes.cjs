// Ensaio de gravacoes ou exportacoes com contas ficticias da massa descartavel.
// Execute no Windows para nao disputar a CPU da VM sob teste.
const fs = require('node:fs');
const net = require('node:net');

const argv = process.argv.slice(2);
const opcoes = {};
for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
        opcoes[argv[i].slice(2)] = argv[++i];
    }
}
const cenario = opcoes.cenario;
const base = opcoes.url || 'http://127.0.0.1:3000';
const contasPath = opcoes.contas;
const niveis = String(opcoes.usuarios || (cenario === 'gravacao' ? '1,10,25,50,99' : '1,5,10,25'))
    .split(',').map(Number);
const rodadas = Number(opcoes.rodadas || 2);
const timeoutMs = Number(opcoes.timeout || 60000);
const runId = Date.now().toString(36);

function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
function percentil(valores, p) {
    if (!valores.length) return null;
    const lista = [...valores].sort((a, b) => a - b);
    return Math.round(lista[Math.ceil(p * lista.length) - 1]);
}
function validarDestino() {
    exigir(argv.includes('--ambiente-descartavel'), 'Exige --ambiente-descartavel.');
    exigir(['gravacao', 'exportacao'].includes(cenario), 'Use --cenario gravacao ou exportacao.');
    exigir(contasPath && fs.existsSync(contasPath), 'Arquivo privado de contas ficticias ausente.');
    const destino = new URL(base);
    const partes = destino.hostname.split('.').map(Number);
    const privado = net.isIP(destino.hostname) === 4 && (
        partes[0] === 10 ||
        (partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) ||
        (partes[0] === 192 && partes[1] === 168)
    );
    const local = ['127.0.0.1', 'localhost'].includes(destino.hostname);
    exigir(destino.protocol === 'http:' && destino.port === '3000' && destino.origin === base &&
        (local || (privado && argv.includes('--alvo-vm-descartavel'))),
    'Use localhost:3000 ou IP privado da VM:3000 com --alvo-vm-descartavel.');
    if (cenario === 'gravacao') exigir(argv.includes('--permitir-gravacao-descartavel'),
        'Gravacao exige --permitir-gravacao-descartavel; cria ativos ficticios.');
    exigir(Number.isInteger(rodadas) && rodadas >= 1 && rodadas <= 10, 'Rodadas devem ser 1 a 10.');
    exigir(Number.isInteger(timeoutMs) && timeoutMs >= 5000 && timeoutMs <= 120000,
        'Timeout deve ser 5000 a 120000 ms.');
    exigir(niveis.length && niveis.every(n => Number.isInteger(n) && n >= 1 && n <= 99),
        'Niveis devem ser 1 a 99 usuarios.');
}
async function pedido(sessao, rota, metodo = 'GET', corpo, tipo = 'json') {
    const headers = {};
    if (sessao?.cookie) headers.Cookie = sessao.cookie;
    if (sessao?.contexto) headers['X-Inventario-Contexto'] = sessao.contexto;
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    const inicio = performance.now();
    const resposta = await fetch(base + rota, {
        method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const buffer = await resposta.arrayBuffer();
    const ms = Math.round(performance.now() - inicio);
    let dados = null;
    if (tipo === 'json' && buffer.byteLength) {
        dados = JSON.parse(Buffer.from(buffer).toString('utf8'));
    }
    return { status: resposta.status, ms, bytes: buffer.byteLength, dados,
        cookie: resposta.headers.get('set-cookie')?.split(';', 1)[0],
        contentType: resposta.headers.get('content-type') || '' };
}
async function preparar(conta, senha) {
    const login = await pedido(null, '/api/auth/login', 'POST', { login: conta.login, senha });
    exigir(login.status === 200 && login.cookie?.startsWith('inventario_sessao='),
        `${conta.login}: login HTTP ${login.status}`);
    const sessao = { cookie: login.cookie, contexto: null };
    const acesso = conta.acessos[0];
    const selecao = await pedido(sessao, `/api/unidades/${acesso.unidade_id}/selecionar`,
        'POST', { setor_id: acesso.setores_ids[0] });
    exigir(selecao.status === 200, `${conta.login}: selecao HTTP ${selecao.status}`);
    const me = await pedido(sessao, '/api/auth/me');
    exigir(me.status === 200, `${conta.login}: contexto HTTP ${me.status}`);
    const usuario = me.dados.usuario;
    sessao.contexto = [usuario.unidade_id, usuario.setor_id || 0, usuario.contexto_versao].join(':');
    sessao.setorId = usuario.setor_id;
    const tipos = await pedido(sessao, '/api/tipos');
    exigir(tipos.status === 200 && Array.isArray(tipos.dados) && tipos.dados.length > 0,
        `${conta.login}: tipos indisponiveis`);
    sessao.tipo = tipos.dados[0];
    exigir(Number.isInteger(Number(sessao.tipo.revisao)), `${conta.login}: revisao do tipo ausente`);
    return sessao;
}
async function etapa(sessoes, indice) {
    const resultados = [];
    const inicio = performance.now();
    for (let rodada = 1; rodada <= rodadas; rodada++) {
        const lote = await Promise.all(sessoes.map(async (sessao, usuarioIndice) => {
            const patrimonio = `TC-LD-${runId}-${indice}-${usuarioIndice + 1}-${rodada}`;
            const formato = (usuarioIndice + rodada) % 2 ? 'pdf' : 'csv';
            const rota = cenario === 'gravacao'
                ? `/api/${sessao.tipo.id}` : `/api/exportacoes/inventario.${formato}`;
            try {
                const resposta = cenario === 'gravacao'
                    ? await pedido(sessao, rota, 'POST', {
                        patrimonio, setor_id: sessao.setorId, status: 'disponivel',
                        tipo_revisao: sessao.tipo.revisao
                    })
                    : await pedido(sessao, rota, 'GET', undefined, 'binario');
                const esperado = cenario === 'gravacao' ? 201 : 200;
                const tipoCorreto = cenario === 'gravacao' ||
                    resposta.contentType.includes(formato === 'pdf' ? 'application/pdf' : 'text/csv');
                return { ms: resposta.ms, bytes: resposta.bytes,
                    erro: resposta.status === esperado && tipoCorreto ? null
                        : `${rota}: HTTP ${resposta.status}, tipo ${resposta.contentType}` };
            } catch (erro) {
                return { ms: null, bytes: 0, erro: `${rota}: ${erro.name || erro.message}` };
            }
        }));
        resultados.push(...lote);
    }
    const duracao = (performance.now() - inicio) / 1000;
    const tempos = resultados.filter(item => item.ms !== null).map(item => item.ms);
    const falhas = resultados.filter(item => item.erro);
    return {
        usuarios: sessoes.length, rodadas, requisicoes: resultados.length,
        segundos: Number(duracao.toFixed(1)), rps: Number((resultados.length / duracao).toFixed(1)),
        falhas: falhas.length, taxaFalhas: Number((100 * falhas.length / resultados.length).toFixed(2)),
        p50ms: percentil(tempos, .5), p95ms: percentil(tempos, .95),
        p99ms: percentil(tempos, .99), maxMs: tempos.length ? Math.max(...tempos) : null,
        bytesRecebidos: resultados.reduce((soma, item) => soma + item.bytes, 0),
        exemplosFalhas: [...new Set(falhas.map(item => item.erro))].slice(0, 5)
    };
}
async function verificarGravacoes(sessoes, arquivoResultado) {
    const execucao = JSON.parse(fs.readFileSync(arquivoResultado, 'utf8'));
    exigir(execucao.cenario === 'gravacao' && /^[a-z0-9]+$/.test(execucao.runId) &&
        Array.isArray(execucao.resultados), 'Resultado de gravacao invalido.');
    let esperados = 0, confirmados = 0;
    const ausentes = [];
    for (let etapaIndice = 0; etapaIndice < execucao.resultados.length; etapaIndice++) {
        const etapa = execucao.resultados[etapaIndice];
        for (let rodada = 1; rodada <= execucao.rodadas; rodada++) {
            for (let inicio = 0; inicio < etapa.usuarios; inicio += 10) {
                const lote = Array.from({ length: Math.min(10, etapa.usuarios - inicio) }, (_, i) => inicio + i);
                await Promise.all(lote.map(async i => {
                    const sessao = sessoes[i];
                    const patrimonio = `TC-LD-${execucao.runId}-${etapaIndice + 1}-${i + 1}-${rodada}`;
                    esperados++;
                    try {
                        const resposta = await pedido(sessao,
                            `/api/${sessao.tipo.id}/${encodeURIComponent(patrimonio)}`);
                        if (resposta.status === 200 && resposta.dados?.patrimonio === patrimonio) confirmados++;
                        else ausentes.push(`${patrimonio}: HTTP ${resposta.status}`);
                    } catch (erro) { ausentes.push(`${patrimonio}: ${erro.name || erro.message}`); }
                }));
            }
        }
        console.log(`Etapa ${etapaIndice + 1}: ${confirmados}/${esperados} ativos confirmados ate aqui.`);
    }
    console.log(JSON.stringify({ esperados, confirmados, ausentes: ausentes.slice(0, 10) }));
    exigir(confirmados === esperados, 'Nem todos os cadastros foram encontrados pela API.');
}
async function main() {
    validarDestino();
    const dados = JSON.parse(fs.readFileSync(contasPath, 'utf8'));
    exigir(dados.finalidade === 'inventario-carga' && typeof dados.senha === 'string' &&
        Array.isArray(dados.contas) && dados.contas.length === 99,
    'Arquivo nao corresponde a massa ficticia de 99 contas.');
    const status = await pedido(null, '/api/auth/status');
    exigir(status.status === 200 && status.dados?.configurado, 'Aplicacao indisponivel.');
    console.log(`Cenario ${cenario}; preparando ${Math.max(...niveis)} contas em ${base}...`);
    const sessoes = [];
    for (let i = 0; i < Math.max(...niveis); i++) {
        sessoes.push(await preparar(dados.contas[i], dados.senha));
        if ((i + 1) % 25 === 0) console.log(`${i + 1} sessoes prontas.`);
    }
    if (opcoes.verificar) {
        exigir(cenario === 'gravacao', 'Verificacao disponivel apenas para gravacao.');
        await verificarGravacoes(sessoes, opcoes.verificar);
        return;
    }
    const resultados = [];
    for (let i = 0; i < niveis.length; i++) {
        console.log(`Etapa ${i + 1}: ${niveis[i]} usuarios, ${rodadas} rodadas...`);
        const resultado = await etapa(sessoes.slice(0, niveis[i]), i + 1);
        resultados.push(resultado);
        console.log(JSON.stringify(resultado));
        if (resultado.falhas) break;
    }
    if (opcoes.saida) fs.writeFileSync(opcoes.saida, JSON.stringify({
        data: new Date().toISOString(), cenario, base, runId, rodadas, timeoutMs,
        observacao: cenario === 'gravacao'
            ? 'Cria ativos ficticios; medir apenas em ambiente descartavel.'
            : 'Exportacoes CSV/PDF setoriais em ambiente descartavel.',
        resultados
    }, null, 2));
    console.log('Ensaio encerrado.');
}
main().catch(erro => { console.error(erro.message); process.exitCode = 1; });
