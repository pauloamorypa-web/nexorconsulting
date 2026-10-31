# Nexor Consulting — Site institucional

Site estático (HTML + CSS + JS puro, sem build) da Nexor Consulting: *Tecnologia • Segurança • Performance*.

## Seções
- **Hero** com proposta de valor, CTA de diagnóstico gratuito e números (+10 anos, +200 clientes, 100% foco em resultados)
- **Com ou sem TI** — atendimento para empresas com ou sem time de TI
- **Serviços** — infraestrutura, segurança, cloud & backup, suporte, automação, consultoria, RMM e segurança eletrônica com IA
- **Metodologia** — da reação à prevenção + Segurança 360°
- **Diferenciais**
- **Planos** — Start, Core, Business e Enterprise, com comparativo completo
- **Simulador** — monta a solução, calcula o total mensal, gera proposta em PDF (jsPDF) ou envia pelo WhatsApp
- **Sobre**, **galeria de posts** e **contato** (formulário que abre o WhatsApp com a mensagem preenchida)

## Como rodar
Abra `index.html` no navegador, ou sirva a pasta:

```bash
python3 -m http.server 8000
```

Pode ser publicado direto no GitHub Pages, Netlify, Vercel ou qualquer hospedagem estática.

## Configuração
Defina o número do WhatsApp em `assets/js/main.js`:

```js
const WHATSAPP_NUMBER = "5500000000000"; // DDI + DDD + número
```

Preços dos serviços do simulador e dados do comparativo de planos também ficam em `assets/js/main.js` (`SERVICES` e `PLAN_ROWS`).
