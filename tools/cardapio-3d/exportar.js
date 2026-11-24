const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = __dirname, DEST = process.argv[2];
const tipos = { '.js': 'text/javascript', '.html': 'text/html' };
const srv = http.createServer((q, r) => { const f = path.join(RAIZ, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
srv.listen(0, async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', m => console.log('[console]', m.type(), m.text())); p.on('pageerror', e => console.log('[erro]', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/pagina.html`); await p.waitForFunction('window.pronto');
  const nomes = ['pizza-margherita','pizza-calabresa','x-burger','batata-frita','suco-laranja','limonada','bolo-chocolate','pudim'];
  fs.mkdirSync(path.join(DEST, 'modelos'), { recursive: true }); fs.mkdirSync(path.join(DEST, 'img'), { recursive: true });
  for (const n of nomes) {
    const r = await p.evaluate(x => window.gerar(x), n);
    const glb = Buffer.from(r.glb, 'base64'); fs.writeFileSync(path.join(DEST, 'modelos', n + '.glb'), glb);
    fs.writeFileSync(path.join(DEST, 'img', n + '.webp'), Buffer.from(r.img.split(',')[1], 'base64'));
    console.log(n, (glb.length / 1024).toFixed(0) + ' KB');
  }
  await b.close(); srv.close();
});
