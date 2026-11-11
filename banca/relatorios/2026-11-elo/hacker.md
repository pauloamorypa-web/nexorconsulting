# Relatório do Agente Hacker · Nexor Elo · 2026-11-11

Escopo testado: instância local autorizada (`localhost:8821`, DEMO=1) — fluxo de dinheiro (webhook Asaas, split, pagar, reservar), privacidade do cliente final (rotas de fornecedor/pública/notificação), isolamento entre empresas (IDOR fornecedor↔fornecedor, instalador↔instalador, técnico↔dono, cross-cookie), reservas/inadimplência, uploads, login/sessão/CSRF/rate-limit, cabeçalhos, segredos e rotas de demonstração. Revisão de código de todo `src/` + testes dinâmicos com curl.
Fora do escopo: ambiente de produção real (não disponível); provedores externos reais (Asaas/BrasilAPI/Focus — simulados em DEMO); não foi possível reproduzir ao vivo o reprocessamento de webhook (H-01) porque o atacante não controla o token do webhook nem o envio do Asaas.

## Achados

### H-01 · Cobrança substituída não é cancelada no Asaas e webhook dela é reprocessado (quebra de idempotência)
- Gravidade sugerida: média
- Onde: `src/servicos/negocio.js` `pagar()` (linhas ~313-339) e `confirmarPagamento()` (linhas ~342-381); `src/servicos/adaptadores.js` (adaptador Asaas sem método de cancelar cobrança).
- Como reproduzir (análise de código + fluxo real): o cliente abre uma cobrança (ex.: PIX) → `pagar()` cria a cobrança no Asaas e grava `pagamentos` + `repasses` (previsto). O cliente troca a forma (ex.: BOLETO) → `pagar()` faz `UPDATE pagamentos SET status='cancelado' WHERE status='pendente'` **só no banco local**, cria a nova cobrança e **não cancela a cobrança anterior no Asaas** (o adaptador só tem `cancelarAssinatura`, não há cancelamento de cobrança). As duas cobranças ficam pagáveis. Se a cobrança antiga for paga, o Asaas manda `PAYMENT_RECEIVED` dela; `confirmarPagamento()` só trata idempotência quando `pg.status === 'pago'` — um pagamento `'cancelado'` passa direto e é processado por inteiro.
- Evidência: `grep` confirma ausência de cancelamento de cobrança no adaptador (`-> no Asaas-side cancellation of superseded charges`); os `repasses` do pagamento cancelado permanecem `previsto`; `confirmarPagamento` não filtra `status='cancelado'`.
- Impacto: um mesmo pedido pode dar **baixa de estoque duas vezes** (bloco `else` de `confirmarPagamento` abate de novo se houver estoque livre), **gerar repasses/títulos duplicados** (fornecedor sem walletId recebe título duplicado contra o instalador) e marcar split recebido duas vezes. Dano de integridade financeira e de estoque; não requer ação do atacante além de o cliente pagar uma cobrança suplantada.
- Correção sugerida: cancelar/estornar a cobrança anterior no Asaas ao trocar de forma (ou reaproveitar a mesma cobrança) e, em `confirmarPagamento`, ignorar/estornar pagamentos cujo `status` já seja `'cancelado'` (idempotência por `asaas_id` + estado terminal), além de cancelar os `repasses` do pagamento suplantado.

### H-02 · Modo Demonstração expõe ações sem autenticação (correto sob DEMO=1, risco com DEMO_PUBLICO=1)
- Gravidade sugerida: informativa (baixa se exposto à rede)
- Onde: `src/demo/index.js` (`/api/demo/pagar`, `/demo/entrar`, `/api/demo/mensagens`); `src/config.js` `demoPublico` (bind `0.0.0.0` com `DEMO_PUBLICO=1`); `src/servidor.js` (gate das rotas demo).
- Como reproduzir: `POST /api/demo/pagar` sem cookie (só `x-nexor:1`) → `200 {"ok":true,...}` confirmando o pagamento de qualquer cobrança pendente. `GET /demo/entrar?papel=fornecedor_dono` entrega sessão de qualquer papel sem senha. `GET /api/demo/mensagens` lista WhatsApp/e-mail/Asaas simulados sem login.
- Evidência: `POST /api/demo/pagar {}` sem autenticação devolveu `{"ok":true,"resultado":{"ok":true,"proposta_id":"41e9..."}}`; `/api/demo/mensagens` retornou 18 mensagens sem login.
- Impacto: nenhum em produção — essas rotas respondem 404 sem `DEMO=1` (confirmado no código: sem `rotasDemo`, `/demo` e `/api/demo*` → 404) e o servidor demo escuta só em `127.0.0.1` por padrão. O risco surge apenas se alguém subir `DEMO=1` com `DEMO_PUBLICO=1` em rede acessível: aí qualquer um loga como qualquer papel e "paga" propostas. Tudo é fictício.
- Correção sugerida: manter `DEMO=1` fora de produção; documentar que `DEMO_PUBLICO=1` nunca deve ser usado em rede não confiável; opcionalmente exigir um token local para `/api/demo/pagar`.

### H-03 · Página pública da proposta revela nome do cliente, documento parcial e bairro da obra a quem tiver o link
- Gravidade sugerida: informativa
- Onde: `src/http/publico.js` `propostaPublica()` (linhas 26-54); `GET /api/publico/propostas/:token`.
- Como reproduzir: abrir `/api/publico/propostas/<token>` → retorna `cliente.nome` (completo), `cliente.documento` mascarado (`•••••••••13`, 2 últimos dígitos) e `endereco_obra` com `bairro/cidade/uf`.
- Evidência: resposta observada `{"nome":"Juliana Teixeira Rocha","documento":"•••••••••13","endereco_obra":{"cidade":"Araguari","uf":"MG","bairro":"Bosque"}}`.
- Impacto: é o design "proposta por link sem login" (o próprio cliente precisa ver seus dados), mas qualquer um que receba o link (encaminhamento de WhatsApp, Referer não vaza pois há `no-referrer`) vê nome + documento parcial + bairro. Baixo; documento vem mascarado e o token é aleatório de 24 bytes com rate limit.
- Correção sugerida: aceitável como está; se quiser reduzir, mostrar só o primeiro nome até um segundo fator leve (ex.: confirmar os 3 primeiros dígitos do documento) e omitir o bairro antes do aceite.

## O que resistiu bem (com prova)
- **Webhook Asaas não forjável:** `POST /webhook/asaas` sem token e com token errado → `401 {"token inválido"}`; comparação constante (`iguais`/`timingSafeEqual`); token aleatório cifrado (AES-GCM), exposto só ao operador Nexor.
- **Isolamento entre empresas (IDOR):** instalador Eletro Rocha lendo proposta/cliente da Instala Seg → `404`; `PUT` em cliente de outra conta → `404`; fornecedor Elétrica Triângulo lendo proposta só-Vigia → `404`; na proposta compartilhada, só vê **os itens dele** (`['DJ-20A']`), sem bloco `cliente`. Cross-cookie (instalador/nexor em rota de fornecedor) → `401`.
- **Privacidade LGPD:** projeções de `servicos/privacidade.js` montam campo a campo; 0 de 66 notificações do fornecedor continham nome/telefone de cliente; fornecedor nunca recebe preço de venda do instalador (vê só `custo_unit`).
- **Separação de papéis:** comercial trocando wallet → `403` (só dono); comercial em `/repasses` e `/credito` → `403`; aprovar vínculo com limite de crédito sem permissão → `403`; técnico criando cliente/proposta e listando clientes → `403`; título para instalador não vinculado → `404`.
- **Dinheiro:** cliente não altera `custo/venda/taxa/split` (campos injetados `valor_centavos/total_centavos/split` ignorados; `custo_unit` é definido pelo servidor pela tabela do instalador); pagar antes de aceitar → `409`; parcelas > 12 → `400`; pagar repetido devolve a **mesma** cobrança (idempotente). Transações `BEGIN IMMEDIATE` com `UPDATE ... WHERE estoque - reservado >= ?` evitam venda além do estoque.
- **Reservas/inadimplência:** instalador com título vencido bloqueado ao enviar proposta → `409 {codigo:"bloqueado"}`; renovação limitada a 1 vez.
- **Uploads:** imagem falsa (bytes de PDF como JPEG) → `400`; path traversal em `/fotos/:foto` e na rota estática → `404`/sem leitura de arquivo.
- **Login/sessão/CSRF/rate-limit/cabeçalhos:** `sair` invalida a sessão no servidor (→ `401`); método ≠ GET sem `x-nexor:1` → `403`; rate limit de token público corta em 40/15min (`429`); JSON malformado → `400`; corpo grande → `413`; cookies `HttpOnly; SameSite=Lax`; cabeçalhos `CSP`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `COOP`, `Referrer-Policy` presentes; `/eu` mostra wallet só mascarada (`••••0001`).
- **Segredos:** nenhum segredo real versionado (`.env.exemplo` vazio; `.gitignore` cobre `.env`/`data`); sem chaves hardcoded no `src/`/`public/`; segredos por conta cifrados (AES-256-GCM); scrypt N=2^17 com fila e 429.
