const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const RAIZ=__dirname,GLB='/home/user/nexorconsulting/solucoes/cardapio-3d/modelos',DEST=process.argv[2];const N=72;
const srv=http.createServer((q,res)=>{let u=decodeURIComponent(q.url.split('?')[0]);let f=u.startsWith('/glb/')?path.join(GLB,u.slice(5)):path.join(RAIZ,u);
if(!fs.existsSync(f)){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});fs.createReadStream(f).pipe(res);});
srv.listen(0,async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});const p=await b.newPage({viewport:{width:640,height:640}});
p.on('pageerror',e=>console.log('erro',e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/giro.html`);await p.waitForFunction('window.pronto');
for(const n of ['pizza-calabresa','x-burger','suco-laranja','bolo-chocolate']){await p.evaluate(x=>window.carregar(x),n);fs.mkdirSync(path.join(DEST,n),{recursive:true});
for(let i=0;i<N;i++){const d=await p.evaluate(a=>window.quadro(a),i/N*Math.PI*2);fs.writeFileSync(path.join(DEST,n,String(i).padStart(2,'0')+'.png'),Buffer.from(d.split(',')[1],'base64'));}console.log(n);}
await b.close();srv.close();});
