# 3. Padrões reutilizáveis

Use como está. Só mude um padrão se o dono pedir. Atualizado em 12/11/2026.

## Técnica (todo produto)
- Node 22, ESM, `node:sqlite`, zod, servidor HTTP próprio, sem framework. Poucas dependências.
- Estrutura: `src/servidor.js` (entrada), `src/` (regras), `public/` (telas), `test/` (`node --test`), `Dockerfile`, `.env.example`.
- Dinheiro sempre em centavos inteiros. Datas relativas calculadas no servidor. Mensagens de erro em português.
- **Modelo a copiar:** `elo/` (o mais recente e completo). Reaproveite os utilitários dele.

## Segurança (todo produto)
- CSRF: cabeçalho `x-nexor: 1` em todo pedido que altera dados.
- CSP restritiva; cookies HttpOnly e SameSite; `TRUST_PROXY=0` por padrão.
- Senhas com scrypt em fila. Segredos guardados com AES-GCM.
- Limite de tentativas que conta só os erros.
- Isolamento por empresa em toda consulta (sem acesso a dado de outra conta).
- Papéis e permissões conferidos no servidor, nunca só na tela.
- Operações de dinheiro e de estoque: atômicas e idempotentes (toque duplo não duplica).
- Webhooks: assinatura conferida e idempotência.
- Auditoria de ações sensíveis com usuário, data e IP da própria requisição.
- LGPD: aviso de privacidade, anonimização a pedido, backup, mínimo de dados em telas públicas.

## Design dos produtos
- **Site e peças de marketing:** fundo navy `#010524`, azul `#0058FA`, azul claro `#3B8DFF`, ciano `#00E1FB`, branco gelo `#EBF1F9`. Fontes: Space Grotesk (títulos), Inter (texto), Michroma (logo), JetBrains Mono (código). Variáveis em `assets/css/style.css`.
- **Home do site (18/11/2026):** topo com o simulador "escolha o seu negócio" (`assets/js/home.js`; abre a cena certa pela `utm_campaign`), faixa de garantias, produtos em faixa clara cor gelo com tela real, como funciona, gente que cuida, sob medida, dúvidas e chamada final. Estilo em `assets/css/home.css`. Sem valores, sem rótulo "// kicker" e sem palavra colorida no meio do título. Versão viva: cenas trocam sozinhas, com barra de progresso e IA "digitando", e param quando a pessoa interage; rede neural no fundo; faixa "a IA trabalhando"; mapa dos sistemas que conversam entre si; banca de teste de intrusão animada (sem citar agentes de IA); seção "O que a Nexor está criando agora" (`em-breve.js`); galeria de telas reais por produto (miniaturas `data-tela`); toda tela de produto do site amplia ao clicar (`assets/js/zoom.js`, incluído na home e nas páginas `solucoes/`: cantos de mira, varredura de 300 ms, grade no fundo, setas, Esc e deslizar no celular); perguntas prontas que abrem a Blue (`data-abrir-blue="pergunta"`). Movimento só com transform e opacity, de 100 a 300 ms, respeitando "reduzir movimento". Texto: atendemos o Brasil inteiro, feito em Araguari.
- **Painéis dos sistemas:** tema claro, com os tokens e componentes de `elo/public/comum/` (`base.css`, `ui.js`, `casca.js`, `tema.js`, `demo-faixa.js`). Copie essa pasta.
- **Bancos (desde 17/11/2026):** código comum em `assets/bancos/`, copiado por `tools/bancos.sh` para `src/bancos/` de RH, Contábil e Barber. Inclui Pix copia e cola com a chave do cliente (qualquer banco), leitura de OFX, remessa CNAB 240 de pagamentos (BB, Caixa, Bradesco, Santander, Sicoob, Sicredi e Inter; o Itaú usa o SISPAG, que é diferente) e cliente da API Pix no padrão do Banco Central. Boleto e cartão continuam pelo Asaas. Testes: `node --test assets/bancos/bancos.test.mjs`.
- **Nuvem Nexor (desde 17/11/2026):** a VPS da Hostinger roda `interno/` (Central e Blue) e os clientes sem servidor. Um túnel da Cloudflare só: `central`, `api` e o curinga `*` → borda (`nuvem/`), que encaminha cada `<cliente>.nexorconsultingit.com.br`. Cliente novo: `SISTEMAS="barber" ./nova-empresa.sh <cliente> auto`. Os sistemas na nuvem usam `TRUST_PROXY=2` (túnel + borda). **Segurança da nuvem:** com mais de 10 clientes, a VPS Nexor (Central e Blue) fica separada da VPS Clientes (borda com túnel próprio); a Central fica atrás do Cloudflare Access, com Bypass só nos caminhos públicos (`/api/v1`, `/api/webhooks`, portal do parceiro, `/health`), conferidos por `nuvem/conferir-acesso.sh`; o backup externo é cifrado com rclone (`nuvem/backup-externo.sh`), e os endereços `/health` ficam no UptimeRobot.
- **Telas de acesso (login, primeiro acesso, portal):** padrão único desde 12/11/2026. Fundo navy com a rede animada de pontos (`fundo-rede.js`) e caixas de vidro (transparentes, com desfoque), definidas em `acesso.css`.
  - Fonte única em `assets/acesso/`. Depois de mudar, rode `tools/acesso.sh`, que copia para `<produto>/public/acesso/`. Não edite as cópias.
  - Em cada página com tela de acesso: `<link rel="stylesheet" href="/acesso/acesso.css">` e `<script src="/acesso/fundo-rede.js" defer></script>`.
  - O script acha a tela sozinho pelas classes `.login`, `.p-login`, `.tela-entrar`, `.ativacao`, `#entrada.entrada`. Tela nova: use a estrutura `.login` de `elo/public/comum/casca.js` ou envolva a caixa em `<div class="nx-tela-acesso">`.
  - Cores da rede: linhas azul `59,141,255`, destaque ciano `0,225,251`. Respeita "reduzir animações" do aparelho.
- **Caixas com efeito de vidro:** em todas as telas, desde 16/11/2026. Dentro dos painéis, `.cartao`, `.lateral` e `.modal` usam `background: var(--vidro, var(--superficie))` (janelas usam `--vidro-forte`). O vidro e o fundo com luz suave ficam em `acesso.css`. Caixa nova: use `.cartao`; não ponha fundo opaco por cima.
- **Tipografia:** só três pesos (400, 500 e 600; nada de 700 ou mais). Nenhum texto abaixo de 12 px. Texto base dos painéis: 14,5 px, com entrelinha 1,5; títulos com entrelinha 1,2. Hierarquia por tamanho e espaço, não por peso.
- Telas responsivas: sem rolagem lateral em 360 e 390 px. Conferir com Playwright em 390 e 1280 px.
- Logos oficiais: `marketing/marca/` e `assets/img/logo-*.webp`.

## Modo Demonstração (contrato igual em todos)
- `DEMO=1` escuta só em `127.0.0.1` e bloqueia rede externa por código. WhatsApp, SMS, e-mail, pagamento e IA são simulados.
- Rotas: `/demo/entrar` (por perfil, sem senha), `GET /api/demo`, `POST /api/demo/reiniciar`. Sem `DEMO=1`, respondem 404.
- Faixa laranja "Demonstração · dados fictícios", com trocar de perfil e reiniciar.
- Empresa fictícia de Araguari, dados com datas relativas a hoje, telefones (34) 99999-xxxx, em `data-demo/`.
- Entrada em `demo/iniciar.mjs` (porta própria) e roteiro de 10 minutos em `<produto>/DEMO.md`.

## Auditoria (Banca de Testes)
- Agentes em `.claude/agents/banca-*.md`; como rodar em `banca/README.md`.
- Relatórios em `banca/relatorios/<AAAA-MM>-<alvo>/` (`hacker.md`, `programador-senior.md`, `testador.md`, `usuario-confuso.md`, `veredito.md`).
- Gravidade: grave (antes de vender), alto (na semana), médio (próxima versão), básico (quando der).
- O veredito traz nota de 0 a 10, o que é sólido, os itens V-xx corrigidos com teste, o que ficou em aberto e as ações do responsável.
- Formato de referência: `banca/relatorios/2026-11-elo/veredito.md`.

## Documentos de cada produto
`README.md` (o que é e como rodar) · `DEMO.md` (roteiro) · manual de instalação · manual do usuário · `API.md` quando tiver integração · `SEGURANCA.md` quando segurança for o argumento de venda.

## Site
- Páginas de produto são **geradas** por `tools/paginas.py` (edite o script e rode `python3 tools/paginas.py`; não edite o HTML na mão). Saída em `solucoes/<slug>/index.html`.
- Cards da página inicial em `assets/js/solucoes.js`; bloco de fundadores em `index.html`.
- Cada página: título e descrição para o Google, JSON-LD, perguntas frequentes, botão do teste de 30 dias com rastreio de campanha.
- Telas dos produtos em `assets/img/<produto>/*.webp` (1600×1000, até cerca de 90 KB).

## Marketing
- Peças: fonte em `marketing/fonte/pecas.html`, renderizadas com Playwright para `marketing/pecas/*.png`.
- Tamanhos: post 1080×1350, story 1080×1920, anúncio de link 1200×628, capa do LinkedIn 1584×396.
- Textos por canal em `marketing/CANAIS.md` (Google Meu Negócio, LinkedIn, WhatsApp Business, Instagram e Facebook).
- Campanha por produto em `marketing/campanhas/<produto>.md`: público, ganchos, anúncios Meta e Google, palavras-chave e negativas, filtros, cadência, objeções, roteiro de demonstração, links com UTM. Projeção em `PROJECAO.md` e `simulador.html`.
- Vídeos automáticos: gerador em `marketing/videos/gerador/`.
- **Vídeos com locução (desde 16/11/2026):** projeto Remotion em `marketing/videos/remotion/`. Modelo único em `src/VideoProduto.tsx`; cada produto é uma entrada em `src/produtos.tsx` (frases, cenas, telas e foco). Tempos medidos por `node scripts/tempos.mjs <pasta>`. Tela de celular ou peça vertical: use `largura` (ex.: 400) e `proporcao` na cena. A Blue tem vídeo próprio todo animado (`src/VideoBlue.tsx`): conversa digitada, rosto que pulsa com a voz, escolha do sistema, teste, agenda e passagem para o time.
- **Padrão vigente (17/11/2026): vídeo todo animado, sem tela parada.** Peças em `src/kit.tsx` (fundo vivo, voz que mexe a cena, balões, cartões, contadores, celular, WhatsApp, toque); um arquivo por produto em `src/animados/` e registro em `src/animados/index.ts`. Renderizar com `sh scripts/render.sh <id> <arquivo> [pasta da folha]`.
  - Locução do ElevenLabs, modelo `eleven_v4`, voz **Cajó** (`gHd1exuPmjC5yOMlzA9t`, masculina, natural, português do Brasil), aprovada pelo dono. A Blue usa a voz **Sofia** (`n2a9VtkZLl8j1FSXHsL7`, feminina). Texto do roteiro de `marketing/videos/roteiros/`, com reticências entre as frases para pausas naturais.
  - **Institucional 16:9 (18/11/2026):** `src/Institucional.tsx`, composição `NexorInstitucional`, saída `marketing/videos/nexor-institucional.mp4`. Frases em `src/tempos/institucional.frases.json` (o `tempos.mjs` lê esse arquivo). Trilha própria: `node scripts/trilha-institucional.mjs`. Voz de reserva quando o ElevenLabs cai: vidIQ, voz **Will** (`CstacWqMhJQlnfLPxRG4`); mandar o roteiro num texto só (em trechos dá limite) e abrir respiro de 1 s entre frases com ffmpeg.
  - Baixe o mp3 para `public/<produto>/locucao.mp3` (o ambiente `nexorconsulting` libera `elevenlabsusercontent.com`) e meça as pausas com `ffmpeg -af silencedetect=noise=-30dB:d=0.1`. As cenas e as legendas seguem esses tempos: o áudio nunca é acelerado.
  - Telas sempre inteiras na moldura; depois de 35% da cena, aproximação lenta (1,4 s) da área citada na fala.
  - Renderizar: `npx remotion render <id> ../<arquivo>.mp4 --browser-executable=<chromium do Playwright>`.

## Prospecção e vendas
- Blue (pasta `agent/`): identifica a campanha pela `utm_campaign`, pontua o contato de 0 a 100 (quente a partir de 70, morno de 40 a 69), filtra curioso, concorrente e estudante, faz a cadência e envia os eventos ao Meta e ao Google.
- Modelo de prospecção local: lista por CNAE, pontuação dos alvos, roteiro de visita e objeções. Referência: `comercial/ELO-ARAGUARI.md`.
- Proposta: tabela em `comercial/`, exemplos de conta fechada e mensagens prontas de WhatsApp.
- Central (`central/`): clientes, teste de 30 dias, contratação, fundadores, faturas, comissões e licença dos sistemas.

## Implantação
- Por empresa: `implantacao/` (Docker, túnel, backup, guia em `GUIA-INSTALACAO.md`).
- Servidor interno da Nexor (Central e Blue): `interno/`.
- Política de LGPD na implantação: `POLITICA-IMPLANTACAO-LGPD.md`.
