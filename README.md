# Nexor Consulting — Site institucional

Site estático (HTML + CSS + JavaScript puro, sem build) da Nexor Consulting: desenvolvimento de sites, sistemas empresariais, software sob medida e IA para automação de processos.

## Seções
- **Hero** com rede neural animada em canvas, palavras rotativas e janela de código "digitando"
- **Tecnologias** em faixa contínua (linguagens, frameworks, cloud e IA)
- **Serviços**: sites, sistemas empresariais, sob medida, IA & automação, apps, integrações/cloud
- **Soluções por porte** (pequeno, médio, grande) em abas
- **Vitrine de projetos**: 9 modelos com telas renderizadas em HTML/CSS, filtros por categoria e detalhes em modal
- **IA em ação**: simulação de agentes automatizando processos, com pipeline e terminal de logs
- **Engenharia**: exemplos de código com realce de sintaxe (TypeScript, Python, SQL, Go)
- **Processo**, **diferenciais**, **configurador de projeto** (gera briefing e envia pelo WhatsApp) e **FAQ**

## Como rodar
Abra `index.html` no navegador, ou sirva a pasta:

```bash
python3 -m http.server 8000
```

Pode ser publicado no GitHub Pages, Netlify, Vercel ou qualquer hospedagem estática.

## Onde editar
- `assets/js/main.js` → `WHATSAPP_NUMBER` (DDI + DDD + número), processos da seção de IA, exemplos de código e tecnologias
- `assets/js/projects.js` → modelos da vitrine (nome, descrição, recursos, stack, cores)
- `assets/css/style.css` → cores e visual (variáveis em `:root`)
