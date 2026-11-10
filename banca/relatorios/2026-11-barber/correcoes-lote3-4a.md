# Correções da Banca · Nexor Barber · lotes 3 e 4 (parte A) · 2026-11-10

Aprovação: o responsável aprovou todos os itens do veredito. Esta parte cobre só os itens abaixo; os lotes 1 e 2 estão com outro agente.
Testes novos: `barber/test/banca-lote3-4a.test.js` (12 testes, cada um falhava no código original e passa agora). Suíte inteira: `npm test` com 37 de 37 passando.
Telas: conferidas com Playwright (painel em 1280 px e 390 px, app em 390 px).

| Item | Status | Arquivos | Teste |
|---|---|---|---|
| V-15 · busca de clientes além do 2.000º | corrigido: filtro, busca (nome e e-mail com acento, celular) e filtros no SQL, `LIKE` com escape, paginação `?pagina=` de 300 | `src/http/api.js`, `src/db.js` (função `minusculas`) | `V-15` |
| V-16 · limite de login | corrigido: conta só os erros; chave e-mail + IP (8) e IP (24); um acerto zera a chave e-mail + IP | `src/http/api.js` | `V-16` |
| V-24 · desempenho | corrigido: 7 índices idempotentes (`IF NOT EXISTS`); faixa de `/api/agendamentos` limitada a 31 dias; `detalharVarios` lê cadastros uma vez e as reservas numa consulta só; `/api/assinaturas` paginada (200) | `src/db.js`, `src/servicos/nucleo.js`, `src/http/api.js` | `V-24` |
| V-25 · remover chave do Asaas, WhatsApp ou SMS | corrigido: `PUT /api/canais {remover: [...]}` e seção "Remover credenciais" (com confirmação) na aba Canais | `src/http/api.js`, `public/js/views/config.js` | `V-25` (servidor); tela no Playwright |
| V-26 · painel no celular | corrigido: `.pagina` com coluna `minmax(0,1fr)`, `min-width: 0` nos filhos, só a fileira de abas rola. Antes: conteúdo de 1.198 px e "Salvar" em x=1177; depois: 390 px e "Salvar" em x=355 | `public/barber.css` | Playwright (Configurações, Canais, Agenda, Clientes, Clube, Caixa) |
| V-27 · mensagens em inglês | corrigido: mensagens do zod em português e rótulo do campo ("Preço: precisa ser um número"); "Sem conexão com a internet" no painel e no app | `src/http/validacao.js`, `public/js/api.js`, `public/app/app.js` | `V-27`; offline no Playwright |
| V-28 · duplo clique na janela | corrigido: cliques ignorados por 400 ms depois de fechar qualquer janela | `public/js/ui.js` | Playwright: duplo clique em "Na cadeira", nenhuma janela extra |
| V-29 · desconto da comanda | corrigido: validação ao digitar (negativo, maior que a conta, texto inválido) com aviso no campo e botão desabilitado; aceita "10%" (vira reais ao sair do campo) | `public/js/base.js`, `public/barber.css` | Playwright: "-50", "999", "abc" e "10%" |
| V-31 · datas impossíveis e URL ou cookie malformados | corrigido: `dia` confere se a data existe; nascimento só no passado (painel e app); decode de parâmetro malformado responde 400 e cookie malformado vira sessão vazia (401) | `src/http/validacao.js`, `src/http/roteador.js`, `src/http/api.js`, `src/http/app.js` | `V-31` |
| V-33 · `TRUST_PROXY` | corrigido: padrão 0; `.env.exemplo` documentado; `implantacao/docker-compose.yml` mantém `TRUST_PROXY: "1"` (Cloudflare Tunnel) com comentário; item no manual | `src/config.js`, `src/servidor.js`, `.env.exemplo`, `MANUAL-IMPLANTACAO.md`, `implantacao/docker-compose.yml` | `V-33` |
| V-35 · `/api/hoje` sem `?dia=` | corrigido | `src/http/api.js` | `V-35` |
| V-36 · corpo acima de 256 KB | corrigido: responde 413 (também pelo `Content-Length`) com `Connection: close` e só depois fecha | `src/http/roteador.js`, `src/servidor.js` | `V-36` (com Content-Length e chunked) |
| V-38 · segunda aba do mesmo cliente | corrigido: o mesmo cliente, serviço e início devolvem o horário existente com `ja_marcado`; o app avisa e leva ao Início | `src/http/app.js`, `public/app/app.js` | `V-38`; Playwright com duas abas |
| V-40 · voltar ou recarregar no agendamento | corrigido: passo no endereço (`#agendar/1..4`, `pushState`) e fluxo em `sessionStorage`; o Voltar do celular volta um passo e recarregar mantém as escolhas | `public/app/app.js` | Playwright |
| V-41 · sessão expirada no agendamento | corrigido: em 401 com sessão, guarda o fluxo, mostra a tela de entrar e retoma no mesmo passo | `public/app/app.js` | Playwright |
| V-42 · textos e canais | corrigido: `/api/app/info` traz `avisos` e `cobranca_online`; textos citam o canal ativo (WhatsApp ou SMS); CPF e "Pix, boleto ou cartão" só com Asaas | `src/http/app.js`, `public/app/app.js` | `V-42`; Playwright com só SMS |
| V-43 · acessibilidade | corrigido: `alt="Nexor Barber"` no logo do login (os outros logos ficam ao lado do nome, `alt=""`); mensagem da grade com `grid-column: 1 / -1`; coluna da agenda com foco (Tab) e Enter | `public/js/app.js`, `public/js/views/hoje.js`, `public/barber.css` | Playwright |
| V-44 · comparação do HMAC | corrigido: `iguais()` (tempo constante) | `src/servicos/nucleo.js` | `V-44` (confere o código e o login por código) |

## Observações para o merge com os lotes 1 e 2
- `src/http/api.js`: a linha de `import` da validação (adicionei `nascimento`) e o bloco de `PUT /api/canais` (adicionei `remover` logo depois do Asaas, sem mexer na linha do `token_webhook`) ficam perto do que o V-03 muda. Pode dar conflito pequeno, fácil de resolver.
- `src/servicos/nucleo.js`: mudei só o `import` de `seguranca.js`, `conferirCodigo` e o bloco de `detalhar`. `concluir`, `remarcar` e `vender` não foram tocados.
- `public/app/app.js`: mudei `api()` e `acao()` (sessão vencida e sem rede), não o fluxo de cancelar.
- `public/js/base.js`: a comanda usa `lerDesconto()` própria. A chamada a `/concluir` e `paraCentavos` não foram tocadas.

## Pendências e limites
- V-16: um ataque distribuído (muitos IPs) contra um e-mail ainda tem 8 tentativas por IP a cada 15 min. Esse é o preço de não deixar um terceiro trancar o dono.
- V-15: `/api/clientes` continua devolvendo uma lista (300 por página, com `?pagina=`). O painel ainda não tem o botão "ver mais".
- V-24: `/api/assinaturas` agora devolve 200 por página (`?pagina=`), e a tela do Clube mostra só a primeira página.
- V-44: tempo constante não se prova por teste de comportamento. O teste confere o código e o login.
