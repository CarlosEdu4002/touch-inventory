// Teste isolado: usa dados fictícios e não acessa o banco nem a aplicação em execução.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

function pdfTeste(rotation = 0, pages = 1) {
    const stream = '0.1 0.7 0.3 rg 80 80 300 220 re f\n0.8 0.1 0.1 rg 500 250 300 220 re f\n0 0 0 RG 3 w 40 40 820 520 re S\n';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${Array(pages).fill('3 0 R').join(' ')}] /Count ${pages} >>`,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 600] /Rotate ${rotation} /Resources << >> /Contents 4 0 R >>`,
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`
    ];
    let result = '%PDF-1.7\n'; const offsets = [0];
    for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
    const start = Buffer.byteLength(result);
    result += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return Buffer.from(result);
}

(async () => {
    const root = path.resolve(__dirname, '../../../FrontEnd');
    const output = path.resolve(__dirname, '../output'); fs.mkdirSync(output, { recursive: true });
    const buffer = pdfTeste();
    const planta = { id: 1, nome: 'Planta PDF de teste', arquivo: 'teste.pdf', imagem_url: '/uploads/plantas/teste.pdf', largura: 1200, altura: 800, ativo: true, ambientes: [], ativos: [] };
    const imagem = { ...planta, id: 2, nome: 'Planta PNG', arquivo: 'teste.png', imagem_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=' };
    let uploaded;
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/uploads/plantas/teste.pdf') { res.setHeader('Content-Type', 'application/pdf'); return res.end(buffer); }
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'POST') { const chunks = []; for await (const chunk of req) chunks.push(chunk); uploaded = JSON.parse(Buffer.concat(chunks)); return res.end(JSON.stringify(planta)); }
            const data = url.pathname === '/api/auth/me' ? { usuario: { id: 1, nome: 'Teste', perfil: 'admin' } }
                : url.pathname === '/api/mapas' ? [planta, imagem] : url.pathname === '/api/mapas/1' ? planta : url.pathname === '/api/mapas/2' ? imagem : [];
            return res.end(JSON.stringify(data));
        }
        const file = path.resolve(root, '.' + url.pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
        const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const [file, svg, selector] of [['mapa.html', 'svgMapa', '#zoomMais'], ['mapa-admin.html', 'svgEditor', '#zoomEditorMais']]) {
            await page.goto(base + '/' + file);
            if (file.includes('admin')) await page.selectOption('#seletorPlantaAdmin', '1');
            await page.waitForFunction(id => document.querySelector('#' + id + ' foreignObject canvas')?.width > 0, svg);
            await page.waitForTimeout(250);
            const before = await page.locator('#' + svg + ' canvas').evaluate(c => c.width);
            for (let i = 0; i < 4; i++) await page.locator(selector).click();
            await page.waitForTimeout(500);
            const pixels = await page.locator('#' + svg + ' canvas').evaluate(c => {
                const values = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let colored = 0;
                for (let i = 0; i < values.length; i += 4) if (values[i + 3] && Math.max(values[i], values[i + 1], values[i + 2]) - Math.min(values[i], values[i + 1], values[i + 2]) > 40) colored++;
                return { width: c.width, colored };
            });
            assert.ok(pixels.colored > 1000, 'A planta precisa ser desenhada no canvas');
            assert.notEqual(pixels.width, before, 'O zoom precisa renderizar uma nova região/resolução');
            const viewportId = file.includes('admin') ? 'viewportEditor' : 'viewportMapa';
            const area = await page.locator('#' + viewportId).boundingBox();
            const leftBefore = await page.locator('#' + svg + ' foreignObject').getAttribute('x');
            if (file.includes('admin')) {
                await page.mouse.click(area.x + area.width / 2, area.y + area.height / 2);
                await page.keyboard.down('Space');
            }
            await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
            await page.mouse.down();
            await page.mouse.move(area.x + area.width / 2 + 120, area.y + area.height / 2 + 70, { steps: 8 });
            await page.mouse.up();
            if (file.includes('admin')) await page.keyboard.up('Space');
            await page.waitForTimeout(400);
            assert.notEqual(await page.locator('#' + svg + ' foreignObject').getAttribute('x'), leftBefore, 'Mover o mapa precisa renderizar a nova região');
            if (file.includes('admin')) {
                await page.locator('#novoAmbiente').click();
                for (const [x, y] of [[120, 120], [220, 120], [220, 220]]) await page.mouse.click(area.x + x, area.y + y);
                await page.waitForFunction(() => adminMapa.pontos.length === 3);
                assert.equal(await page.locator('#svgEditor .vertice-editor').count(), 3, 'O PDF não pode bloquear o desenho das salas');
                await page.locator('#cancelarAmbiente').click();
            }
            await page.screenshot({ path: path.join(output, file.replace('.html', '-pdf.png')) });
            const select = file.includes('admin') ? '#seletorPlantaAdmin' : '#seletorPlanta';
            await page.selectOption(select, '2');
            await page.waitForFunction(id => !!document.querySelector('#' + id + ' image') && !document.querySelector('#' + id + ' foreignObject'), svg);
            await page.selectOption(select, '1');
            await page.waitForFunction(id => document.querySelector('#' + id + ' foreignObject canvas')?.width > 0, svg);
            console.log('OK: PDF, zoom, deslocamento, seleção e compatibilidade PNG em ' + file);
        }
        await page.locator('#novaPlanta').click();
        await page.locator('#plantaNome').fill('PDF recortado');
        await page.locator('#plantaArquivo').setInputFiles({ name: 'planta.pdf', mimeType: 'application/pdf', buffer });
        await page.locator('#formPlanta button[type=submit]').click();
        await page.waitForFunction(() => !document.getElementById('dialogPlanta').open);
        assert.equal(uploaded.largura, 1200); assert.equal(uploaded.altura, 800);
        assert.equal(uploaded.imagem, 'data:application/pdf;base64,' + buffer.toString('base64'));
        const dimensions = await page.evaluate(async bytes => PlantaPDF.dimensoes(new File([new Uint8Array(bytes)], 'girada.pdf', { type: 'application/pdf' })), [...pdfTeste(90)]);
        assert.deepEqual(dimensions, { largura: 800, altura: 1200 });
        const invalid = await page.evaluate(async bytes => { try { await PlantaPDF.dimensoes(new File([new Uint8Array(bytes)], 'multipagina.pdf')); return ''; } catch (error) { return error.message; } }, [...pdfTeste(0, 2)]);
        assert.match(invalid, /única página/);
        assert.deepEqual(errors, []);
        console.log('OK: cadastro preserva bytes; dimensões e rotação; rejeição de múltiplas páginas; sem erros JavaScript.');
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
