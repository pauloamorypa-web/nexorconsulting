# Nexor Consulting — Site institucional

Site estático (HTML + CSS + JavaScript puro, sem build) da Nexor Consulting: desenvolvimento de sites, sistemas empresariais, software sob medida e IA para automação de processos.

## Seções
- **Hero** com rede neural animada em canvas, palavras rotativas e janela de código "digitando"
- **Tecnologias** em faixa contínua (linguagens, frameworks, cloud e IA)
- **Mercado**: dados públicos do mercado brasileiro (TI, WhatsApp, e-commerce, agentes de IA) com links para as fontes
- **Soluções mais procuradas**: Nexor Atende IA, Commerce, Gestão, Site Pro, Automação e Sob Medida
- **Soluções por porte** (pequeno, médio, grande) em abas
- **Vitrine de projetos**: 9 modelos com telas renderizadas em HTML/CSS, filtros por categoria e detalhes em modal
- **Integrações** com ferramentas usadas no Brasil (WhatsApp, marketplaces, Pix, ERPs, CRMs)
- **IA em ação**: simulação de agentes automatizando processos, com pipeline e terminal de logs
- **Calculadora de retorno** da automação com IA e pilares de governança (LGPD, auditoria, supervisão humana)
- **Engenharia**: exemplos de código com realce de sintaxe (TypeScript, Python, SQL, Go)
- **Processo**, **diferenciais**, **configurador de projeto** (gera briefing e envia pelo WhatsApp) e **FAQ**

## Como rodar
Abra `index.html` no navegador, ou sirva a pasta:

```bash
python3 -m http.server 8000
```

Pode ser publicado no GitHub Pages, Netlify, Vercel ou qualquer hospedagem estática.

### GitHub Pages
Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`. O site fica em `https://pauloamorypa-web.github.io/nexorconsulting/`. O arquivo `.nojekyll` faz o GitHub servir os arquivos como estão.

## Onde editar
- `assets/js/main.js` → `WHATSAPP_NUMBER` (DDI + DDD + número), integrações, processos da seção de IA, exemplos de código e tecnologias
- `assets/js/projects.js` → modelos da vitrine (nome, descrição, recursos, stack, cores)
- `assets/css/style.css` → cores e visual (variáveis em `:root`)

## Agente de IA (Nexor Assist)
A pasta `agent/` tem o agente de atendimento com IA (Claude) que responde no chat do site e no WhatsApp, registra leads e agenda o diagnóstico gratuito. Instruções em [`agent/README.md`](agent/README.md). O chat do site (`assets/js/assistente.js`) só aparece depois que o endereço do servidor do agente for configurado.
