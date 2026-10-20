// Ensaio de leitura na VM descartavel, sem dependencias externas.
// Use somente a massa ficticia e as contas criadas por gerar-massa-carga.cjs.
const fs = require('node:fs');
const net = require('node:net');

const args = Object.fromEntries(process.argv.slice(2).map((arg, index, all) => {
    if (!arg.startsWith('--') || !all[index + 1] || all[index + 1].startsWith('--')) return [];
    return [arg.slice(2), all[index + 1]];
}).filter(pair => pair.length));
const base = args.url || 'http://127.0.0.1:3000';
const arquivo = args.contas;
const segundos = Number(args.segundos || 30);
const niveis = String(args.usuarios || '1,10,25,50,99').split(',').map(Number);
const pausaMs = Number(args.pausa || 1000);
const timeoutMs = Number(args.timeout || 10000);

function exigir(condicao, mensagem) { if (!condicao) throw new Error(mensagem); }
function espera(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function percentil(valores, p) {
    if (!valores.length) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    return Math.round(ordenados[Math.ceil(p * ordenados.length) - 1]);
}
async function requisicao(sessao, rota, metodo = 'GET', body) {
    const headers = {};
    if (sessao?.cookie) headers.Cookie = sessao.cookie;
    if (sessao?.contexto) headers['X-Inventario-Contexto'] = sessao.contexto;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const inicio = performance.now();
    const resposta = await fetch(base + rota, {
        method: metodo, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const conteudo = await resposta.text();
    return {
        status: resposta.status,
        ms: Math.round(performance.now() - inicio),
        cookie: resposta.headers.get('set-cookie')?.split(';', 1)[0],
        dados: conteudo ? JSON.parse(conteudo) : null
    };
}
async function preparar(conta, senha) {
    const sessao = { cookie: null, contexto: null, tipos: [] };
    const login = await requisicao(null, '/api/auth/login', 'POST', { login: conta.login, senha });
    exigir(login.status === 200 && login.cookie?.startsWith('inventario_sessao='),
        `Falha ao entrar com ${conta.login}: HTTP ${login.status}`);
    sessao.cookie = login.cookie;
    const acesso = conta.acessos[0];
    const unidade = await requisicao(sessao, `/api/unidades/${acesso.unidade_id}/selecionar`,
        'POST', { setor_id: acesso.setores_ids[0] });
    exigir(unidade.status === 200, `Falha ao selecionar unidade para ${conta.login}: HTTP ${unidade.status}`);
    const me = await requisicao(sessao, '/api/auth/me');
    exigir(me.status === 200, `Falha ao consultar contexto para ${conta.login}: HTTP ${me.status}`);
    const usuario = me.dados.usuario;
    sessao.contexto = [usuario.unidade_id, usuario.setor_id || 0, usuario.contexto_versao].join(':');
    const tipos = await requisicao(sessao, '/api/tipos');
    exigir(tipos.status === 200 && Array.isArray(tipos.dados) && tipos.dados.length,
        `Nenhum tipo de ativo acessivel para ${conta.login}`);
    sessao.tipos = tipos.dados.map(tipo => tipo.id);
    return sessao;
}
function rota(sessao, numero) {
    switch (numero % 5) {
        case 0: return '/api/gestao/dashboard';
        case 1: return '/api/tipos';
        case 2: return `/api/${sessao.tipos[0]}`;
        case 3: return `/api/${sessao.tipos[sessao.tipos.length - 1]}`;
        default: return '/api/mapas';
    }
}
async function etapa(sessoes, duracao, pausa) {
    const fim = Date.now() + duracao * 1000;
    const amostras = [];
    const erros = [];
    const executar = async (sessao, indice) => {
        let numero = indice;
        while (Date.now() < fim) {
            const recurso = rota(sessao, numero++);
            try {
                const resposta = await requisicao(sessao, recurso);
                amostras.push(resposta.ms);
                if (resposta.status !== 200) erros.push(`${recurso}: HTTP ${resposta.status}`);
            } catch (erro) {
                erros.push(`${recurso}: ${erro.name || erro.message}`);
            }
            if (Date.now() < fim) await espera(pausa);
        }
    };
    const inicio = Date.now();
    await Promise.all(sessoes.map(executar));
    const tempoReal = (Date.now() - inicio) / 1000;
    return {
        usuarios: sessoes.length, segundos: Math.round(tempoReal), requisicoes: amostras.length + erros.filter(e => !e.includes('HTTP')).length,
        falhas: erros.length, taxaFalhas: Number((100 * erros.length /
            Math.max(1, amostras.length + erros.filter(e => !e.includes('HTTP')).length)).toFixed(2)),
        rps: Number(((amostras.length + erros.filter(e => !e.includes('HTTP')).length) / tempoReal).toFixed(1)),
        p50ms: percentil(amostras, 0.5), p95ms: percentil(amostras, 0.95),
        p99ms: percentil(amostras, 0.99), maxMs: amostras.length ? Math.max(...amostras) : 0,
        exemplosFalhas: [...new Set(erros)].slice(0, 5)
    };
}
async function main() {
    exigir(process.argv.includes('--ambiente-descartavel'), 'Exige --ambiente-descartavel.');
    exigir(arquivo && fs.existsSync(arquivo), 'Informe --contas com o arquivo privado de contas ficticias.');
    const destino = new URL(base);
    const partes = destino.hostname.split('.').map(Number);
    const privado = net.isIP(destino.hostname) === 4 && partes.length === 4 && (
        partes[0] === 10 ||
        (partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) ||
        (partes[0] === 192 && partes[1] === 168)
    );
    const local = ['127.0.0.1', 'localhost'].includes(destino.hostname);
    exigir(destino.protocol === 'http:' && destino.port === '3000' &&
        destino.origin === base && (local || (privado && process.argv.includes('--alvo-vm-descartavel'))),
    'Use localhost:3000 ou IP privado da VM:3000 com --alvo-vm-descartavel.');
    exigir(Number.isInteger(segundos) && segundos >= 10 && segundos <= 300, 'Use 10 a 300 segundos por etapa.');
    exigir(Number.isInteger(pausaMs) && pausaMs >= 0 && pausaMs <= 10000, 'Pausa invalida.');
    exigir(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60000, 'Timeout invalido.');
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    exigir(dados.finalidade === 'inventario-carga' && typeof dados.senha === 'string' &&
        Array.isArray(dados.contas) && dados.contas.length === 99,
    'Arquivo de contas nao corresponde a massa ficticia esperada.');
    exigir(niveis.length && niveis.every(n => Number.isInteger(n) && n >= 1 && n <= 99),
        'Use niveis entre 1 e 99 usuarios ficticios.');
    const status = await requisicao(null, '/api/auth/status');
    exigir(status.status === 200 && status.dados?.configurado === true, 'Aplicacao indisponivel ou sem administrador.');
    console.log(`Preparando ${Math.max(...niveis)} sessoes ficticias em ${base}...`);
    const sessoes = [];
    for (let i = 0; i < Math.max(...niveis); i++) {
        sessoes.push(await preparar(dados.contas[i], dados.senha));
        if ((i + 1) % 25 === 0) console.log(`${i + 1} sessoes preparadas.`);
    }
    const resultados = [];
    for (const n of niveis) {
        console.log(`Iniciando ${n} usuarios por ${segundos} segundos...`);
        const resultado = await etapa(sessoes.slice(0, n), segundos, pausaMs);
        resultados.push(resultado);
        console.log(JSON.stringify(resultado));
        await espera(5000);
    }
    if (args.saida) fs.writeFileSync(args.saida, JSON.stringify({
        data: new Date().toISOString(), base, segundosPorEtapa: segundos, pausaMs, timeoutMs,
        observacao: 'Consultas de leitura com contas ficticias; nao mede gravacao, NFC ou 100 usuarios reais.',
        resultados
    }, null, 2));
    console.log('Ensaio concluido.');
}
main().catch(erro => { console.error(erro.message); process.exitCode = 1; });
