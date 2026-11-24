// Monta os pratos em three.js. Unidades em metros (tamanho real para a realidade aumentada).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let semente = 7;
function aleatorio() { semente = (semente * 16807) % 2147483647; return (semente - 1) / 2147483646; }
function entre(a, b) { return a + (b - a) * aleatorio(); }

function mat(cor, rug = 0.6, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), roughness: rug, metalness: 0, ...extra });
}
function malha(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; }
// Junta várias peças com o mesmo material numa malha só (arquivo menor).
function juntar(lista, m, nome) {
  const geos = lista.map(o => { o.updateMatrix(); const g = o.geometry.clone().toNonIndexed(); g.applyMatrix4(o.matrix); return g; });
  const g = mergeGeometries(geos); const r = new THREE.Mesh(g, m); r.name = nome || ''; return r;
}
function pecas(n, criar) { const l = []; for (let i = 0; i < n; i++) l.push(criar(i)); return l; }
// Ponto aleatório dentro de um círculo de raio r
function noCirculo(r) { const a = entre(0, Math.PI * 2), d = Math.sqrt(aleatorio()) * r; return [Math.cos(a) * d, Math.sin(a) * d]; }

function prato(raio = 0.2) {
  const pts = [[0, 0], [raio * 0.8, 0], [raio * 0.85, 0.004], [raio, 0.016], [raio * 1.02, 0.02], [raio * 0.98, 0.021], [raio * 0.8, 0.008], [0, 0.008]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const m = malha(new THREE.LatheGeometry(pts, 64), mat('#f4f1ea', 0.25)); m.name = 'prato'; return m;
}
function tabua(raio) {
  const g = new THREE.Group();
  g.add(malha(new THREE.CylinderGeometry(raio, raio, 0.018, 64), mat('#a8743f', 0.75), 0, 0.009, 0));
  const cabo = malha(new THREE.BoxGeometry(0.09, 0.016, 0.045), mat('#a8743f', 0.75), raio + 0.035, 0.009, 0); g.add(cabo);
  return g;
}

function basePizza(raio, grupo) {
  const y = 0.018;
  grupo.add(malha(new THREE.CylinderGeometry(raio, raio, 0.01, 64), mat('#e9b872', 0.8), 0, y + 0.005, 0));
  const borda = malha(new THREE.TorusGeometry(raio - 0.012, 0.014, 16, 72), mat('#c9853f', 0.8), 0, y + 0.012, 0);
  borda.rotation.x = Math.PI / 2; borda.scale.z = 0.8; grupo.add(borda);
  grupo.add(malha(new THREE.CylinderGeometry(raio - 0.02, raio - 0.02, 0.004, 64), mat('#c0301f', 0.55), 0, y + 0.011, 0));
  // queijo derretido: disco com pontos irregulares
  const q = new THREE.CircleGeometry(raio - 0.028, 48); const p = q.attributes.position;
  for (let i = 1; i < p.count; i++) { const k = 1 + Math.sin(i * 1.7) * 0.05 + entre(-0.03, 0.03); p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
  const queijo = malha(q, mat('#f6d77a', 0.45), 0, y + 0.0135, 0); queijo.rotation.x = -Math.PI / 2; grupo.add(queijo);
  return y + 0.014;
}

function pizzaMargherita() {
  const g = new THREE.Group(); const R = 0.16; g.add(tabua(R + 0.02));
  const topo = basePizza(R, g);
  const tom = pecas(9, () => { const [x, z] = noCirculo(R - 0.06); const o = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24)); o.position.set(x, topo + 0.002, z); return o; });
  g.add(juntar(tom, mat('#d8352a', 0.4), 'tomate'));
  const muss = pecas(10, () => { const [x, z] = noCirculo(R - 0.05); const o = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 8)); o.position.set(x, topo + 0.002, z); o.scale.set(1, 0.25, 1); return o; });
  g.add(juntar(muss, mat('#fffaf0', 0.5), 'mussarela'));
  const folha = new THREE.Shape(); folha.moveTo(0, 0); folha.quadraticCurveTo(0.012, 0.012, 0, 0.03); folha.quadraticCurveTo(-0.012, 0.012, 0, 0);
  const manj = pecas(8, () => { const [x, z] = noCirculo(R - 0.05); const o = new THREE.Mesh(new THREE.ShapeGeometry(folha, 6)); o.rotation.set(-Math.PI / 2, 0, entre(0, 6.28)); o.position.set(x, topo + 0.006, z); return o; });
  g.add(juntar(manj, mat('#2f8a3a', 0.5, { side: THREE.DoubleSide }), 'manjericao'));
  return g;
}

function pizzaCalabresa() {
  const g = new THREE.Group(); const R = 0.16; g.add(tabua(R + 0.02));
  const topo = basePizza(R, g);
  const cal = pecas(14, () => { const [x, z] = noCirculo(R - 0.045); const o = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.005, 24)); o.position.set(x, topo + 0.002, z); return o; });
  g.add(juntar(cal, mat('#9e2b25', 0.5), 'calabresa'));
  const pontos = pecas(40, () => { const [x, z] = noCirculo(R - 0.045); const o = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 6)); o.position.set(x, topo + 0.002, z); return o; });
  g.add(juntar(pontos, mat('#f2e4d0', 0.6), 'gordura'));
  const ceb = pecas(9, () => { const [x, z] = noCirculo(R - 0.05); const o = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0025, 6, 24)); o.rotation.set(Math.PI / 2, 0, 0); o.position.set(x, topo + 0.006, z); o.scale.set(1, entre(0.6, 1), 1); return o; });
  g.add(juntar(ceb, mat('#efe3f0', 0.35), 'cebola'));
  const azt = pecas(10, () => { const [x, z] = noCirculo(R - 0.05); const o = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.003, 8, 16)); o.rotation.x = Math.PI / 2; o.position.set(x, topo + 0.004, z); return o; });
  g.add(juntar(azt, mat('#2a2522', 0.3), 'azeitona'));
  return g;
}

function pao(r, h, cor, cima) {
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const a = t * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * h)); }
  if (!cima) pts.reverse();
  const geo = new THREE.LatheGeometry(cima ? [new THREE.Vector2(0, 0), ...pts.slice().reverse().reverse()] : pts, 48);
  return malha(geo, mat(cor, 0.55));
}

function hamburguer() {
  const g = new THREE.Group(); g.add(prato(0.13));
  let y = 0.008; const r = 0.058;
  g.add(malha(new THREE.CylinderGeometry(r, r * 0.95, 0.018, 48), mat('#d99a4e', 0.6), 0, y + 0.009, 0)); y += 0.018;
  // alface ondulada
  const al = new THREE.RingGeometry(0.0, r + 0.01, 48, 1); const p = al.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i); const a = Math.atan2(yy, x); const d = Math.hypot(x, yy); p.setZ(i, d > r * 0.9 ? Math.sin(a * 9) * 0.004 : 0); }
  al.computeVertexNormals();
  const alface = malha(al, mat('#5fae3c', 0.5, { side: THREE.DoubleSide }), 0, y + 0.002, 0); alface.rotation.x = -Math.PI / 2; g.add(alface); y += 0.004;
  g.add(malha(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.02, 48), mat('#5a3320', 0.85), 0, y + 0.01, 0)); y += 0.02;
  // queijo quadrado caindo nas pontas
  const qg = new THREE.PlaneGeometry(r * 2, r * 2, 12, 12); const qp = qg.attributes.position;
  for (let i = 0; i < qp.count; i++) { const x = qp.getX(i), yy = qp.getY(i); const d = Math.hypot(x, yy); qp.setZ(i, d > r ? -(d - r) * 0.9 : 0); }
  qg.computeVertexNormals();
  const qj = malha(qg, mat('#f7b928', 0.4, { side: THREE.DoubleSide }), 0, y + 0.002, 0); qj.rotation.set(-Math.PI / 2, 0, Math.PI / 4); g.add(qj); y += 0.003;
  g.add(malha(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.006, 32), mat('#d93a2b', 0.4), 0, y + 0.003, 0)); y += 0.006;
  g.add(malha(new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.018, 48), mat('#5a3320', 0.85), 0, y + 0.009, 0)); y += 0.018;
  const q2 = qj.clone(); q2.position.y = y + 0.002; q2.rotation.z = 0; g.add(q2); y += 0.003;
  // pão de cima em cúpula
  const topo = new THREE.SphereGeometry(r, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const pt = malha(topo, mat('#d48a3a', 0.5), 0, y, 0); pt.scale.y = 0.75; g.add(pt);
  const ses = pecas(36, () => { const a = entre(0, 6.28), b = entre(0.15, 1.2); const o = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 4));
    o.position.set(Math.cos(a) * Math.sin(b) * r, y + Math.cos(b) * r * 0.75, Math.sin(a) * Math.sin(b) * r); o.scale.set(1, 0.5, 1.7); o.lookAt(0, y - 0.2, 0); return o; });
  g.add(juntar(ses, mat('#fbf1d6', 0.5), 'gergelim'));
  return g;
}

function batata() {
  const g = new THREE.Group(); g.add(prato(0.12));
  // caixinha vermelha
  const cx = new THREE.CylinderGeometry(0.055, 0.04, 0.09, 4, 1, true); cx.rotateY(Math.PI / 4);
  const caixa = malha(cx, mat('#d62a2a', 0.5, { side: THREE.DoubleSide }), 0, 0.053, 0); caixa.scale.z = 0.62; g.add(caixa);
  g.add(malha(new THREE.BoxGeometry(0.055, 0.003, 0.034), mat('#d62a2a', 0.5), 0, 0.0095, 0));
  const fr = pecas(34, () => { const h = entre(0.07, 0.11); const o = new THREE.Mesh(new THREE.BoxGeometry(0.008, h, 0.008));
    o.position.set(entre(-0.03, 0.03), 0.04 + h / 2, entre(-0.016, 0.016)); o.rotation.set(entre(-0.25, 0.25), entre(0, 1), entre(-0.3, 0.3)); return o; });
  g.add(juntar(fr, mat('#f3c14b', 0.6), 'batatas'));
  const soltas = pecas(5, () => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, entre(0.05, 0.07))); const [x, z] = noCirculo(0.07); o.position.set(x + 0.02, 0.013, z + 0.03); o.rotation.y = entre(0, 3); return o; });
  g.add(juntar(soltas, mat('#efb63e', 0.6), 'batatas-soltas'));
  // potinho de molho
  g.add(malha(new THREE.CylinderGeometry(0.022, 0.018, 0.02, 32), mat('#ffffff', 0.3), -0.07, 0.018, 0.04));
  g.add(malha(new THREE.CylinderGeometry(0.019, 0.019, 0.002, 32), mat('#c8321f', 0.3), -0.07, 0.027, 0.04));
  return g;
}

function copo(liquido, enfeite) {
  const g = new THREE.Group();
  const R = 0.037, H = 0.13;
  const vidro = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, transmission: 1, thickness: 0.004, ior: 1.45, transparent: true, opacity: 0.35 });
  const pts = [[0, 0.004], [R * 0.85, 0.004], [R * 0.86, 0], [R, H], [R - 0.0025, H], [R * 0.84, 0.012], [0, 0.012]].map(p => new THREE.Vector2(p[0], p[1]));
  const c = malha(new THREE.LatheGeometry(pts, 48), vidro); c.name = 'copo'; g.add(c);
  const hl = H * 0.8; const rTop = R * 0.84 + (R - R * 0.84) * ((hl) / H);
  g.add(malha(new THREE.CylinderGeometry(rTop - 0.003, R * 0.84 - 0.002, hl - 0.012, 40), mat(liquido, 0.2), 0, 0.012 + (hl - 0.012) / 2, 0));
  // canudo
  const canudo = malha(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 12), mat('#ffffff', 0.4), 0.012, 0.11, 0); canudo.rotation.z = -0.2; g.add(canudo);
  const listra = malha(new THREE.CylinderGeometry(0.0032, 0.0032, 0.03, 12), mat('#e2342c', 0.4), 0.0255, 0.175, 0); listra.rotation.z = -0.2; g.add(listra);
  enfeite(g, H, R);
  return g;
}
function rodelaFruta(cor, casca, r) {
  const g = new THREE.Group();
  const casc = malha(new THREE.CylinderGeometry(r, r, 0.006, 32), mat(casca, 0.5)); g.add(casc);
  const polpa = malha(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.0064, 32), mat(cor, 0.35)); g.add(polpa);
  const gom = pecas(8, i => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.0068, r * 0.85)); o.rotation.y = i * Math.PI / 8; return o; });
  g.add(juntar(gom, mat('#fff6d8', 0.5), 'gomos'));
  return g;
}

function sucoLaranja() {
  const base = new THREE.Group(); base.add(malha(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 48), mat('#e9e2d4', 0.7), 0, 0.003, 0));
  const c = copo('#ff9b1a', (g, H, R) => { const r = rodelaFruta('#ffb733', '#f07d0b', 0.028); r.rotation.set(Math.PI / 2, 0, 0.3); r.position.set(-R + 0.004, H - 0.006, 0); g.add(r); });
  c.position.y = 0.006; base.add(c);
  const meia = malha(new THREE.SphereGeometry(0.03, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f07d0b', 0.5), 0.085, 0.036, 0.03); base.add(meia);
  const topo = rodelaFruta('#ffb733', '#f07d0b', 0.03); topo.position.set(0.085, 0.036, 0.03); base.add(topo);
  return base;
}

function limonada() {
  const base = new THREE.Group(); base.add(malha(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 48), mat('#e9e2d4', 0.7), 0, 0.003, 0));
  const c = copo('#bfe36a', (g, H, R) => {
    const gelo = pecas(5, i => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02)); o.position.set(entre(-0.012, 0.012), H * 0.62 + i * 0.012, entre(-0.012, 0.012)); o.rotation.set(entre(0, 1), entre(0, 1), 0); return o; });
    g.add(juntar(gelo, new THREE.MeshPhysicalMaterial({ color: '#eaffff', roughness: 0.1, transmission: 0.9, transparent: true, opacity: 0.6 }), 'gelo'));
    const r = rodelaFruta('#d4ef6a', '#4f9e2a', 0.025); r.rotation.set(Math.PI / 2, 0, -0.3); r.position.set(R - 0.004, H - 0.006, 0); g.add(r);
    const hort = pecas(3, i => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6)); o.scale.set(1, 0.25, 0.6); o.position.set(-0.01 + i * 0.008, H * 0.8 + 0.004, entre(-0.01, 0.01)); o.rotation.y = i; return o; });
    g.add(juntar(hort, mat('#2e8b3d', 0.5), 'hortela'));
  });
  c.position.y = 0.006; base.add(c);
  return base;
}

function boloChocolate() {
  const g = new THREE.Group(); g.add(prato(0.11));
  const R = 0.12, ang = Math.PI / 4.5, y0 = 0.008;
  const fatia = new THREE.Shape(); fatia.moveTo(0, 0); fatia.absarc(0, 0, R, -ang / 2, ang / 2, false); fatia.lineTo(0, 0);
  const cx = -R * 0.62; // centro da fatia sobre o prato
  const camadas = [['#4a2516', 0.024, 0.75], ['#f1e3c6', 0.007, 0.6], ['#5a2e1a', 0.024, 0.75], ['#f1e3c6', 0.007, 0.6], ['#4a2516', 0.024, 0.75], ['#2b140b', 0.007, 0.25]];
  let y = y0;
  for (const [cor, h, rug] of camadas) {
    const geo = new THREE.ExtrudeGeometry(fatia, { depth: h, bevelEnabled: false, curveSegments: 24 });
    geo.rotateX(-Math.PI / 2);
    const m = malha(geo, mat(cor, rug), cx, y, 0); g.add(m); y += h;
  }
  const ch = pecas(3, i => { const o = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.02, 10)); o.position.set(cx + R * 0.86, y + 0.01, (i - 1) * 0.022); return o; });
  g.add(juntar(ch, mat('#fff8ee', 0.6), 'chantili'));
  g.add(malha(new THREE.SphereGeometry(0.011, 20, 14), mat('#b0101c', 0.2), cx + R * 0.86, y + 0.028, 0));
  const cab = malha(new THREE.CylinderGeometry(0.0012, 0.0012, 0.025, 6), mat('#4d7a22', 0.6), cx + R * 0.86 + 0.004, y + 0.048, 0); cab.rotation.z = -0.3; g.add(cab);
  const ras = pecas(14, () => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.009)); o.position.set(cx + entre(0.03, 0.08), y + 0.001, entre(-0.008, 0.008)); o.rotation.y = entre(0, 3); return o; });
  g.add(juntar(ras, mat('#1c0d07', 0.4), 'raspas'));
  g.rotation.y = -0.6;
  const fora = new THREE.Group(); fora.add(g); return fora;
}

function pudim() {
  const g = new THREE.Group(); g.add(prato(0.12));
  const pts = []; const r0 = 0.075, r1 = 0.055, h = 0.055, furo = 0.012;
  pts.push(new THREE.Vector2(furo, h)); pts.push(new THREE.Vector2(r1 - 0.005, h)); pts.push(new THREE.Vector2(r1, h - 0.004));
  pts.push(new THREE.Vector2(r0, 0.004)); pts.push(new THREE.Vector2(r0 - 0.002, 0)); pts.push(new THREE.Vector2(furo, 0));
  const corpo = malha(new THREE.LatheGeometry(pts.reverse(), 64), mat('#f1c46a', 0.35), 0, 0.008, 0); g.add(corpo);
  const calda = new THREE.LatheGeometry([new THREE.Vector2(furo, h + 0.0015), new THREE.Vector2(r1 + 0.002, h + 0.0015), new THREE.Vector2(r1 + 0.004, h - 0.01), new THREE.Vector2(r1 + 0.001, h - 0.012)].reverse(), 64);
  g.add(malha(calda, mat('#8a3c0c', 0.12, { side: THREE.DoubleSide }), 0, 0.008, 0));
  const poca = malha(new THREE.CylinderGeometry(0.095, 0.095, 0.002, 64), mat('#8a3c0c', 0.12), 0, 0.009, 0); g.add(poca);
  return g;
}

export const PRATOS = {
  'pizza-margherita': pizzaMargherita,
  'pizza-calabresa': pizzaCalabresa,
  'x-burger': hamburguer,
  'batata-frita': batata,
  'suco-laranja': sucoLaranja,
  'limonada': limonada,
  'bolo-chocolate': boloChocolate,
  'pudim': pudim,
};
