/* Teste grátis de 12 horas: pré-cadastro (vira lead para a Nexor) e as demonstrações interativas de cada solução.
   As demonstrações rodam no navegador do visitante e guardam os dados só nele. */

const Teste = (() => {
  const HORAS = 12;
  const modalCadastro = document.getElementById("teste-modal");
  const area = document.getElementById("teste-area");
  const corpo = area.querySelector(".ta-corpo");
  let relogio;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const solucao = (id) => SOLUCOES.find((s) => s.id === id);
  const perfil = () => NX.ler("nx-teste-perfil", null);
  const testes = () => NX.ler("nx-testes", {});
  const estado = (id, padrao) => NX.ler(`nx-demo-${id}`, padrao);
  const salvar = (id, valor) => NX.guardar(`nx-demo-${id}`, valor);

  const aviso = (texto) => {
    const t = document.createElement("div");
    t.className = "ta-toast";
    t.textContent = texto;
    area.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };

  /* ---------- Pré-cadastro ---------- */
  function abrir(id) {
    NX.registrar(`teste-${id}`, 4);
    if (perfil()) return iniciar(id);
    const s = solucao(id);
    modalCadastro.querySelector("[data-teste-nome]").textContent = s.nome;
    modalCadastro.dataset.atual = id;
    modalCadastro.querySelector(".form-error").textContent = "";
    NX.preencher(modalCadastro);
    modalCadastro.showModal();
  }

  modalCadastro.addEventListener("click", (e) => {
    if (e.target === modalCadastro || e.target.closest("[data-fechar]")) modalCadastro.close();
  });
  modalCadastro.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const d = Object.fromEntries(new FormData(form));
    const erro = form.querySelector(".form-error");
    if (!d.nome?.trim() || !d.empresa?.trim() || !NX.contatoValido({ telefone: d.telefone })) {
      erro.textContent = "Preencha nome, empresa e um WhatsApp válido.";
      return;
    }
    if (!d.lgpd) {
      erro.textContent = "Para liberar o teste, autorize o contato da Nexor.";
      return;
    }
    delete d.lgpd;
    form.dataset.enviado = "1";
    NX.guardar("nx-teste-perfil", d);
    modalCadastro.close();
    iniciar(modalCadastro.dataset.atual, true);
  });

  /* ---------- Área de teste ---------- */
  function iniciar(id, primeiraVez = false) {
    const s = solucao(id);
    const t = testes();
    const agora = Date.now();
    if (!t[id]) {
      t[id] = agora + HORAS * 3600_000;
      NX.guardar("nx-testes", t);
      NX.enviarLead("teste", perfil(), { solucao: s.nome, formulario: primeiraVez ? "pre-cadastro" : "novo-teste" });
    }
    area.style.setProperty("--a", s.accent);
    area.style.setProperty("--a2", s.accent2);
    area.querySelector(".ta-nome").textContent = s.nome;
    area.querySelector(".ta-ola").textContent = `Olá, ${perfil().nome.split(" ")[0]}`;
    area.dataset.atual = id;
    area.querySelector(".ta-whats").href = whatsUrl(`Olá! Estou testando o ${s.nome} no site da Nexor e quero falar com um especialista.`);

    clearInterval(relogio);
    const tick = () => {
      const resta = t[id] - Date.now();
      if (resta <= 0) {
        clearInterval(relogio);
        area.querySelector(".ta-tempo").textContent = "teste encerrado";
        return expirado(s);
      }
      const h = Math.floor(resta / 3600_000);
      const m = Math.floor((resta % 3600_000) / 60_000);
      area.querySelector(".ta-tempo").textContent = `${h}h ${String(m).padStart(2, "0")}min restantes`;
    };
    if (t[id] <= agora) expirado(s);
    else {
      corpo.innerHTML = "";
      DEMOS[id](corpo);
      tick();
      relogio = setInterval(tick, 30_000);
    }
    if (!area.open) area.showModal();
  }

  function expirado(s) {
    corpo.innerHTML = `<div class="ta-fim"><h3>Seu teste do ${esc(s.nome)} terminou</h3><p class="muted">Gostou? Nossa equipe monta a versão real para a sua empresa, com seus dados e integrações.</p><div class="ta-fim-acoes"><button class="btn btn-primary" type="button" data-implantar>Quero implantar</button><a class="btn btn-whats" target="_blank" rel="noopener" href="${whatsUrl(`Olá! Meu teste do ${s.nome} terminou e quero conversar sobre a implantação.`)}">Falar no WhatsApp</a></div></div>`;
  }

  area.addEventListener("click", (e) => {
    if (e.target.closest("[data-fechar-area]")) {
      clearInterval(relogio);
      area.close();
    }
    if (e.target.closest("[data-implantar]")) {
      const s = solucao(area.dataset.atual);
      NX.enviarLead("interesse", perfil(), { solucao: s.nome, formulario: "quero-implantar" });
      aviso("Recebemos! Um especialista vai te chamar no WhatsApp.");
    }
  });

  /* ---------- Componentes ---------- */
  const abas = (raiz, nomes, desenhar) => {
    raiz.innerHTML = `<div class="ta-abas" role="tablist">${nomes.map((n, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-aba="${i}">${n}</button>`).join("")}</div><div class="ta-painel"></div>`;
    const painel = raiz.querySelector(".ta-painel");
    const ir = (i) => {
      raiz.querySelectorAll("[data-aba]").forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.aba) === i)));
      desenhar(i, painel);
    };
    raiz.querySelector(".ta-abas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aba]");
      if (b) ir(Number(b.dataset.aba));
    });
    ir(0);
    return ir;
  };
  const chip = (texto, tom) => `<em class="ta-chip ${tom}">${esc(texto)}</em>`;
  const tabela = (colunas, linhas, vazio = "Nada por aqui ainda.") =>
    linhas.length
      ? `<div class="ta-tabela"><table><thead><tr>${colunas.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<p class="muted ta-vazio">${vazio}</p>`;
  const kpis = (itens) => `<div class="ta-kpis">${itens.map(([l, v, tom]) => `<div class="${tom ?? ""}"><small>${l}</small><b>${v}</b></div>`).join("")}</div>`;
  const dataCurta = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* ---------- Demonstrações ---------- */
  const DEMOS = {
    /* Nexor Atende IA: o visitante descreve a empresa e conversa com o atendente virtual dela */
    atende(raiz) {
      const exemplos = {
        "Pizzaria": "Pizzaria aberta de terça a domingo, das 18h às 23h30.\nPizza grande R$ 59,90, média R$ 45,90. Borda recheada + R$ 8.\nEntrega grátis até 5 km, taxa de R$ 7 acima disso. Tempo médio 40 minutos.\nPagamento: Pix, cartão ou dinheiro.",
        "Clínica": "Clínica odontológica, segunda a sexta das 8h às 19h e sábado das 8h às 12h.\nAvaliação gratuita. Limpeza R$ 180. Clareamento a partir de R$ 650.\nAtendemos os convênios OdontoPrev e Amil Dental.\nEndereço: Av. Rondon Pacheco, 1500.",
        "Loja de roupas": "Loja de moda feminina com loja física e online.\nTamanhos do PP ao GG. Trocas em até 30 dias.\nFrete grátis acima de R$ 299. Envio em 1 dia útil.\nPix com 5% de desconto. Parcelamos em até 6x sem juros.",
        "Oficina": "Oficina mecânica, segunda a sexta das 8h às 18h, sábado até 12h.\nRevisão completa a partir de R$ 290. Troca de óleo a partir de R$ 159.\nAlinhamento e balanceamento R$ 120.\nOrçamento gratuito e garantia de 90 dias nos serviços.",
      };
      const st = estado("atende", { nome: NX.ler("nx-teste-perfil", {}).empresa ?? "Minha Empresa", segmento: "Pizzaria", info: exemplos.Pizzaria, msgs: [] });
      const sessaoDemo = `${NX.sessao}-demo`.slice(0, 64);

      raiz.innerHTML = `
        <div class="ta-dois">
          <form class="ta-card ta-form" data-config>
            <h4>1. Conte sobre a sua empresa</h4>
            <label>Nome da empresa<input name="nome" value="${esc(st.nome)}" maxlength="80"></label>
            <label>Ramo<select name="segmento">${Object.keys(exemplos).concat("Outro").map((k) => `<option ${k === st.segmento ? "selected" : ""}>${k}</option>`).join("")}</select></label>
            <label>O que o atendente precisa saber<textarea name="info" rows="8" maxlength="1500">${esc(st.info)}</textarea></label>
            <p class="muted ta-dica">Horários, preços, formas de pagamento, endereço. Quanto mais detalhe, melhor a resposta.</p>
          </form>
          <div class="ta-card ta-celular">
            <h4>2. Converse como se fosse seu cliente</h4>
            <div class="ta-chat">
              <div class="ta-chat-topo"><span class="ta-av">${esc(st.nome[0] ?? "E")}</span><div><b data-nome>${esc(st.nome)}</b><small>● atendente virtual</small></div></div>
              <div class="ta-msgs" aria-live="polite"></div>
              <div class="ta-sugs">${["Qual o horário de vocês?", "Quanto custa?", "Quero fazer um pedido", "Vocês aceitam Pix?"].map((s) => `<button type="button">${s}</button>`).join("")}</div>
              <form class="ta-envio"><input aria-label="Mensagem" placeholder="Escreva como um cliente…" maxlength="500"><button class="btn btn-sm btn-primary" type="submit">Enviar</button></form>
            </div>
            <p class="muted ta-dica">${NEXOR_API_URL ? "Respostas geradas pela IA da Nexor com as informações ao lado." : "Prévia do atendimento. Na versão contratada, a IA responde qualquer pergunta com base nas suas informações."}</p>
          </div>
        </div>`;

      const msgs = raiz.querySelector(".ta-msgs");
      const config = raiz.querySelector("[data-config]");
      const balao = (de, texto) => {
        const p = document.createElement("p");
        p.className = de;
        p.textContent = texto;
        msgs.appendChild(p);
        msgs.scrollTop = msgs.scrollHeight;
        return p;
      };
      st.msgs.forEach(([de, t]) => balao(de, t));
      if (!st.msgs.length) balao("out", `Olá! Bem-vindo(a) à ${st.nome}. Como posso ajudar?`);

      config.addEventListener("input", (e) => {
        Object.assign(st, Object.fromEntries(new FormData(config)));
        if (e.target.name === "segmento" && exemplos[st.segmento]) config.info.value = st.info = exemplos[st.segmento];
        raiz.querySelector("[data-nome]").textContent = st.nome;
        raiz.querySelector(".ta-av").textContent = st.nome[0] ?? "E";
        salvar("atende", st);
      });

      const local = (texto) => {
        const q = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const linhas = st.info.split("\n").map((l) => l.trim()).filter(Boolean);
        const normal = (l) => l.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const achar = (...palavras) => linhas.find((l) => palavras.some((p) => normal(l).includes(p)));
        if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(q)) return `Olá! Aqui é o atendimento da ${st.nome} 😊 Como posso ajudar?`;
        if (/(horario|abre|aberto|funciona|fecha)/.test(q)) return achar("h ", "às", "segunda", "terça", "aberta", "aberto") ?? "Vou confirmar o horário com a equipe e já te retorno!";
        if (/(preco|valor|quanto|custa|r\$)/.test(q)) return achar("r$") ? `${achar("r$")} Posso ajudar com mais alguma coisa?` : "Vou confirmar os valores com a equipe e já te passo!";
        if (/(pix|cartao|pagamento|pagar|parcel)/.test(q)) return achar("pix", "cartão", "pagamento", "parcel") ?? "Aceitamos as principais formas de pagamento. Quer que eu confirme alguma específica?";
        if (/(pedido|comprar|quero|encomend)/.test(q)) return "Perfeito! Me diz o que você deseja e o endereço que eu já registro o pedido. (Na versão real, aqui eu já envio o link do Pix e aviso a equipe.)";
        if (/(agend|marcar|horario disponivel|consulta|visita)/.test(q)) return "Claro! Tenho horários amanhã às 9h, 14h ou 16h30. Qual fica melhor? (simulação de agenda)";
        if (/(entrega|frete|envio|delivery)/.test(q)) return achar("entrega", "frete", "envio") ?? "Fazemos entrega sim! Me passa seu bairro que eu confirmo o prazo.";
        if (/(endereco|onde fica|localiza)/.test(q)) return achar("endereço", "av.", "rua") ?? "Vou te mandar a localização certinha!";
        const palavras = q.split(/\W+/).filter((w) => w.length > 3);
        const parecida = linhas.find((l) => palavras.some((w) => normal(l).includes(w)));
        return parecida ? `${parecida} Posso ajudar em mais algo?` : "Boa pergunta! Vou confirmar com a equipe e já te retorno. Posso anotar seu nome e WhatsApp?";
      };

      const enviar = async (texto) => {
        texto = texto.trim();
        if (!texto) return;
        balao("in", texto);
        st.msgs.push(["in", texto]);
        const digitando = balao("out ta-digitando", "digitando…");
        let resposta;
        if (NEXOR_API_URL) {
          try {
            const r = await fetch(`${NEXOR_API_URL.replace(/\/$/, "")}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessao: sessaoDemo, mensagem: texto, modo: "demo", negocio: { nome: st.nome, segmento: st.segmento, info: st.info } }),
            });
            resposta = (await r.json()).resposta;
          } catch {
            resposta = local(texto);
          }
        } else {
          await new Promise((r) => setTimeout(r, 700));
          resposta = local(texto);
        }
        digitando.remove();
        balao("out", resposta);
        st.msgs.push(["out", resposta]);
        st.msgs = st.msgs.slice(-30);
        salvar("atende", st);
      };
      raiz.querySelector(".ta-envio").addEventListener("submit", (e) => {
        e.preventDefault();
        const campo = e.target.querySelector("input");
        enviar(campo.value);
        campo.value = "";
      });
      raiz.querySelector(".ta-sugs").addEventListener("click", (e) => e.target.matches("button") && enviar(e.target.textContent));
    },

    /* Nexor Commerce: loja, carrinho, Pix e marketplaces */
    commerce(raiz) {
      const st = estado("commerce", {
        produtos: [
          { n: "Camiseta Básica", p: 79.9 },
          { n: "Tênis Casual", p: 249.9 },
          { n: "Boné Aba Curva", p: 59.9 },
          { n: "Mochila Urbana", p: 189.9 },
        ],
        carrinho: [],
        pedidos: [],
        canais: { "Mercado Livre": false, Shopee: false, Amazon: false, Magalu: false },
      });
      const loja = NX.ler("nx-teste-perfil", {}).empresa ?? "Minha Loja";
      const total = () => st.carrinho.reduce((s, i) => s + st.produtos[i].p, 0);
      const ir = abas(raiz, ["Loja", `Pedidos`, "Marketplaces", "Produtos"], (aba, p) => {
        if (aba === 0) {
          p.innerHTML = `<div class="ta-dois larga">
            <div class="ta-card"><div class="ta-loja-topo"><b>${esc(loja)}</b><span class="muted">loja.${esc(loja.toLowerCase().replace(/[^a-z0-9]+/g, ""))}.com.br</span></div>
              <div class="ta-produtos">${st.produtos.map((x, i) => `<div class="ta-prod"><div class="ta-img" style="--h:${i * 50}deg"></div><b>${esc(x.n)}</b><span>${brl(x.p)}</span><button class="btn btn-sm btn-ghost" type="button" data-add="${i}">Adicionar</button></div>`).join("")}</div></div>
            <div class="ta-card ta-carrinho"><h4>Carrinho (${st.carrinho.length})</h4>
              ${st.carrinho.length ? st.carrinho.map((i, k) => `<div class="ta-linha"><span>${esc(st.produtos[i].n)}</span><b>${brl(st.produtos[i].p)}</b><button type="button" class="ta-x" data-rem="${k}" aria-label="Remover">×</button></div>`).join("") : '<p class="muted">Adicione produtos para testar a compra.</p>'}
              <div class="ta-linha tot"><span>Total</span><b>${brl(total())}</b></div>
              <button class="btn btn-primary btn-block" type="button" data-pix ${st.carrinho.length ? "" : "disabled"}>Pagar com Pix</button>
              <div class="ta-pix" hidden><div class="ta-qr">${Array.from({ length: 121 }, (_, i) => `<i class="${(i * 13 + (i % 7)) % 3 ? "" : "on"}"></i>`).join("")}</div><p class="muted">Pix de ${brl(total())}</p><button class="btn btn-whats btn-block" type="button" data-pagar>Simular pagamento aprovado</button></div>
            </div></div>`;
        } else if (aba === 1) {
          p.innerHTML = kpis([["Pedidos", st.pedidos.length], ["Faturado", brl(st.pedidos.reduce((s, x) => s + x.v, 0))], ["Ticket médio", brl(st.pedidos.length ? st.pedidos.reduce((s, x) => s + x.v, 0) / st.pedidos.length : 0)]]) + tabela(["Pedido", "Quando", "Canal", "Valor", "Status"], st.pedidos.slice().reverse().map((x) => [`#${x.id}`, dataCurta(x.t), esc(x.c), brl(x.v), chip("Pago", "ok")]), "Faça uma compra na aba Loja para ver o pedido chegar aqui.");
        } else if (aba === 2) {
          p.innerHTML = `<div class="ta-card"><h4>Venda nos marketplaces com o mesmo estoque</h4><p class="muted">Ative um canal e veja seus ${st.produtos.length} produtos serem publicados.</p><div class="ta-canais">${Object.entries(st.canais).map(([n, on]) => `<label class="ta-canal"><input type="checkbox" data-canal="${n}" ${on ? "checked" : ""}><span><b>${n}</b><small data-status="${n}">${on ? `${st.produtos.length} produtos publicados · estoque sincronizado` : "desligado"}</small></span></label>`).join("")}</div></div>`;
        } else {
          p.innerHTML = `<div class="ta-card"><h4>Cadastrar produto</h4><form class="ta-inline" data-novo><input name="n" placeholder="Nome do produto" required maxlength="40"><input name="p" type="number" step="0.01" min="1" placeholder="Preço" required><button class="btn btn-sm btn-primary">Cadastrar</button></form></div>` + tabela(["Produto", "Preço"], st.produtos.map((x) => [esc(x.n), brl(x.p)]));
        }
      });
      raiz.addEventListener("click", (e) => {
        const add = e.target.closest("[data-add]");
        const rem = e.target.closest("[data-rem]");
        if (add) {
          st.carrinho.push(Number(add.dataset.add));
          salvar("commerce", st);
          ir(0);
        } else if (rem) {
          st.carrinho.splice(Number(rem.dataset.rem), 1);
          salvar("commerce", st);
          ir(0);
        } else if (e.target.closest("[data-pix]")) {
          raiz.querySelector(".ta-pix").hidden = false;
          e.target.closest("[data-pix]").hidden = true;
        } else if (e.target.closest("[data-pagar]")) {
          const canais = ["Loja própria", ...Object.keys(st.canais).filter((c) => st.canais[c])];
          st.pedidos.push({ id: 1000 + st.pedidos.length + 1, t: Date.now(), v: total(), c: canais[st.pedidos.length % canais.length] });
          st.carrinho = [];
          salvar("commerce", st);
          aviso("Pagamento aprovado! O pedido já está na aba Pedidos.");
          ir(0);
        }
      });
      raiz.addEventListener("change", (e) => {
        const n = e.target.dataset.canal;
        if (!n) return;
        st.canais[n] = e.target.checked;
        salvar("commerce", st);
        const status = raiz.querySelector(`[data-status="${n}"]`);
        status.textContent = e.target.checked ? "sincronizando…" : "desligado";
        if (e.target.checked) setTimeout(() => (status.textContent = `${st.produtos.length} produtos publicados · estoque sincronizado`), 1200);
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-novo]")) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st.produtos.push({ n: d.n, p: Number(d.p) });
        salvar("commerce", st);
        ir(3);
      });
    },

    /* Nexor Gestão: vendas, despesas e painel */
    gestao(raiz) {
      const dia = 86400_000;
      const hoje = new Date().setHours(12, 0, 0, 0);
      const st = estado("gestao", {
        vendas: [[6, "Mercado Bom Preço", 1280], [5, "Clínica Vida", 860], [4, "Grupo Atlas", 2150], [3, "Loja Prisma", 540], [2, "TechNova", 1720], [1, "Rede Sol", 990], [0, "Inova Log", 1430]].map(([d, c, v]) => ({ t: hoje - d * dia, c, v })),
        despesas: [{ t: hoje - 5 * dia, c: "Aluguel", v: 2200 }, { t: hoje - 2 * dia, c: "Internet", v: 189 }, { t: hoje - 1 * dia, c: "Fornecedor", v: 1350 }],
      });
      const soma = (l) => l.reduce((s, x) => s + x.v, 0);
      const ir = abas(raiz, ["Painel", "Lançar venda ou despesa", "Movimentações"], (aba, p) => {
        if (aba === 0) {
          const fat = soma(st.vendas);
          const desp = soma(st.despesas);
          const dias = Array.from({ length: 7 }, (_, i) => {
            const t = hoje - (6 - i) * dia;
            return { rotulo: new Date(t).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), v: soma(st.vendas.filter((x) => new Date(x.t).toDateString() === new Date(t).toDateString())) };
          });
          const max = Math.max(1, ...dias.map((d) => d.v));
          p.innerHTML = kpis([["Faturamento", brl(fat)], ["Despesas", brl(desp)], ["Lucro", brl(fat - desp), fat - desp >= 0 ? "ok" : "bad"], ["Ticket médio", brl(st.vendas.length ? fat / st.vendas.length : 0)]]) +
            `<div class="ta-card"><h4>Vendas dos últimos 7 dias</h4><div class="ta-grafico">${dias.map((d) => `<div title="${brl(d.v)}"><i style="--h:${(d.v / max) * 100}%"></i><b>${d.v ? (d.v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : "0"}</b><small>${d.rotulo}</small></div>`).join("")}</div></div>`;
        } else if (aba === 1) {
          p.innerHTML = `<div class="ta-dois">
            <form class="ta-card ta-form" data-tipo="vendas"><h4>Nova venda</h4><label>Cliente<input name="c" required maxlength="50" placeholder="Ex.: Padaria Central"></label><label>Valor (R$)<input name="v" type="number" step="0.01" min="1" required></label><button class="btn btn-primary">Lançar venda</button></form>
            <form class="ta-card ta-form" data-tipo="despesas"><h4>Nova despesa</h4><label>Descrição<input name="c" required maxlength="50" placeholder="Ex.: Energia"></label><label>Valor (R$)<input name="v" type="number" step="0.01" min="1" required></label><button class="btn btn-ghost">Lançar despesa</button></form>
          </div><p class="muted ta-dica">Lance uma venda e veja o painel atualizar na hora.</p>`;
        } else {
          const mov = [...st.vendas.map((x) => ({ ...x, tipo: "Venda" })), ...st.despesas.map((x) => ({ ...x, tipo: "Despesa" }))].sort((a, b) => b.t - a.t);
          p.innerHTML = tabela(["Data", "Tipo", "Descrição", "Valor"], mov.map((x) => [dataCurta(x.t), chip(x.tipo, x.tipo === "Venda" ? "ok" : "warn"), esc(x.c), brl(x.v)]));
        }
      });
      raiz.addEventListener("submit", (e) => {
        const tipo = e.target.dataset.tipo;
        if (!tipo) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st[tipo].push({ t: Date.now(), c: d.c, v: Number(d.v) });
        salvar("gestao", st);
        aviso(tipo === "vendas" ? "Venda lançada. Veja o painel!" : "Despesa lançada.");
        ir(0);
      });
    },

    /* Nexor Site Pro: monte o site e veja a prévia ao vivo */
    sitepro(raiz) {
      const p0 = NX.ler("nx-teste-perfil", {});
      const st = estado("sitepro", { nome: p0.empresa ?? "Minha Empresa", slogan: "Qualidade e atendimento que fazem a diferença", cor: "#2f8bff", servicos: "Atendimento personalizado\nEntrega rápida\nGarantia de satisfação", whats: p0.telefone ?? "" });
      const cores = ["#2f8bff", "#14b8a6", "#8b5cf6", "#f97316", "#e11d48", "#16a34a"];
      raiz.innerHTML = `<div class="ta-dois larga">
        <form class="ta-card ta-form" data-site>
          <h4>Monte o seu site</h4>
          <label>Nome da empresa<input name="nome" value="${esc(st.nome)}" maxlength="40"></label>
          <label>Frase principal<input name="slogan" value="${esc(st.slogan)}" maxlength="90"></label>
          <fieldset class="ta-cores"><legend>Cor da marca</legend>${cores.map((c) => `<label><input type="radio" name="cor" value="${c}" ${c === st.cor ? "checked" : ""}><span style="background:${c}"></span></label>`).join("")}</fieldset>
          <label>Serviços (um por linha)<textarea name="servicos" rows="4" maxlength="300">${esc(st.servicos)}</textarea></label>
          <label>WhatsApp<input name="whats" value="${esc(st.whats)}" maxlength="20"></label>
        </form>
        <div class="ta-card"><div class="ta-dispositivos"><button type="button" aria-pressed="true" data-disp="pc">Computador</button><button type="button" aria-pressed="false" data-disp="cel">Celular</button></div><div class="ta-previa" data-previa></div></div>
      </div>`;
      const previa = raiz.querySelector("[data-previa]");
      const desenhar = () => {
        const servicos = st.servicos.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
        previa.style.setProperty("--c", st.cor);
        previa.innerHTML = `<div class="sp-nav"><b>${esc(st.nome)}</b><span>Início</span><span>Serviços</span><span>Contato</span></div>
          <div class="sp-hero"><small>Bem-vindo(a)</small><h5>${esc(st.slogan)}</h5><span class="sp-btn">Chamar no WhatsApp</span></div>
          <div class="sp-servs">${servicos.map((s) => `<div><i></i><b>${esc(s)}</b></div>`).join("")}</div>
          <div class="sp-rodape">${esc(st.nome)} · ${esc(st.whats || "(00) 00000-0000")}</div>`;
      };
      raiz.querySelector("[data-site]").addEventListener("input", (e) => {
        Object.assign(st, Object.fromEntries(new FormData(e.currentTarget)));
        salvar("sitepro", st);
        desenhar();
      });
      raiz.querySelector(".ta-dispositivos").addEventListener("click", (e) => {
        const b = e.target.closest("[data-disp]");
        if (!b) return;
        raiz.querySelectorAll("[data-disp]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        previa.classList.toggle("cel", b.dataset.disp === "cel");
      });
      desenhar();
    },

    /* Nexor Automação: a IA lê um documento e lança os dados */
    automacao(raiz) {
      const AMOSTRAS = {
        "Nota fiscal": "NOTA FISCAL ELETRÔNICA Nº 4521\nFornecedor: Alfa Distribuidora Ltda\nCNPJ: 12.345.678/0001-90\nEmissão: 28/10/2026\nValor total: R$ 4.280,50\nVencimento: 15/11/2026",
        "Boleto": "BOLETO BANCÁRIO\nBeneficiário: Energia Forte S/A\nCNPJ: 98.765.432/0001-10\nValor do documento: R$ 1.932,17\nVencimento: 10/11/2026\nNosso número: 000789456",
        "Contrato": "CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº 2026-118\nContratante: Grupo Atlas Logística\nCNPJ: 45.678.912/0001-33\nValor mensal: R$ 12.500,00\nInício: 01/11/2026\nVigência: 12 meses",
      };
      const st = estado("automacao", { lancados: [] });
      raiz.innerHTML = `<div class="ta-dois larga">
        <div class="ta-card ta-form"><h4>1. Escolha ou cole um documento</h4><div class="ta-chips">${Object.keys(AMOSTRAS).map((k, i) => `<button type="button" aria-pressed="${i === 0}" data-amostra="${k}">${k}</button>`).join("")}</div>
          <textarea rows="9" data-doc aria-label="Texto do documento">${AMOSTRAS["Nota fiscal"]}</textarea>
          <button class="btn btn-primary" type="button" data-rodar>Processar com IA</button></div>
        <div class="ta-card"><h4>2. Acompanhe a automação</h4><ol class="ta-etapas">${["Documento recebido", "Leitura do texto (OCR)", "IA identifica os campos", "Validação de CNPJ e valores", "Lançado no sistema"].map((e) => `<li>${e}</li>`).join("")}</ol><div data-resultado></div></div>
      </div><div class="ta-card"><h4>Lançados no sistema</h4><div data-lancados></div></div>`;
      const lista = () => (raiz.querySelector("[data-lancados]").innerHTML = tabela(["Quando", "Tipo", "Empresa", "CNPJ", "Valor", "Vencimento"], st.lancados.slice().reverse().map((x) => [dataCurta(x.t), esc(x.tipo), esc(x.empresa), esc(x.cnpj), esc(x.valor), esc(x.data)]), "Processe um documento para ver o lançamento automático."));
      lista();
      const doc = raiz.querySelector("[data-doc]");
      let tipo = "Nota fiscal";
      raiz.querySelector(".ta-chips").addEventListener("click", (e) => {
        const b = e.target.closest("[data-amostra]");
        if (!b) return;
        tipo = b.dataset.amostra;
        raiz.querySelectorAll("[data-amostra]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        doc.value = AMOSTRAS[tipo];
      });
      raiz.querySelector("[data-rodar]").addEventListener("click", async (e) => {
        const botao = e.currentTarget;
        botao.disabled = true;
        const etapas = [...raiz.querySelectorAll(".ta-etapas li")];
        etapas.forEach((li) => (li.className = ""));
        raiz.querySelector("[data-resultado]").innerHTML = "";
        for (const li of etapas) {
          li.className = "ativa";
          await new Promise((r) => setTimeout(r, 550));
          li.className = "feita";
        }
        const t = doc.value;
        const linha = (...rotulos) => {
          for (const r of rotulos) {
            const m = t.match(new RegExp(`${r}\\s*:?\\s*(.+)`, "i"));
            if (m) return m[1].trim();
          }
          return "não encontrado";
        };
        const x = {
          t: Date.now(),
          tipo,
          empresa: linha("Fornecedor", "Beneficiário", "Contratante", "Cliente", "Empresa"),
          cnpj: (t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) ?? ["não encontrado"])[0],
          valor: (t.match(/R\$\s?[\d.]+,\d{2}/) ?? ["não encontrado"])[0],
          data: linha("Vencimento", "Início", "Data"),
        };
        st.lancados.push(x);
        salvar("automacao", st);
        raiz.querySelector("[data-resultado]").innerHTML = `<div class="ta-extrato">${[["Empresa", x.empresa], ["CNPJ", x.cnpj], ["Valor", x.valor], ["Data", x.data]].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join("")}</div>`;
        lista();
        botao.disabled = false;
      });
    },

    /* Nexor Sob Medida: app de agendamento */
    sobmedida(raiz) {
      const st = estado("sobmedida", { agenda: [] });
      const servicos = [["Corte", 50], ["Barba", 35], ["Corte + barba", 75], ["Hidratação", 60]];
      // Próximos 5 dias de funcionamento (sem domingo)
      const dias = Array.from({ length: 8 }, (_, i) => new Date(Date.now() + (i + 1) * 86400_000))
        .filter((d) => d.getDay() !== 0)
        .slice(0, 5)
        .map((d) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", ""));
      const horas = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];
      const esc2 = { servico: 0, dia: 0, hora: null };
      const desenhar = () => {
        const ocupado = (h) => st.agenda.some((a) => a.dia === dias[esc2.dia] && a.hora === h);
        raiz.innerHTML = `<div class="ta-dois">
          <div class="ta-card ta-app"><div class="ta-app-tela"><small>Olá! 👋</small><h5>Agende seu horário</h5>
            <p class="ta-rotulo">Serviço</p><div class="ta-chips">${servicos.map(([n, v], i) => `<button type="button" aria-pressed="${i === esc2.servico}" data-serv="${i}">${n} · ${brl(v)}</button>`).join("")}</div>
            <p class="ta-rotulo">Dia</p><div class="ta-chips">${dias.map((d, i) => `<button type="button" aria-pressed="${i === esc2.dia}" data-dia="${i}">${d}</button>`).join("")}</div>
            <p class="ta-rotulo">Horário</p><div class="ta-chips">${horas.map((h) => `<button type="button" aria-pressed="${h === esc2.hora}" data-hora="${h}" ${ocupado(h) ? "disabled" : ""}>${h}</button>`).join("")}</div>
            <form data-agendar class="ta-inline"><input name="nome" placeholder="Seu nome" required maxlength="40"><button class="btn btn-sm btn-primary" ${esc2.hora ? "" : "disabled"}>Confirmar</button></form>
          </div></div>
          <div class="ta-card"><h4>Agenda do estabelecimento</h4>${tabela(["Dia", "Hora", "Cliente", "Serviço", ""], st.agenda.map((a, i) => [esc(a.dia), a.hora, esc(a.nome), esc(a.servico), `<button type="button" class="ta-x" data-cancelar="${i}" aria-label="Cancelar">×</button>`]), "Faça um agendamento no app para ver aqui.")}</div>
        </div>`;
      };
      raiz.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.serv) esc2.servico = Number(b.dataset.serv);
        else if (b.dataset.dia) (esc2.dia = Number(b.dataset.dia)), (esc2.hora = null);
        else if (b.dataset.hora) esc2.hora = b.dataset.hora;
        else if (b.dataset.cancelar) st.agenda.splice(Number(b.dataset.cancelar), 1), salvar("sobmedida", st);
        else return;
        desenhar();
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-agendar]")) return;
        e.preventDefault();
        st.agenda.push({ dia: dias[esc2.dia], hora: esc2.hora, nome: new FormData(e.target).get("nome"), servico: servicos[esc2.servico][0] });
        salvar("sobmedida", st);
        aviso(`Agendado para ${dias[esc2.dia]} às ${esc2.hora}. O cliente recebe a confirmação no WhatsApp.`);
        esc2.hora = null;
        desenhar();
      });
      desenhar();
    },

    /* Nexor Service Desk: abrir, assumir e resolver chamados */
    chamados(raiz) {
      const TIPOS = { "Acessos e permissões": "Sistemas", "Melhoria em sistema": "Sistemas", "Manutenção de equipamento": "Infraestrutura", "Requisição de serviço": "Infraestrutura", "Incidente / suporte": "Infraestrutura" };
      const IMPACTO = { "Só eu": ["Baixa", 72, "info"], "Algumas pessoas": ["Média", 24, "info"], "O setor ou clientes": ["Alta", 8, "warn"], "A empresa toda": ["Crítica", 4, "bad"] };
      const h = 3600_000;
      const st = estado("chamados", {
        seq: 1043,
        lista: [
          { id: 1042, titulo: "Impressora do financeiro parada", tipo: "Manutenção de equipamento", impacto: "O setor ou clientes", t: Date.now() - 2 * h, tecnico: "Carlos", status: "Em atendimento" },
          { id: 1041, titulo: "Sem acesso ao ERP", tipo: "Acessos e permissões", impacto: "A empresa toda", t: Date.now() - 1 * h, tecnico: "", status: "Aberto" },
          { id: 1039, titulo: "Trocar teclado", tipo: "Requisição de serviço", impacto: "Só eu", t: Date.now() - 5 * h, tecnico: "", status: "Aberto" },
        ],
      });
      const prazo = (c) => {
        const resta = c.t + IMPACTO[c.impacto][1] * h - Date.now();
        return c.status === "Resolvido" ? chip("no prazo", "ok") : resta < 0 ? chip("vencido", "bad") : `${Math.ceil(resta / h)}h`;
      };
      const ir = abas(raiz, ["Fila", "Abrir chamado", "Painel"], (aba, p) => {
        if (aba === 0) {
          p.innerHTML = tabela(["Chamado", "Setor", "Prioridade", "Prazo", "Técnico", "Ação"], st.lista.slice().sort((a, b) => b.id - a.id).map((c) => {
            const [pri, , tom] = IMPACTO[c.impacto];
            const acao = c.status === "Resolvido" ? chip("Resolvido", "ok") : c.tecnico ? `<button class="btn btn-sm btn-ghost" type="button" data-resolver="${c.id}">Resolver</button>` : `<button class="btn btn-sm btn-primary" type="button" data-assumir="${c.id}">Assumir</button>`;
            return [`#${c.id} ${esc(c.titulo)}`, TIPOS[c.tipo], chip(pri, tom), prazo(c), esc(c.tecnico || "—"), acao];
          }));
        } else if (aba === 1) {
          p.innerHTML = `<form class="ta-card ta-form" data-abrir><h4>Novo chamado</h4>
            <label>Tipo de atendimento<select name="tipo">${Object.keys(TIPOS).map((t) => `<option>${t}</option>`).join("")}</select></label>
            <label>Quem é afetado?<select name="impacto">${Object.keys(IMPACTO).map((t) => `<option>${t}</option>`).join("")}</select></label>
            <p class="ta-previsao" data-previsao></p>
            <label>Título<input name="titulo" required maxlength="60" placeholder="Ex.: Computador não liga"></label>
            <label>Descrição<textarea name="desc" rows="3" maxlength="400"></textarea></label>
            <button class="btn btn-primary">Abrir chamado</button></form>`;
          const form = p.querySelector("form");
          const prev = () => {
            const [pri, horas] = IMPACTO[form.impacto.value];
            p.querySelector("[data-previsao]").textContent = `Vai para ${TIPOS[form.tipo.value]} · prioridade ${pri} · prazo de ${horas} horas`;
          };
          form.addEventListener("change", prev);
          prev();
        } else {
          const abertos = st.lista.filter((c) => c.status !== "Resolvido");
          const vencidos = abertos.filter((c) => c.t + IMPACTO[c.impacto][1] * h < Date.now());
          p.innerHTML = kpis([["Em aberto", abertos.length], ["Sem técnico", abertos.filter((c) => !c.tecnico).length, "warn"], ["Vencidos", vencidos.length, vencidos.length ? "bad" : "ok"], ["Resolvidos", st.lista.length - abertos.length, "ok"]]) + `<p class="muted ta-dica">Na versão completa: desempenho por técnico, gráficos, modo TV e exportação em planilha.</p>`;
        }
      });
      raiz.addEventListener("click", (e) => {
        const a = e.target.closest("[data-assumir]");
        const r = e.target.closest("[data-resolver]");
        if (a) st.lista.find((c) => c.id === Number(a.dataset.assumir)).tecnico = "Você";
        else if (r) st.lista.find((c) => c.id === Number(r.dataset.resolver)).status = "Resolvido";
        else return;
        salvar("chamados", st);
        ir(0);
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-abrir]")) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st.lista.push({ id: st.seq++, titulo: d.titulo, tipo: d.tipo, impacto: d.impacto, t: Date.now(), tecnico: "", status: "Aberto" });
        salvar("chamados", st);
        aviso(`Chamado #${st.seq - 1} aberto e enviado para ${TIPOS[d.tipo]}.`);
        ir(0);
      });
    },

    /* Nexor Cofre: senhas da equipe com auditoria */
    cofre(raiz) {
      const st = estado("cofre", {
        itens: [
          { sistema: "Firewall", usuario: "admin", senha: "Fw!8kQ2#zLp9Vx", pasta: "Infraestrutura" },
          { sistema: "Wi-Fi visitantes", usuario: "—", senha: "visita123", pasta: "Infraestrutura" },
          { sistema: "ERP produção", usuario: "svc_erp", senha: "Er#4mZ!q7Tn2Wd", pasta: "Sistemas" },
          { sistema: "Painel da nuvem", usuario: "ti@empresa", senha: "visita123", pasta: "Sistemas" },
        ],
        log: [],
      });
      const forca = (s) => {
        let p = 0;
        if (s.length >= 12) p++;
        if (/[A-Z]/.test(s) && /[a-z]/.test(s)) p++;
        if (/\d/.test(s)) p++;
        if (/[^A-Za-z0-9]/.test(s)) p++;
        return p >= 4 ? ["Forte", "ok"] : p >= 2 ? ["Média", "warn"] : ["Fraca", "bad"];
      };
      const gerar = (n = 16) => {
        const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
        const v = new Uint32Array(n);
        crypto.getRandomValues(v);
        return Array.from(v, (x) => c[x % c.length]).join("");
      };
      const registrarLog = (acao, item) => {
        st.log.push({ t: Date.now(), acao, item });
        st.log = st.log.slice(-50);
        salvar("cofre", st);
      };
      const ir = abas(raiz, ["Senhas", "Nova senha", "Auditoria", "Saúde do cofre"], (aba, p) => {
        if (aba === 0) {
          p.innerHTML = tabela(["Sistema", "Pasta", "Usuário", "Senha", "Força", ""], st.itens.map((x, i) => {
            const [f, tom] = forca(x.senha);
            return [esc(x.sistema), esc(x.pasta), esc(x.usuario), `<code data-senha="${i}">••••••••••</code>`, chip(f, tom), `<button type="button" class="btn btn-sm btn-ghost" data-ver="${i}">Ver</button> <button type="button" class="btn btn-sm btn-ghost" data-copiar="${i}">Copiar</button>`];
          }));
        } else if (aba === 1) {
          p.innerHTML = `<form class="ta-card ta-form" data-nova><h4>Nova credencial</h4>
            <label>Sistema<input name="sistema" required maxlength="40" placeholder="Ex.: Servidor de arquivos"></label>
            <label>Usuário<input name="usuario" maxlength="40"></label>
            <label>Senha<span class="ta-inline"><input name="senha" required maxlength="64" value="${gerar()}"><button type="button" class="btn btn-sm btn-ghost" data-gerar>Gerar outra</button></span></label>
            <p data-forca class="ta-previsao"></p>
            <label>Pasta (quem pode ver)<select name="pasta"><option>Infraestrutura</option><option>Sistemas</option><option>Financeiro</option><option>Diretoria</option></select></label>
            <button class="btn btn-primary">Salvar no cofre</button></form>`;
          const f = p.querySelector("form");
          const mostrar = () => (p.querySelector("[data-forca]").textContent = `Força da senha: ${forca(f.senha.value)[0]}`);
          f.senha.addEventListener("input", mostrar);
          mostrar();
        } else if (aba === 2) {
          p.innerHTML = tabela(["Quando", "Pessoa", "Ação", "Credencial"], st.log.slice().reverse().map((l) => [dataCurta(l.t), "Você", chip(l.acao, l.acao === "Criou" ? "ok" : "info"), esc(l.item)]), "Veja ou copie uma senha para registrar um acesso.");
        } else {
          const contagem = st.itens.reduce((m, x) => ((m[x.senha] = (m[x.senha] ?? 0) + 1), m), {});
          p.innerHTML = kpis([["Senhas", st.itens.length], ["Fortes", st.itens.filter((x) => forca(x.senha)[0] === "Forte").length, "ok"], ["Fracas", st.itens.filter((x) => forca(x.senha)[0] === "Fraca").length, "bad"], ["Repetidas", st.itens.filter((x) => contagem[x.senha] > 1).length, "warn"]]) + `<p class="muted ta-dica">O cofre avisa quando uma senha é fraca ou usada em mais de um sistema.</p>`;
        }
      });
      raiz.addEventListener("click", async (e) => {
        const ver = e.target.closest("[data-ver]");
        const cop = e.target.closest("[data-copiar]");
        if (e.target.closest("[data-gerar]")) {
          const campo = raiz.querySelector("[name=senha]");
          campo.value = gerar();
          campo.dispatchEvent(new Event("input"));
        } else if (ver) {
          const x = st.itens[Number(ver.dataset.ver)];
          const code = raiz.querySelector(`[data-senha="${ver.dataset.ver}"]`);
          const aberta = code.textContent !== "••••••••••";
          code.textContent = aberta ? "••••••••••" : x.senha;
          if (!aberta) registrarLog("Visualizou", x.sistema);
        } else if (cop) {
          const x = st.itens[Number(cop.dataset.copiar)];
          try {
            await navigator.clipboard.writeText(x.senha);
            aviso("Senha copiada. O acesso ficou registrado na auditoria.");
          } catch {
            aviso("Não foi possível copiar neste navegador.");
          }
          registrarLog("Copiou", x.sistema);
        }
      });
      raiz.addEventListener("submit", (e) => {
        if (!e.target.matches("[data-nova]")) return;
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        st.itens.push(d);
        registrarLog("Criou", d.sistema);
        aviso("Credencial salva no cofre.");
        ir(0);
      });
    },

    /* Nexor IT Platform: inventário, alertas, instalação e comandos */
    ti(raiz) {
      const st = estado("ti", {
        maquinas: [
          ["FIN-PC01", "marina.souza", "Windows 11", true, 95, true],
          ["FIN-PC02", "paulo.alves", "Windows 11", true, 61, true],
          ["VEN-NB07", "pedro.lima", "Windows 11", true, 44, true],
          ["VEN-NB08", "lara.dias", "Windows 11", false, 52, true],
          ["RH-PC03", "ana.costa", "Windows 10", true, 70, true],
          ["DIR-NB01", "joao.reis", "Windows 11", true, 38, true],
          ["EST-PC02", "carlos.melo", "Windows 10", true, 81, false],
          ["TI-PC01", "suporte", "Windows 11", true, 55, true],
        ].map(([nome, usuario, so, ligado, disco, antivirus]) => ({ nome, usuario, so, ligado, disco, antivirus, programas: ["Navegador", "Pacote Office", "Leitor de PDF"] })),
        chamados: 0,
        log: [],
      });
      const registrarLog = (acao) => {
        st.log.push({ t: Date.now(), acao });
        st.log = st.log.slice(-60);
        salvar("ti", st);
      };
      const alertas = () =>
        st.maquinas.flatMap((m) => [
          ...(m.disco >= 90 ? [[m.nome, `Disco ${m.disco}% cheio`, "Alta", "bad"]] : []),
          ...(!m.antivirus ? [[m.nome, "Sem antivírus", "Alta", "bad"]] : []),
          ...(m.so === "Windows 10" ? [[m.nome, "Sistema sem suporte", "Média", "warn"]] : []),
        ]);
      const PROGRAMAS = ["Cliente VPN", "Antivírus corporativo", "Leitor de PDF (atualização)", "Agente de backup"];
      const ir = abas(raiz, ["Inventário", "Alertas", "Instalar programa", "Comando remoto", "Auditoria"], (aba, p) => {
        if (aba === 0) {
          const on = st.maquinas.filter((m) => m.ligado).length;
          p.innerHTML = kpis([["Computadores", st.maquinas.length], ["Ligados agora", on, "ok"], ["Alertas", alertas().length, alertas().length ? "warn" : "ok"], ["Chamados abertos", st.chamados]]) +
            tabela(["Máquina", "Usuário", "Sistema", "Disco", "Status", ""], st.maquinas.map((m, i) => [esc(m.nome), esc(m.usuario), esc(m.so), `${m.disco}%`, m.ligado ? chip("Ligado", "ok") : chip("Desligado", "info"), m.ligado ? `<button type="button" class="btn btn-sm btn-ghost" data-reiniciar="${i}">Reiniciar</button>` : ""]));
        } else if (aba === 1) {
          p.innerHTML = tabela(["Máquina", "Alerta", "Gravidade", ""], alertas().map(([n, a, g, tom]) => [esc(n), esc(a), chip(g, tom), `<button type="button" class="btn btn-sm btn-primary" data-chamado="${esc(n)}|${esc(a)}">Abrir chamado</button>`]), "Nenhum alerta. Tudo em ordem!");
        } else if (aba === 2) {
          p.innerHTML = `<div class="ta-card ta-form"><h4>Instalar em várias máquinas de uma vez</h4>
            <label>Programa<select data-prog>${PROGRAMAS.map((x) => `<option>${x}</option>`).join("")}</select></label>
            <label>Destino<select data-dest><option value="todas">Todas as máquinas ligadas</option>${st.maquinas.filter((m) => m.ligado).map((m) => `<option>${m.nome}</option>`).join("")}</select></label>
            <p class="muted ta-dica">O pacote é assinado e cada máquina confere a assinatura antes de instalar.</p>
            <button class="btn btn-primary" type="button" data-instalar>Instalar agora</button><div class="ta-progresso" data-progresso></div></div>`;
        } else if (aba === 3) {
          p.innerHTML = `<div class="ta-card ta-form"><h4>Rodar um comando</h4>
            <label>Comando<select data-cmd><option value="ipconfig /flushdns">Limpar cache de DNS</option><option value="gpupdate /force">Atualizar políticas</option><option value="shutdown /r /t 60">Reiniciar em 60 segundos</option></select></label>
            <label>Destino<select data-cmd-dest><option value="todas">Todas as máquinas ligadas</option>${st.maquinas.filter((m) => m.ligado).map((m) => `<option>${m.nome}</option>`).join("")}</select></label>
            <button class="btn btn-primary" type="button" data-rodar-cmd>Executar</button><pre class="ta-terminal" data-saida></pre></div>`;
        } else {
          p.innerHTML = tabela(["Quando", "Quem", "Ação"], st.log.slice().reverse().map((l) => [dataCurta(l.t), "Você", esc(l.acao)]), "As ações que você fizer aparecem aqui, com data e hora.");
        }
      });
      raiz.addEventListener("click", async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.dataset.reiniciar) {
          const m = st.maquinas[Number(b.dataset.reiniciar)];
          registrarLog(`Reiniciou ${m.nome} (usuário avisado, 60 s)`);
          aviso(`${m.nome}: o usuário foi avisado e a máquina reinicia em 60 segundos.`);
        } else if (b.dataset.chamado) {
          const [n, a] = b.dataset.chamado.split("|");
          st.chamados++;
          registrarLog(`Abriu chamado para ${n}: ${a}`);
          aviso(`Chamado aberto para ${n}: ${a}.`);
          ir(1);
        } else if (b.dataset.instalar !== undefined) {
          const prog = raiz.querySelector("[data-prog]").value;
          const dest = raiz.querySelector("[data-dest]").value;
          const alvo = st.maquinas.filter((m) => m.ligado && (dest === "todas" || m.nome === dest));
          const caixa = raiz.querySelector("[data-progresso]");
          b.disabled = true;
          caixa.innerHTML = alvo.map((m) => `<div><span>${esc(m.nome)}</span><i><b style="width:0"></b></i><small>aguardando</small></div>`).join("");
          for (const [k, m] of alvo.entries()) {
            const linha = caixa.children[k];
            linha.querySelector("small").textContent = "instalando…";
            linha.querySelector("b").style.width = "100%";
            await new Promise((r) => setTimeout(r, 450));
            linha.querySelector("small").textContent = "concluído ✓";
            if (!m.programas.includes(prog)) m.programas.push(prog);
            if (prog === "Antivírus corporativo") m.antivirus = true;
          }
          registrarLog(`Instalou ${prog} em ${alvo.length} máquina(s)`);
          b.disabled = false;
        } else if (b.dataset.rodarCmd !== undefined) {
          const cmd = raiz.querySelector("[data-cmd]").value;
          const dest = raiz.querySelector("[data-cmd-dest]").value;
          const alvo = st.maquinas.filter((m) => m.ligado && (dest === "todas" || m.nome === dest));
          const saida = raiz.querySelector("[data-saida]");
          saida.textContent = `> ${cmd}\n`;
          for (const m of alvo) {
            await new Promise((r) => setTimeout(r, 250));
            saida.textContent += `[${m.nome}] concluído com sucesso\n`;
          }
          registrarLog(`Executou "${cmd}" em ${alvo.length} máquina(s)`);
        }
      });
    },
  };

  return { abrir };
})();

/* Link direto para um teste: /#testar-atende, /#testar-gestao... (usado pelas páginas de serviço e anúncios) */
(() => {
  const abrirDoLink = () => {
    const m = location.hash.match(/^#testar-(\w+)$/);
    if (m && SOLUCOES.some((s) => s.id === m[1])) {
      history.replaceState(null, "", location.pathname + location.search);
      Teste.abrir(m[1]);
    }
  };
  abrirDoLink();
  addEventListener("hashchange", abrirDoLink);
})();
