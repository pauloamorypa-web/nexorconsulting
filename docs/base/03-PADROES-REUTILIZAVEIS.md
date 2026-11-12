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
- **Painéis dos sistemas:** tema claro, com os tokens e componentes de `elo/public/comum/` (`base.css`, `ui.js`, `casca.js`, `tema.js`, `demo-faixa.js`). Copie essa pasta.
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

## Prospecção e vendas
- Blue (pasta `agent/`): identifica a campanha pela `utm_campaign`, pontua o contato de 0 a 100 (quente a partir de 70, morno de 40 a 69), filtra curioso, concorrente e estudante, faz a cadência e envia os eventos ao Meta e ao Google.
- Modelo de prospecção local: lista por CNAE, pontuação dos alvos, roteiro de visita e objeções. Referência: `comercial/ELO-ARAGUARI.md`.
- Proposta: tabela em `comercial/`, exemplos de conta fechada e mensagens prontas de WhatsApp.
- Central (`central/`): clientes, teste de 30 dias, contratação, fundadores, faturas, comissões e licença dos sistemas.

## Implantação
- Por empresa: `implantacao/` (Docker, túnel, backup, guia em `GUIA-INSTALACAO.md`).
- Servidor interno da Nexor (Central e Blue): `interno/`.
- Política de LGPD na implantação: `POLITICA-IMPLANTACAO-LGPD.md`.
