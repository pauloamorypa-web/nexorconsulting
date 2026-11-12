/*!
 * Fundo Rede Nexor — fundo animado de pontos conectados das telas de acesso dos sistemas Nexor.
 * Sem dependências. Funciona em qualquer página.
 * Fonte única: assets/acesso/ (copie para o produto com tools/acesso.sh; não edite as cópias).
 *
 * NAS TELAS DE ACESSO DOS PRODUTOS não precisa de nada: basta carregar este arquivo e o acesso.css.
 * Ele acha sozinho a tela de acesso (seletores em ALVOS), liga o fundo e põe a classe nx-acesso.
 *
 * USO RÁPIDO (sem escrever JavaScript):
 *   <div data-fundo-rede style="position:fixed;inset:0;z-index:-1"></div>
 *   <script src="fundo-rede.js"></script>
 *
 * USO COM OPÇÕES:
 *   const fundo = FundoRede(document.querySelector('#meuFundo'), { tema: 'claro', densidade: 1.3 });
 *   fundo.parar();   // pausa a animação
 *   fundo.iniciar(); // retoma
 *   fundo.destruir(); // remove o canvas e os eventos
 *
 * Também dá para configurar pelo HTML: data-tema="claro", data-densidade="1.5", data-interativo="false",
 * data-cor-linha="59,141,255", data-cor-destaque="0,225,251", data-fundo="#010524".
 */
(function (global) {
  'use strict';

  var TEMAS = {
    escuro: { fundo: '#010524', corLinha: '59,141,255', corPonto: 'rgba(59,141,255,.8)' },
    claro:  { fundo: '#EBF1F9', corLinha: '0,88,250', corPonto: 'rgba(0,88,250,.5)' }
  };

  var PADRAO = {
    tema: 'escuro',          // 'escuro', 'claro' ou 'auto' (segue o tema do sistema)
    fundo: null,             // cor de fundo; null = a do tema; 'transparente' = sem fundo
    corLinha: null,          // "R,G,B" das linhas e do brilho principal; null = a do tema
    corPonto: null,          // cor dos pontos (qualquer cor CSS); null = a do tema
    corDestaque: '0,225,251',// "R,G,B" das linhas até o mouse e do brilho do canto (ciano Nexor)
    densidade: 1,            // 1 = normal; 2 = o dobro de pontos; 0.5 = metade
    maxPontos: 90,           // limite de pontos (protege celulares)
    distancia: 130,          // distância máxima (px) para ligar dois pontos
    velocidade: 1,           // 1 = normal
    interativo: true,        // pontos fogem do mouse e ligam-se a ele
    brilho: true             // manchas de luz suaves nos cantos
  };

  function FundoRede(alvo, opcoes) {
    if (!alvo) throw new Error('FundoRede: informe o elemento onde o fundo vai ficar.');
    var o = {}, k;
    for (k in PADRAO) o[k] = PADRAO[k];
    for (k in (opcoes || {})) if (opcoes[k] !== undefined && opcoes[k] !== null) o[k] = opcoes[k];

    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    if (getComputedStyle(alvo).position === 'static') alvo.style.position = 'relative';
    if (!alvo.style.overflow) alvo.style.overflow = 'hidden';
    alvo.insertBefore(canvas, alvo.firstChild);

    var ctx = canvas.getContext('2d');
    var mqTema = global.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    var mqMov = global.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var W = 0, H = 0, pts = [], mouse = { x: -999, y: -999 }, raf = 0, rodando = false;

    function cores() {
      var nome = o.tema === 'auto' ? (mqTema && mqTema.matches ? 'escuro' : 'claro') : (TEMAS[o.tema] ? o.tema : 'escuro');
      var t = TEMAS[nome];
      return { fundo: o.fundo || t.fundo, linha: o.corLinha || t.corLinha, ponto: o.corPonto || t.corPonto, destaque: o.corDestaque };
    }
    function pintarFundo() {
      var f = cores().fundo;
      alvo.style.background = (f === 'transparente' || f === 'transparent') ? '' : f;
    }
    function tamanho() {
      var r = alvo.getBoundingClientRect(), dpr = Math.min(2, global.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(o.maxPontos, (W * H / 11000) * o.densidade));
      var v = 0.3 * o.velocidade;
      pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * v, vy: (Math.random() - .5) * v });
      if (!rodando) quadro(true);
    }
    function quadro(soDesenhar) {
      var c = cores(), lc = c.linha, dc = c.destaque, D = o.distancia, i, j, p, a, b, d, dx, dy;
      ctx.clearRect(0, 0, W, H);
      if (o.brilho) {
        var g = ctx.createRadialGradient(W * .75, H * .2, 0, W * .75, H * .2, Math.max(W, H) * .8);
        g.addColorStop(0, 'rgba(' + lc + ',.16)'); g.addColorStop(1, 'rgba(' + lc + ',0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        var g2 = ctx.createRadialGradient(W * .15, H * .9, 0, W * .15, H * .9, Math.max(W, H) * .5);
        g2.addColorStop(0, 'rgba(' + dc + ',.12)'); g2.addColorStop(1, 'rgba(' + dc + ',0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      }
      if (soDesenhar !== true) {
        var min = .12 * o.velocidade;
        for (i = 0; i < pts.length; i++) {
          p = pts[i];
          if (o.interativo) { dx = p.x - mouse.x; dy = p.y - mouse.y; d = Math.hypot(dx, dy); if (d < 140 && d > 0) { p.vx += dx / d * .04; p.vy += dy / d * .04; } }
          p.vx *= .995; p.vy *= .995;
          if (Math.hypot(p.vx, p.vy) < min) { p.vx *= 1.05; p.vy *= 1.05; }
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        }
      }
      ctx.lineWidth = 1;
      for (i = 0; i < pts.length; i++) for (j = i + 1; j < pts.length; j++) {
        a = pts[i]; b = pts[j]; d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < D) { ctx.strokeStyle = 'rgba(' + lc + ',' + (.22 * (1 - d / D)) + ')'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        if (o.interativo) { d = Math.hypot(p.x - mouse.x, p.y - mouse.y); if (d < 160) { ctx.strokeStyle = 'rgba(' + dc + ',' + (.5 * (1 - d / 160)) + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); } }
        ctx.fillStyle = c.ponto; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, 7); ctx.fill();
      }
    }
    function laco() { if (!rodando) return; quadro(); raf = requestAnimationFrame(laco); }

    // o mouse é lido na janela inteira, então funciona mesmo com conteúdo por cima do fundo
    function aoMover(e) { var r = alvo.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function aoSair() { mouse = { x: -999, y: -999 }; }
    function aoTema() { pintarFundo(); if (!rodando) quadro(true); }
    function aoMovimento() { if (mqMov.matches) api.parar(); else api.iniciar(); }
    function aoVisibilidade() { if (document.hidden) { cancelAnimationFrame(raf); } else if (rodando) { cancelAnimationFrame(raf); raf = requestAnimationFrame(laco); } }

    var ro = global.ResizeObserver ? new ResizeObserver(tamanho) : null;
    if (ro) ro.observe(alvo); else global.addEventListener('resize', tamanho);
    global.addEventListener('pointermove', aoMover, { passive: true });
    document.documentElement.addEventListener('pointerleave', aoSair);
    document.addEventListener('visibilitychange', aoVisibilidade);
    if (mqTema && mqTema.addEventListener) mqTema.addEventListener('change', aoTema);
    if (mqMov && mqMov.addEventListener) mqMov.addEventListener('change', aoMovimento);

    var api = {
      iniciar: function () { if (rodando) return api; rodando = true; raf = requestAnimationFrame(laco); return api; },
      parar: function () { rodando = false; cancelAnimationFrame(raf); quadro(true); return api; },
      opcoes: function (novas) { for (var k in novas) o[k] = novas[k]; pintarFundo(); tamanho(); return api; },
      destruir: function () {
        api.parar();
        if (ro) ro.disconnect(); else global.removeEventListener('resize', tamanho);
        global.removeEventListener('pointermove', aoMover);
        document.documentElement.removeEventListener('pointerleave', aoSair);
        document.removeEventListener('visibilitychange', aoVisibilidade);
        if (mqTema && mqTema.removeEventListener) mqTema.removeEventListener('change', aoTema);
        if (mqMov && mqMov.removeEventListener) mqMov.removeEventListener('change', aoMovimento);
        canvas.remove();
      }
    };

    pintarFundo(); tamanho();
    // quem pediu ao sistema para reduzir animações vê o desenho parado
    if (!(mqMov && mqMov.matches)) api.iniciar();
    return api;
  }

  // inicia sozinho em todo elemento com data-fundo-rede
  function auto() {
    var els = document.querySelectorAll('[data-fundo-rede]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i]; if (el._fundoRede) continue;
      var ds = el.dataset, num = function (v) { return v == null ? undefined : +v; };
      el._fundoRede = FundoRede(el, {
        tema: ds.tema, fundo: ds.fundo, corLinha: ds.corLinha, corPonto: ds.corPonto, corDestaque: ds.corDestaque,
        densidade: num(ds.densidade), velocidade: num(ds.velocidade), distancia: num(ds.distancia),
        interativo: ds.interativo == null ? undefined : ds.interativo !== 'false',
        brilho: ds.brilho == null ? undefined : ds.brilho !== 'false'
      });
    }
  }

  // Telas de acesso dos sistemas Nexor: são desenhadas pelo JavaScript de cada produto, então
  // observamos a página, ligamos o fundo quando a tela aparece e desligamos quando ela some.
  var ALVOS = '.login, .p-login, .tela-entrar, .entrar, #entrada.entrada, .nx-tela-acesso';
  function acessos() {
    var els = document.querySelectorAll(ALVOS), i, el;
    for (i = 0; i < els.length; i++) {
      el = els[i]; if (el._fundoRede || el.closest('.nx-acesso')) continue;
      el.classList.add('nx-acesso');
      el._fundoRede = FundoRede(el, { tema: 'escuro' });
      vivos.push(el);
    }
    for (i = vivos.length - 1; i >= 0; i--) if (!vivos[i].isConnected) { vivos[i]._fundoRede.destruir(); vivos[i]._fundoRede = null; vivos.splice(i, 1); }
    document.documentElement.classList.toggle('nx-acesso-aberto', vivos.some(function (e) { return !e.hidden && e.offsetParent !== null; }));
  }
  var vivos = [], agendado = false;
  function comeca() {
    auto(); acessos();
    if (global.MutationObserver) new MutationObserver(function () {
      if (agendado) return; agendado = true;
      (global.requestAnimationFrame || setTimeout)(function () { agendado = false; auto(); acessos(); });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  if (typeof document === 'undefined') { /* fora do navegador: só exporta */ }
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comeca); else comeca();

  global.FundoRede = FundoRede;
  if (typeof module === 'object' && module.exports) module.exports = FundoRede;
})(typeof window !== 'undefined' ? window : this);
