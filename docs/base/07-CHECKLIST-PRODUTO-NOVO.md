# 7. Checklist de produto novo

Todo produto novo da Nexor só está "pronto" com todos os itens. Faça na ordem. Não invente estrutura: copie de `elo/`.

## 1. Antes de programar
- [ ] Especificação curta em `<produto>/ESPECIFICACAO.md`: para quem, problema, perfis de acesso, regras, diferenciais, fora do escopo.
- [ ] Estudo de mercado em `comercial/<PRODUTO>-MERCADO.md`: concorrentes com preço e fonte, nosso custo, preço proposto, público em Araguari e região, objeções.
- [ ] Nome, pasta, porta da demonstração (próxima livre depois de 8797) e endereço da página.

## 2. Produto
- [ ] Servidor no padrão técnico e de segurança (`03-PADROES-REUTILIZAVEIS.md`).
- [ ] Telas com os componentes de `elo/public/comum/`, conferidas em 390 e 1280 px.
- [ ] Tela de acesso no padrão Nexor: fundo de rede e caixas de vidro (`assets/acesso/`, incluir o produto em `tools/acesso.sh`).
- [ ] Testes automáticos das regras de segurança e de dinheiro, todos verdes.
- [ ] Modo Demonstração no contrato padrão, com empresa fictícia de Araguari, e entrada em `demo/iniciar.mjs` e `demo/README.md`.
- [ ] Integração com a Central: plano em `central/src/planos.js`, teste de 30 dias, licença e bloqueio.
- [ ] Docker e `.env.example`.

## 3. Documentos (obrigatórios)
- [ ] `README.md`: o que é e como rodar.
- [ ] **Manual de instalação** (`MANUAL-INSTALACAO.md`): passo a passo para o técnico, variáveis, backup, atualização.
- [ ] **Manual do usuário** (`MANUAL-USUARIO.md`): por perfil, com as telas, em linguagem de quem usa.
- [ ] `DEMO.md`: roteiro de 10 minutos para a venda.
- [ ] `API.md` e `SEGURANCA.md` quando fizer sentido.

## 4. Auditoria
- [ ] Banca de Testes: 4 agentes em paralelo, depois o Veredito.
- [ ] Correções aprovadas pelo dono, cada uma com teste.
- [ ] `veredito.md` com nota e pendências, em `banca/relatorios/<AAAA-MM>-<produto>/`.

## 5. Comercial
- [ ] Tabela de preços em `comercial/` e no catálogo da Central (iguais).
- [ ] Fundadores e teste de 30 dias definidos.
- [ ] Proposta de venda preenchível e exemplo em PDF.
- [ ] Roteiro da primeira reunião, objeções e mensagens prontas.
- [ ] Lista de segmentos a prospectar em Araguari e região, por CNAE.

## 6. **Marketing** (obrigatório)
- [ ] Telas reais do produto (dados fictícios) em `assets/img/<produto>/`.
- [ ] Página no site por `tools/paginas.py`, card na página inicial e sitemap.
- [ ] Campanha em `marketing/campanhas/<produto>.md` e entrada na Blue (`agent/src/campanhas.js`, `conhecimento.js`).
- [ ] Peças: capa de carrossel, story, anúncio de link e imagem de catálogo.
- [ ] Textos nos canais (`marketing/CANAIS.md`).
- [ ] Vídeo automático pelo gerador, quando houver telas.

## 7. Fechamento
- [ ] Atualizar `docs/base/` (mapa, decisões, pendências).
- [ ] PR e merge na main. Conferir a página no ar.
- [ ] Resumo ao dono: o que está pronto, o que depende dele.
