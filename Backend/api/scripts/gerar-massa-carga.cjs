// Massa descartavel para o projeto Docker inventario-carga em localhost:3000.
// Usa as rotas normais da aplicacao; nunca recebe a senha do administrador por argumento.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BASE = 'http://127.0.0.1:3000';
const LOGIN_ADMIN = 'conta.teste';
const ARQUIVO_CONTAS = path.resolve(__dirname, '../output/massa-carga-contas.json');
const SETORES = ['Operacao', 'Manutencao', 'Almoxarifado'];
const ATIVOS_POR_SETOR = 100;

function exigir(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

function senhaOculta() {
    return new Promise((resolve, reject) => {
        exigir(process.stdin.isTTY && process.stdin.setRawMode,
            'Execute em um terminal interativo para informar a senha sem eco.');
        process.stdout.write('Senha do administrador de teste: ');
        let valor = '';
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        const receber = trecho => {
            for (const caractere of trecho) {
                if (caractere === '\r' || caractere === '\n') {
                    process.stdin.off('data', receber);
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdout.write('\n');
                    resolve(valor);
                    return;
                }
                if (caractere === '\u0003') {
                    process.stdin.setRawMode(false);
                    reject(new Error('Execucao interrompida.'));
                    return;
                }
                if (caractere === '\u007f' || caractere === '\b') valor = valor.slice(0, -1);
                else valor += caractere;
            }
        };
        process.stdin.on('data', receber);
    });
}

async function pedido(sessao, recurso, metodo = 'GET', body = undefined, contexto = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (sessao?.cookie) headers.Cookie = sessao.cookie;
    if (contexto && sessao?.contexto) headers['X-Inventario-Contexto'] = sessao.contexto;
    const resposta = await fetch(BASE + recurso, {
        method: metodo, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(`${metodo} ${recurso}: HTTP ${resposta.status} - ${dados.erro || 'falha'}`);
    return { dados, resposta };
}

async function entrar(login, senha) {
    const { dados, resposta } = await pedido(null, '/api/auth/login', 'POST', { login, senha }, false);
    const cookie = resposta.headers.get('set-cookie')?.split(';', 1)[0];
    exigir(cookie?.startsWith('inventario_sessao='), 'Login sem cookie de sessao.');
    return { cookie, usuario: dados.usuario, contexto: null };
}

async function selecionar(sessao, unidadeId, setorId = undefined) {
    await pedido(sessao, `/api/unidades/${unidadeId}/selecionar`, 'POST',
        setorId === undefined ? {} : { setor_id: setorId }, false);
    const { dados } = await pedido(sessao, '/api/auth/me', 'GET', undefined, false);
    sessao.usuario = dados.usuario;
    sessao.contexto = [dados.usuario.unidade_id, dados.usuario.setor_id || 0,
        dados.usuario.contexto_versao].join(':');
    exigir(Number(sessao.usuario.unidade_id) === Number(unidadeId), 'Unidade selecionada incorreta.');
}

function contasLocais() {
    fs.mkdirSync(path.dirname(ARQUIVO_CONTAS), { recursive: true });
    if (fs.existsSync(ARQUIVO_CONTAS)) {
        const dados = JSON.parse(fs.readFileSync(ARQUIVO_CONTAS, 'utf8'));
        exigir(dados.finalidade === 'inventario-carga' && dados.senha && Array.isArray(dados.contas),
            'Arquivo de contas de teste invalido.');
        return dados;
    }
    const dados = {
        finalidade: 'inventario-carga',
        senha: crypto.randomBytes(24).toString('base64url'),
        contas: []
    };
    fs.writeFileSync(ARQUIVO_CONTAS, JSON.stringify(dados, null, 2), { mode: 0o600, flag: 'wx' });
    return dados;
}

function salvarContas(dados) {
    fs.writeFileSync(ARQUIVO_CONTAS, JSON.stringify(dados, null, 2), { mode: 0o600 });
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function blocoPng(tipo, conteudo) {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(conteudo.length);
    const corpo = Buffer.concat([Buffer.from(tipo), conteudo]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tamanho, corpo, crc]);
}

function imagemFicticia() {
    const largura = 256, altura = 256;
    const cabecalho = Buffer.alloc(13);
    cabecalho.writeUInt32BE(largura, 0);
    cabecalho.writeUInt32BE(altura, 4);
    cabecalho[8] = 8;
    cabecalho[9] = 2;
    const linhas = Buffer.alloc(altura * (1 + largura * 3));
    let semente = 123456789;
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            semente = (1664525 * semente + 1013904223) >>> 0;
            const pos = y * (1 + largura * 3) + 1 + x * 3;
            linhas[pos] = (semente >>> 16) & 255;
            linhas[pos + 1] = (semente >>> 8) & 255;
            linhas[pos + 2] = semente & 255;
        }
    }
    const png = Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        blocoPng('IHDR', cabecalho),
        blocoPng('IDAT', zlib.deflateSync(linhas)),
        blocoPng('IEND', Buffer.alloc(0))
    ]);
    return `data:image/png;base64,${png.toString('base64')}`;
}

function plantaFicticia() {
    const largura = 900, altura = 600;
    const cabecalho = Buffer.alloc(13);
    cabecalho.writeUInt32BE(largura, 0);
    cabecalho.writeUInt32BE(altura, 4);
    cabecalho[8] = 8;
    cabecalho[9] = 2;
    const linhas = Buffer.alloc(altura * (1 + largura * 3));
    const cores = [[223, 236, 255], [224, 248, 232], [255, 241, 220]];
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            const zona = Math.min(2, Math.floor(x / 300));
            const divisoria = x % 300 < 5 || y < 5 || y >= altura - 5;
            const grade = x % 50 === 0 || y % 50 === 0;
            const cor = divisoria ? [38, 50, 70] : grade ? [175, 185, 195] : cores[zona];
            const pos = y * (1 + largura * 3) + 1 + x * 3;
            linhas[pos] = cor[0];
            linhas[pos + 1] = cor[1];
            linhas[pos + 2] = cor[2];
        }
    }
    const png = Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        blocoPng('IHDR', cabecalho),
        blocoPng('IDAT', zlib.deflateSync(linhas)),
        blocoPng('IEND', Buffer.alloc(0))
    ]);
    return `data:image/png;base64,${png.toString('base64')}`;
}

async function main() {
    exigir(process.argv.includes('--ambiente-descartavel'),
        'Use --ambiente-descartavel somente no banco isolado da porta 3000.');
    const estado = await pedido(null, '/api/auth/status', 'GET', undefined, false);
    exigir(estado.dados.configurado === true, 'Crie o administrador antes de gerar a massa.');
    const senhaAdmin = await senhaOculta();
    const admin = await entrar(LOGIN_ADMIN, senhaAdmin);
    exigir(admin.usuario.perfil === 'admin', 'A conta informada nao e administradora.');
    const unidades = (await pedido(admin, '/api/unidades', 'GET', undefined, false)).dados
        .sort((a, b) => a.id - b.id);
    exigir(unidades.length === 9 && unidades.every(u => u.ativo),
        'A massa exige exatamente as nove unidades ativas cadastradas para este ensaio.');
    const contas = contasLocais();
    const estrutura = [];

    for (const unidade of unidades) {
        await selecionar(admin, unidade.id);
        const existentes = (await pedido(admin, '/api/setores?todos=true')).dados;
        const setores = [];
        for (let indice = 0; indice < SETORES.length; indice++) {
            const nome = `Carga ${String(indice + 1).padStart(2, '0')} - ${SETORES[indice]}`;
            let setor = existentes.find(item => item.nome === nome);
            if (!setor) setor = (await pedido(admin, '/api/setores', 'POST', { nome })).dados;
            exigir(setor.ativo === true, `Setor de carga inativo: ${nome}`);
            setores.push(setor);
        }
        estrutura.push({ unidade, setores });
        console.log(`${unidade.nome}: ${setores.length} setores de teste prontos.`);
    }

    await selecionar(admin, unidades[0].id);
    const usuarios = (await pedido(admin, '/api/gestao/usuarios')).dados;
    const existentes = new Set(usuarios.map(u => u.login));
    for (let indice = 0; indice < 99; indice++) {
        const posicao = indice % 27;
        const grupo = estrutura[Math.floor(posicao / 3)];
        const setor = grupo.setores[posicao % 3];
        const login = `carga.usuario${String(indice + 1).padStart(3, '0')}`;
        const acessos = [{ unidade_id: grupo.unidade.id, setores_ids: [setor.id] }];
        if (indice >= 27 && indice < 36) {
            const outra = estrutura[(Math.floor(posicao / 3) + 1) % 9];
            acessos.push({ unidade_id: outra.unidade.id, setores_ids: [outra.setores[posicao % 3].id] });
        }
        if (!existentes.has(login)) {
            await pedido(admin, '/api/gestao/usuarios', 'POST', {
                nome: `Usuario ficticio ${String(indice + 1).padStart(3, '0')}`,
                login, senha: contas.senha, perfil: 'setor', acessos
            });
            existentes.add(login);
        }
        contas.contas[indice] = { login, acessos };
        if ((indice + 1) % 25 === 0) console.log(`${indice + 1}/99 usuarios ficticios prontos.`);
    }
    salvarContas(contas);

    const imagem = imagemFicticia();
    for (let u = 0; u < estrutura.length; u++) {
        const { unidade, setores } = estrutura[u];
        for (let s = 0; s < setores.length; s++) {
            const setor = setores[s];
            const login = contas.contas[u * 3 + s].login;
            const sessao = await entrar(login, contas.senha);
            await selecionar(sessao, unidade.id, setor.id);
            const nomeCategoria = `Carga - Setor ${String(s + 1).padStart(2, '0')}`;
            let categoria = (await pedido(sessao, '/api/categorias')).dados
                .find(c => c.nome === nomeCategoria && Number(c.setor_id) === Number(setor.id));
            if (!categoria) categoria = (await pedido(sessao, '/api/categorias', 'POST', {
                nome: nomeCategoria, icone: '📦'
            })).dados;
            const tipos = [];
            for (const [nome, checklist] of [
                [`Computador Carga ${s + 1}`, true], [`Ferramenta Carga ${s + 1}`, false]
            ]) {
                let tipo = (await pedido(sessao, '/api/tipos')).dados
                    .find(t => t.nome === nome && Number(t.categoria_id) === Number(categoria.id));
                if (!tipo) tipo = (await pedido(sessao, '/api/tipos', 'POST', {
                    categoria_id: categoria.id, nome, icone: '📦',
                    permite_emprestimo: !checklist, permite_checklist: checklist,
                    checklist_recorrencia: 'mensal', checklist_alerta_dias: 15,
                    checklist_itens: checklist ? ['Identificacao', 'Conservacao', 'Funcionamento'] : [],
                    permite_vinculo: true
                })).dados;
                tipos.push(tipo);
            }
            // A resposta de criacao nao inclui a revisao; a listagem devolve a versao atual.
            const tiposAtuais = (await pedido(sessao, '/api/tipos')).dados;
            for (let indice = 0; indice < tipos.length; indice++) {
                tipos[indice] = tiposAtuais.find(t => Number(t.id) === Number(tipos[indice].id));
                exigir(Number.isSafeInteger(Number(tipos[indice]?.revisao)),
                    'Nao foi possivel obter a revisao atual do tipo de ativo.');
            }
            const existentesPorTipo = [];
            for (const tipo of tipos) {
                existentesPorTipo.push(new Set((await pedido(sessao, `/api/${tipo.id}`)).dados
                    .map(ativo => ativo.patrimonio)));
            }
            for (let numero = 1; numero <= ATIVOS_POR_SETOR; numero++) {
                const tipoIndice = numero <= 60 ? 0 : 1;
                const tipo = tipos[tipoIndice];
                const patrimonio = `TC-U${String(unidade.id).padStart(2, '0')}-S${String(s + 1).padStart(2, '0')}-${String(numero).padStart(4, '0')}`;
                if (existentesPorTipo[tipoIndice].has(patrimonio)) continue;
                const status = numero % 20 === 0 ? 'em_manutencao'
                    : numero % 7 === 0 ? 'disponivel' : 'em_uso';
                await pedido(sessao, `/api/${tipo.id}`, 'POST', {
                    patrimonio, setor_id: setor.id, status, tipo_revisao: tipo.revisao,
                    ...(numero % 20 === 0 ? { imagem } : {})
                });
            }
            console.log(`${unidade.nome} / ${setor.nome}: ${ATIVOS_POR_SETOR} ativos de teste prontos.`);
        }
    }
    const imagemPlanta = plantaFicticia();
    for (const { unidade, setores } of estrutura) {
        await selecionar(admin, unidade.id);
        let planta = (await pedido(admin, '/api/mapas')).dados
            .find(item => item.nome === 'Planta ficticia de carga');
        if (!planta) planta = (await pedido(admin, '/api/mapas', 'POST', {
            nome: 'Planta ficticia de carga',
            descricao: 'Imagem e ambientes gerados somente para ensaio de carga e recuperacao.',
            largura: 900, altura: 600, ordem: 1, ativo: true, imagem: imagemPlanta
        })).dados;
        const detalhe = (await pedido(admin, `/api/mapas/${planta.id}`)).dados;
        for (let indice = 0; indice < setores.length; indice++) {
            const setor = setores[indice];
            const nome = `Area ficticia - ${setor.nome}`;
            if (detalhe.ambientes.some(item => item.nome === nome)) continue;
            const inicio = indice / 3 + 0.02;
            const fim = (indice + 1) / 3 - 0.02;
            await pedido(admin, '/api/mapas/ambientes/novo', 'POST', {
                planta_id: planta.id, setor_id: setor.id, nome, padrao: true,
                cor: ['#93c5fd', '#86efac', '#fdba74'][indice],
                poligono: [
                    { x: inicio, y: 0.08 }, { x: fim, y: 0.08 },
                    { x: fim, y: 0.92 }, { x: inicio, y: 0.92 }
                ]
            });
        }
        console.log(`${unidade.nome}: planta ficticia e tres ambientes prontos.`);
    }
    console.log('Massa concluida: nove unidades, 27 setores, 100 contas no total, 2700 ativos e nove plantas ficticias.');
    console.log('Credenciais ficticias de carga guardadas somente em Backend/api/output/massa-carga-contas.json.');
}

main().catch(erro => {
    console.error(erro.message);
    process.exitCode = 1;
});
