/* Nexor Cardápio 3D · demonstração com restaurante fictício (Cantina Exemplo).
   Sem preço e sem pagamento: o pedido vai pronto para o WhatsApp. */
(function () {
  'use strict';

  var WHATS = '5534997337499'; // WhatsApp comercial da Nexor (na demo)
  var MESA = 4;

  var CATEGORIAS = [
    { id: 'pizzas', nome: 'Pizzas', nota: 'massa de fermentação lenta' },
    { id: 'lanches', nome: 'Lanches', nota: 'feitos na hora' },
    { id: 'bebidas', nome: 'Bebidas', nota: 'geladas' },
    { id: 'sobremesas', nome: 'Sobremesas', nota: 'da casa' }
  ];

  var PRATOS = [
    { id: 'pizza-margherita', cat: 'pizzas', nome: 'Pizza Margherita', desc: 'Molho de tomate, mussarela de búfala, tomate fresco e manjericão.' },
    { id: 'pizza-calabresa', cat: 'pizzas', nome: 'Pizza Calabresa', desc: 'Calabresa fatiada, cebola roxa, azeitona preta e muçarela.' },
    { id: 'x-burger', cat: 'lanches', nome: 'X-Burger da Casa', desc: 'Dois hambúrgueres, cheddar, alface, tomate e pão com gergelim.' },
    { id: 'batata-frita', cat: 'lanches', nome: 'Batata frita', desc: 'Porção crocante com molho da casa.' },
    { id: 'suco-laranja', cat: 'bebidas', nome: 'Suco de laranja', desc: 'Natural, espremido na hora, 400 ml.' },
    { id: 'limonada', cat: 'bebidas', nome: 'Limonada com hortelã', desc: 'Limão, hortelã e gelo, 400 ml.' },
    { id: 'bolo-chocolate', cat: 'sobremesas', nome: 'Bolo de chocolate', desc: 'Fatia com recheio de creme, chantili e cereja.' },
    { id: 'pudim', cat: 'sobremesas', nome: 'Pudim de leite', desc: 'Receita da casa com calda de caramelo.' }
  ];

  var porId = {};
  PRATOS.forEach(function (p) { porId[p.id] = p; });
  var pedido = {}; // id -> quantidade
  var $ = function (s) { return document.querySelector(s); };
  var reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'texto') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k]; // só usado com ícones fixos do próprio arquivo
      else e.setAttribute(k, attrs[k]);
    }
    (filhos || []).forEach(function (f) { if (f) e.appendChild(f); });
    return e;
  }
  function icone(nome) { return '<svg class="ic" aria-hidden="true"><use href="#i-' + nome + '"/></svg>'; }

  /* ---------- Cardápio ---------- */
  function montarCardapio() {
    var raiz = $('#cardapio');
    CATEGORIAS.forEach(function (c) {
      var lista = el('ul', { class: 'pratos' });
      PRATOS.filter(function (p) { return p.cat === c.id; }).forEach(function (p) {
        var foto = el('button', { class: 'prato-foto', type: 'button', 'data-ver': p.id, 'aria-label': 'Ver ' + p.nome + ' em 3D' }, [
          el('img', { src: 'img/' + p.id + '.webp', alt: '', width: '480', height: '480', loading: 'lazy' }),
          el('span', { class: 'selo-3d', html: icone('cubo') + '3D' })
        ]);
        var acoes = el('div', { class: 'prato-acoes' }, [
          el('button', { class: 'btn btn-claro btn-peq', type: 'button', 'data-ver': p.id, html: icone('cubo') + 'Ver em 3D' }),
          el('button', { class: 'btn btn-azul btn-peq', type: 'button', 'data-add': p.id, html: icone('mais') + 'Adicionar' })
        ]);
        lista.appendChild(el('li', { class: 'prato' }, [foto, el('div', {}, [el('h3', { texto: p.nome }), el('p', { texto: p.desc }), acoes])]));
      });
      var titulo = el('h2', {}, [document.createTextNode(c.nome + ' '), el('small', { texto: c.nota })]);
      raiz.appendChild(el('section', { class: 'cat', id: 'cat-' + c.id, 'aria-label': c.nome }, [titulo, lista]));
    });
  }

  /* Categoria ativa conforme a rolagem */
  function observarCategorias() {
    var links = document.querySelectorAll('.categorias a');
    if (!('IntersectionObserver' in window)) return;
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('ativa', a.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('.cat').forEach(function (s) { obs.observe(s); });
  }

  /* ---------- Janelas ---------- */
  var ultimoFoco = null;
  function abrir(j) {
    ultimoFoco = document.activeElement;
    j.hidden = false; document.body.style.overflow = 'hidden'; document.body.classList.add('com-janela');
    var f = j.querySelector('.fechar'); if (f) f.focus();
  }
  function fechar(j) {
    j.hidden = true; document.body.style.overflow = ''; document.body.classList.remove('com-janela');
    if (j.id === 'janela-3d') { var v = $('#visor'); v.removeAttribute('src'); }
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }
  document.addEventListener('click', function (ev) {
    var f = ev.target.closest('[data-fechar]');
    if (f) { fechar(f.closest('.janela')); return; }
    var ver = ev.target.closest('[data-ver]');
    if (ver) { abrir3d(ver.getAttribute('data-ver')); return; }
    var add = ev.target.closest('[data-add]');
    if (add) { adicionar(add.getAttribute('data-add'), add); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    document.querySelectorAll('.janela').forEach(function (j) { if (!j.hidden) fechar(j); });
  });

  /* ---------- Visualizador 3D ---------- */
  var atual = null;
  function abrir3d(id) {
    var p = porId[id]; if (!p) return;
    atual = id;
    var v = $('#visor');
    var cat = CATEGORIAS.filter(function (c) { return c.id === p.cat; })[0];
    $('#v-cat').textContent = cat ? cat.nome : '';
    $('#v-nome').textContent = p.nome;
    $('#v-desc').textContent = p.desc;
    $('#aviso-ar').hidden = true;
    v.setAttribute('alt', 'Modelo 3D: ' + p.nome);
    v.setAttribute('poster', 'img/' + id + '.webp');
    if (reduzir) v.removeAttribute('auto-rotate');
    v.setAttribute('src', 'modelos/' + id + '.glb');
    abrir($('#janela-3d'));
  }
  function ligarVisor() {
    var v = $('#visor');
    v.addEventListener('progress', function (e) {
      var t = e.detail && e.detail.totalProgress || 0;
      $('#progresso').style.transform = 'scaleX(' + t + ')';
      $('.carregando').style.opacity = t >= 1 ? '0' : '1';
    });
    v.addEventListener('load', function () { v.setAttribute('data-carregado', atual || ''); });
    $('#btn-ar').addEventListener('click', function () {
      if (v.canActivateAR) { v.activateAR(); }
      else { $('#aviso-ar').hidden = false; }
    });
    $('#btn-add-3d').addEventListener('click', function (e) { if (atual) adicionar(atual, e.currentTarget); });
  }

  /* ---------- Pedido ---------- */
  function totalItens() { var t = 0; for (var k in pedido) t += pedido[k]; return t; }
  function adicionar(id, botao) {
    pedido[id] = (pedido[id] || 0) + 1;
    atualizarPedido(true);
    if (botao) {
      var antes = botao.innerHTML;
      botao.classList.add('no-pedido'); botao.innerHTML = icone('mais') + 'No pedido (' + pedido[id] + ')';
      setTimeout(function () { botao.classList.remove('no-pedido'); botao.innerHTML = antes; }, 1200);
    }
  }
  function mudar(id, d) {
    pedido[id] = (pedido[id] || 0) + d;
    if (pedido[id] <= 0) delete pedido[id];
    atualizarPedido(false);
  }
  function mensagem() {
    var linhas = ['*DEMONSTRAÇÃO · Nexor Cardápio 3D*', 'Restaurante fictício (Cantina Exemplo). Não é um pedido real.', '', 'Pedido da mesa ' + MESA + ':'];
    PRATOS.forEach(function (p) { if (pedido[p.id]) linhas.push('• ' + pedido[p.id] + 'x ' + p.nome); });
    var obs = ($('#obs').value || '').trim().slice(0, 200);
    if (obs) linhas.push('', 'Observação: ' + obs);
    linhas.push('', 'No restaurante de verdade, a IA do Nexor Atende recebe e anota este pedido.', 'Quero saber como ter isso no meu restaurante.');
    return linhas.join('\n');
  }
  function atualizarLink() {
    var a = $('#btn-whats'); var vazio = totalItens() === 0;
    a.href = 'https://wa.me/' + WHATS + '?text=' + encodeURIComponent(mensagem());
    a.setAttribute('aria-disabled', vazio ? 'true' : 'false');
    if (vazio) a.setAttribute('tabindex', '-1'); else a.removeAttribute('tabindex');
  }
  function atualizarPedido(pulo) {
    var n = totalItens();
    var barra = $('#barra-pedido');
    barra.hidden = n === 0;
    $('#bp-qtd').textContent = n;
    $('.bp-txt').textContent = n === 1 ? 'Ver meu pedido · 1 item' : 'Ver meu pedido · ' + n + ' itens';
    if (pulo && !reduzir) { barra.classList.remove('pulo'); void barra.offsetWidth; barra.classList.add('pulo'); }
    var ul = $('#itens'); ul.textContent = '';
    PRATOS.forEach(function (p) {
      if (!pedido[p.id]) return;
      var menos = el('button', { type: 'button', 'aria-label': 'Tirar um ' + p.nome, html: icone('menos') });
      var mais = el('button', { type: 'button', 'aria-label': 'Pôr mais um ' + p.nome, html: icone('mais') });
      menos.addEventListener('click', function () { mudar(p.id, -1); });
      mais.addEventListener('click', function () { mudar(p.id, 1); });
      ul.appendChild(el('li', { class: 'item' }, [
        el('img', { src: 'img/' + p.id + '.webp', alt: '', width: '48', height: '48' }),
        el('span', { class: 'item-nome', texto: p.nome }),
        el('span', { class: 'qtd' }, [menos, el('output', { texto: String(pedido[p.id]) }), mais])
      ]));
    });
    $('#vazio').hidden = n > 0;
    atualizarLink();
  }

  /* ---------- QR decorativo (desenho, não é um QR de verdade) ---------- */
  function desenharQr() {
    var svg = $('.qr-desenho'); if (!svg) return;
    var s = 11, partes = [];
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    function olho(x, y) { partes.push('M' + x + ' ' + y + 'h7v7h-7z M' + (x + 1) + ' ' + (y + 1) + 'v5h5v-5z M' + (x + 2) + ' ' + (y + 2) + 'h3v3h-3z'); }
    olho(0, 0); olho(14, 0); olho(0, 14);
    for (var y = 0; y < 21; y++) for (var x = 0; x < 21; x++) {
      var noOlho = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (!noOlho && rnd() > 0.52) partes.push('M' + x + ' ' + y + 'h1v1h-1z');
    }
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', partes.join(' ')); p.setAttribute('fill', '#0a1426'); p.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(p);
  }

  /* ---------- Chamada final ---------- */
  function ligarFinal() {
    var t = 'Olá! Vi a demonstração do Nexor Cardápio 3D e quero no meu restaurante.';
    $('#cta-final').href = 'https://wa.me/' + WHATS + '?text=' + encodeURIComponent(t);
  }

  montarCardapio();
  observarCategorias();
  ligarVisor();
  desenharQr();
  ligarFinal();
  $('#barra-pedido').addEventListener('click', function () { abrir($('#janela-pedido')); });
  $('#obs').addEventListener('input', atualizarLink);
  atualizarPedido(false);
})();
