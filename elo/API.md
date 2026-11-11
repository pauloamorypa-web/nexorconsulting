# Nexor Elo · API (para os agentes de frontend)

Servidor: `npm start` (porta **8796**). Demonstração: `npm run demo` → `http://localhost:8796/demo`.

## Convenções

| Tema | Regra |
|---|---|
| Formato | JSON (`content-type: application/json`). Respostas `200` com o objeto; erros `{ erro: "mensagem em português", codigo?: "..." }`. |
| CSRF | **Todo** método diferente de GET precisa do cabeçalho `x-nexor: 1` (inclusive nas rotas públicas). Sem ele: `403 { erro: "requisição recusada" }`. |
| Sessão | Cookie HttpOnly, SameSite=Lax, um por tipo de conta: `nx_elo_f` (fornecedor), `nx_elo_i` (instalador), `nx_elo_n` (Nexor). Um cookie não abre a área do outro. Use `fetch(..., { credentials: "same-origin" })`. |
| Dinheiro | Sempre **centavos inteiros** (`*_centavos`). Percentuais com até 2 casas em `*_pct` (6.54 = 6,54%). |
| Datas | Dia `AAAA-MM-DD` (horário de Brasília). Instantes (`*_em`, `agendada_para`, `reserva_expira_em`) em **milissegundos UTC**. |
| Erros comuns | `400` validação (mensagem com o nome do campo, ex.: "CNPJ: CNPJ inválido") · `401` sem login · `403` perfil sem permissão / conta suspensa · `404` não existe **ou é de outra conta** · `409` regra de negócio · `413` corpo grande · `422` CNAE incompatível · `429` muitas tentativas (`Retry-After`) · `502/503` provedor externo fora. |
| Corpo | Limite padrão 256 KB (fotos de OS 4 MB, assinatura 1 MB, CSV 2 MB). |
| Listas (paginação) | As listas continuam respondendo um **array**. Aceitam `?limite=` (até o máximo da rota) e `?pagina=` (1, 2, ...). Cabeçalhos: `X-Pagina`, `X-Limite` e, se houver mais itens, `X-Proxima-Pagina`. Sem parâmetros, vem a primeira página no tamanho padrão (500 na maioria; reservas e repasses do fornecedor, 1000). Vale para: fornecedor `/vinculos`, `/propostas`, `/reservas`, `/repasses` (a lista; o `resumo` soma tudo), `/titulos`; instalador `/fornecedores`, `/vinculos`, `/fornecedores/:id/catalogo`, `/titulos`, `/propostas`, `/contratos`. |
| Perfis | Fornecedor: `dono`, `admin`, `comercial`, `financeiro`. Instalador: `dono`, `tecnico`. Nexor: `operador`. |

**Permissões (coluna "Quem")**

| Ação | Papéis |
|---|---|
| F·ver | fornecedor: todos |
| F·configurar / F·equipe / F·auditoria | dono, admin |
| F·wallet | **só dono** |
| F·catalogo / F·vinculos | dono, admin, comercial |
| F·credito / F·financeiro | dono, admin, financeiro |
| I·ver / I·os | instalador: dono e técnico (técnico só vê as OS atribuídas a ele) |
| I·comercial / I·configurar / I·equipe / I·auditoria | instalador: só dono |
| N | operador Nexor |

**Status**
- Proposta: `rascunho → enviada → vista → aceita → paga`; também `expirada` (reserva venceu) e `cancelada`.
- Reserva: `ativa`, `baixada` (estoque saiu no pagamento), `expirada`, `liberada`.
- Vínculo: `pendente`, `aprovado`, `recusado` (+ `bloqueado` manual e bloqueio por título vencido, em `credito`).
- OS: `agendada → a_caminho → em_execucao → concluida` (ou `cancelada`).
- Título: `aberto`, `pago`, `cancelado` (vencido = aberto com `vencimento` < hoje). Origem `manual` ou `sem_wallet`.
- Repasse: destino `fornecedor|instalador|nexor`, via `split|titulo|retido`, status `previsto|recebido|cancelado`.

---

## 1. Contas, login e equipe

`{tipo}` = `fornecedor`, `instalador` ou `nexor`.

| Método | Caminho | Quem | Corpo | Resposta |
|---|---|---|---|---|
| POST | `/api/fornecedor/cadastro` | público | `{ cnpj, razao_social, nome_fantasia?, cnaes: ["8020","4321500"], cidade, uf, prazo_reserva_dias?, email_empresa?, nome, email, senha, telefone? }` | `{ ok, conta, aviso }` + cookie. Conta fica `pendente` até a Nexor aprovar. CNAE de 4 a 7 dígitos: 4 dígitos aceitam o grupo inteiro (prefixo). |
| POST | `/api/instalador/cadastro` | público | `{ cnpj, nome, email, senha, telefone?, nome_fantasia? }` | `{ ok, conta }` + cookie. Razão social, cidade/UF e CNAEs vêm da **consulta de CNPJ** (BrasilAPI, com cache). Erros: `400` CNPJ não encontrado ou situação diferente de ATIVA; `503` consulta fora. |
| GET | `/api/publico/cnpj/:cnpj` | público (20/15 min por IP) | — | `{ cnpj, razao_social, nome_fantasia, situacao, cnaes, cnae_descricao, cidade, uf }` para pré-preencher o cadastro. |
| POST | `/api/{tipo}/entrar` | público | `{ email, senha }` | `{ ok }` + cookie. `401` incorreto · `403` conta suspensa/recusada · `429` (só os erros contam). |
| POST | `/api/{tipo}/sair` | público | — | `{ ok }` |
| GET | `/api/{tipo}/eu` | logado | — | `{ usuario, conta, nao_lidas }`. `conta.config` sem segredos: `wallet: "••••1234"|null`, `focus_token: bool`, `asaas_chave: bool`, `prazo_reserva_dias`, `prazo_titulo_dias`... |
| POST | `/api/{tipo}/eu/senha` | logado | `{ atual, nova }` | `{ ok }` (derruba as outras sessões) |
| GET | `/api/fornecedor/equipe` | F·ver | — | `[usuario]` |
| GET | `/api/instalador/equipe` | I·equipe | — | `[usuario]` |
| POST | `/api/{fornecedor\|instalador}/equipe` | F·equipe / I·equipe | `{ nome, email, senha, papel, telefone? }` (papel ≠ dono) | `usuario` |
| PUT | `/api/{fornecedor\|instalador}/equipe/:id` | F·equipe / I·equipe | `{ nome?, papel?, ativo?, telefone? }` | `usuario` (o dono não pode ser rebaixado; mudar papel/desativar derruba a sessão) |

## 2. Operação Nexor (`/api/nexor/*`, perfil operador)

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/nexor/estado` (público) | — | `{ primeiro_acesso, exige_codigo }` |
| POST | `/api/nexor/primeiro-acesso` (público) | `{ codigo_instalacao, nome, email, senha }` | `{ ok }` + cookie (só quando não há operador) |
| POST | `/api/nexor/operadores` | `{ nome, email, senha }` | `usuario` |
| GET | `/api/nexor/fornecedores?status=` / `/api/nexor/instaladores?status=` | — | `[conta + usuarios]` |
| POST | `/api/nexor/fornecedores/:id/aprovar` · `/recusar` · `/suspender` · `/reativar` | `{ motivo? }` | `conta` (`409` se a transição não vale) |
| POST | `/api/nexor/instaladores/:id/suspender` · `/reativar` | `{ motivo? }` | `conta` |
| GET | `/api/nexor/metricas` | — | contagens agregadas (fornecedores, instaladores, vínculos, propostas por status, total pago, taxa da plataforma, OS abertas). Sem dados de cliente. |
| GET | `/api/nexor/integracoes` | — | `{ asaas: { configurada, url, wallet_nexor (mascarado), token_webhook, webhook }, cnpj, whatsapp, email, taxa_plataforma_bps }` (auditado) |
| PUT | `/api/nexor/integracoes` | `{ asaas_chave?, wallet_nexor?, gerar_token_webhook? }` | `{ ok, token_webhook }` (tudo cifrado) |
| GET | `/api/nexor/auditoria?conta_id=` · `/api/nexor/notificacoes` | — | listas |

## 3. Fornecedor (`/api/fornecedor/*`)

> **Privacidade:** nenhuma rota abaixo devolve dados do cliente final (nome, documento, telefone, e-mail, endereço) nem o preço de venda do instalador. Proposta = `{ id, numero, status, instalador: { id, cnpj, razao_social, nome_fantasia, cidade, uf }, obra: { cidade, uf }, itens: [só os itens dele com preco_unit_centavos = preço que ELE cobra], total_itens_centavos, reserva: { expira_em, renovacoes, status }, enviada_em, vista_em, aceita_em, paga_em, expirada_em, pagamento: { status, forma, pago_em } }`. Coberto por `test/privacidade.test.js`, que varre todas as rotas GET.

| Método | Caminho | Quem | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/conta` | F·ver | — | conta pública |
| PUT | `/conta` | F·configurar | `{ nome_fantasia?, telefone?, email?, cnaes?, cidade?, uf?, prazo_reserva_dias? (1–30), prazo_titulo_dias? (1–120), focus_token? }` | conta pública |
| PUT | `/conta/wallet` | **F·wallet** | `{ wallet_id \| null }` | conta pública (auditado, cifrado) |
| GET | `/painel` | F·ver | — | `{ conta, propostas: {enviada,vista,aceita,paga,expirada}, reservas_ativas, itens_reservados, vinculos_pendentes, instaladores, estoque_baixo, financeiro: {recebido_split_30d_centavos, a_receber_titulos_centavos, titulos_vencidos} \| null (sem permissão), nao_lidas }` |
| GET | `/produtos?busca=&categoria=&inativos=1` | F·ver | — | `[produto + disponivel]` |
| POST | `/produtos` | F·catalogo | `{ codigo, nome, marca?, categoria?, foto_url?, preco_centavos, estoque?, unidade?, prazo_dias?, visibilidade?: "todos"\|"tabelas", tabelas?: [tabela_id], ativo? }` | produto (`409` código repetido) |
| PUT | `/produtos/:id` | F·catalogo | campos parciais | produto (`409` estoque abaixo do reservado, ou desativar com reserva; também quando uma reserva entra enquanto a edição chega: `codigo: "estoque_reservado"`) |
| DELETE | `/produtos/:id` | F·catalogo | — | produto inativo |
| POST | `/produtos/importar` | F·catalogo | `{ csv }` — cabeçalho `codigo;nome;marca;categoria;preco;estoque;unidade;prazo_dias;foto_url` (`;` ou `,`; preço `1.234,56` ou `1234.56`) | `{ criados, atualizados, erros: [{ linha, erro }] }` (cria ou atualiza pelo código) |
| GET | `/tabelas` | F·ver | — | `[{ id, nome, tipo, desconto_pct, precos, ativo, vinculos }]` |
| POST | `/tabelas` | F·catalogo | `{ nome, tipo: "desconto"\|"lista", desconto_pct?, precos?: { produto_id: centavos } }` | tabela |
| PUT / DELETE | `/tabelas/:id` | F·catalogo | parcial / — | tabela (DELETE desativa: vale o preço base) |
| GET | `/vinculos?status=` · `/vinculos/:id` | F·ver | — | `{ id, status, instalador (+cnaes), cnaes_compativeis, tabela, credito: { limite_centavos, em_aberto_centavos (títulos), comprometido_centavos (fornecedor sem walletId: itens em reservas ativas e em propostas aceitas com cobrança aberta), disponivel_centavos (limite − em aberto − comprometido), vencidos, vencidos_centavos, bloqueio_manual, bloqueio_inadimplencia, bloqueado, motivo }, score, ... }` |
| POST | `/vinculos/:id/aprovar` | F·vinculos | `{ tabela_id?, limite_credito_centavos? (exige F·credito) }` | vínculo |
| POST | `/vinculos/:id/recusar` | F·vinculos | `{ motivo? }` | vínculo (`409` se houver reserva ativa: use bloquear) |
| PUT | `/vinculos/:id/tabela` | F·vinculos | `{ tabela_id \| null }` | vínculo |
| PUT | `/vinculos/:id/credito` | F·credito | `{ limite_credito_centavos }` | vínculo |
| POST | `/vinculos/:id/bloquear` · `/desbloquear` | F·credito | `{ motivo? }` | vínculo |
| GET | `/instaladores/:id/score` | F·ver | — | `{ instalador, score (0–100), conversao: { enviadas, pagas, taxa_pct, com_voce }, pagamentos: { titulos_pagos, em_dia, vencidos_abertos, pontualidade_pct }, volume_90d: { centavos, propostas_pagas } }` |
| GET | `/propostas?status=` · `/propostas/:id` | F·ver | — | projeção (ver acima) |
| GET | `/reservas?status=ativa` | F·ver | — | `[{ id, status, quantidade, expira_em, produto, proposta: { id, numero, status, obra }, instalador }]` |
| GET | `/repasses` | F·financeiro | — | `{ resumo: { recebido_split_centavos, previsto_split_centavos, a_receber_titulos_centavos }, repasses: [...] }` |
| GET | `/titulos?status=&instalador_id=&vencidos=1` | F·financeiro | — | `[título + vencido + instalador + proposta]` |
| POST | `/titulos` | F·financeiro | `{ instalador_id, descricao, valor_centavos, vencimento }` | título (compra a prazo fora do split) |
| POST | `/titulos/:id/baixar` · `/cancelar` | F·financeiro | — | título (`pago_no_prazo` alimenta o score) |
| POST | `/propostas/:id/nfe` | F·financeiro | — | nota (NF-e do fornecedor **para o instalador**; só com proposta paga; idempotente). Sem token Focus: simulada fora de produção, `409` em produção. |
| GET | `/notas` | F·financeiro | — | `[nota]` |
| GET | `/notificacoes` · POST `/notificacoes/lidas` `{ ids? }` | F·ver | — | lista · `{ ok }` |
| GET | `/auditoria` | F·auditoria | — | `[{ acao, autor, detalhe, ip, criado_em }]` |

## 4. Instalador (`/api/instalador/*`)

| Método | Caminho | Quem | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/conta` | I·ver | — | conta pública |
| PUT | `/conta` | I·configurar | `{ nome_fantasia?, telefone?, email?, cidade?, uf?, wallet_id?, focus_token?, asaas_chave?, inscricao_municipal?, codigo_municipio?, item_lista_servico?, aliquota_iss_pct? }` | conta pública + `webhook_contratos: { url, token } \| null` (para colar no Asaas do instalador) |
| GET | `/painel` | I·ver | — | dono: propostas por status, vendido/recebido 30d, reservas vencendo, OS abertas, títulos, contratos, `wallet` (bool). Técnico: `{ os_hoje, os_abertas }` |
| GET | `/fornecedores` | I·comercial | — | fornecedores ativos `{ id, razao_social, cidade, uf, cnaes_aceitos, compativel, prazo_reserva_dias, vinculo: {id,status}\|null }` |
| GET | `/vinculos` | I·comercial | — | `[{ id, status, motivo, fornecedor, tabela, credito: { limite_centavos, disponivel_centavos, em_aberto_centavos, comprometido_centavos, bloqueado, motivo } }]` |
| POST | `/vinculos` | I·comercial | `{ fornecedor_id }` | vínculo pendente. `422 { codigo: "cnae" }` se nenhum CNAE do instalador estiver na lista do fornecedor. |
| GET | `/fornecedores/:id/catalogo?busca=&categoria=` | I·comercial | — | `[{ id, fornecedor_id, fornecedor, codigo, nome, marca, categoria, foto_url, unidade, preco_centavos (da tabela do instalador), preco_base_centavos, disponivel, prazo_dias }]` (`403` sem vínculo aprovado) |
| GET | `/comparar?codigo=\|termo=&quantidade=` | I·comercial | — | ofertas de todos os fornecedores vinculados, a melhor primeiro (`atende_quantidade`, `melhor`, `total_centavos`) |
| POST | `/comparar` | I·comercial | `{ itens: [{ codigo?, termo?, quantidade }] }` (cada item com `codigo` ou `termo` de 2+ letras; senão `400`) | `{ itens: [{ pedido, melhor, alternativas }], total_centavos, fornecedores, faltando }` (combinação mais barata; pode dividir entre fornecedores) |
| GET | `/titulos` | I·comercial | — | títulos do instalador com cada fornecedor |
| GET | `/kits` | I·comercial | — | modelos (`id: "modelo:cftv-4"`, `modelo: true`) + kits próprios |
| POST / PUT / DELETE | `/kits` · `/kits/:id` | I·comercial | `{ nome, segmento?, descricao?, itens: [{ codigo? \| termo?, quantidade, descricao? }] }` | kit |
| POST | `/kits/:id/aplicar` | I·comercial | `{ proposta_id?, multiplicar? }` | `{ kit, itens: [item pronto para a proposta], faltando }`; com `proposta_id` (rascunho) já inclui os itens |
| GET / POST | `/clientes?busca=` · `/clientes` | I·comercial | `{ nome, documento? (CPF/CNPJ), telefone?, email?, endereco?: { logradouro, numero, complemento, bairro, cidade, uf, cep } }` | cliente (dados que **nunca** saem para o fornecedor) |
| GET / PUT | `/clientes/:id` | I·comercial | parcial | cliente |
| GET | `/propostas?status=` | I·comercial | — | `[proposta + cliente (nome)]` |
| POST | `/propostas` | I·comercial | `{ cliente_id?, titulo, validade_dia?, condicoes?, garantia?, observacoes?, desconto_centavos?, itens?: [item] }` | proposta completa |
| GET | `/propostas/:id` | I·comercial | — | `{ ...proposta, link, cliente, itens (+fornecedor), margem_estimada_centavos, reservas, pagamentos, repasses, notas, aceite: { nome, documento, ip, em } }` |
| PUT | `/propostas/:id` | I·comercial | parcial; `itens` substitui a lista | proposta (`409` se não for rascunho) |
| POST | `/propostas/:id/enviar` | I·comercial | `{ avisar_cliente? }` (manda o link por WhatsApp/e-mail ao cliente) | proposta com `link`. Reserva o estoque de todos os itens por N dias (o menor prazo entre os fornecedores). `409` com `codigo`: `bloqueado` (bloqueio manual ou título vencido), `estoque` (falta; nada fica reservado), `credito` (fornecedor sem walletId e limite insuficiente). `400` se o total não cobre custos + taxa. |
| POST | `/propostas/:id/renovar` | I·comercial | — | proposta (uma vez; se expirada, reserva de novo). `409` na segunda. |
| POST | `/propostas/:id/reabrir` | I·comercial | — | volta a rascunho, libera reservas, invalida o link |
| POST | `/propostas/:id/cancelar` · `/duplicar` | I·comercial | — | proposta |
| POST | `/propostas/:id/nfse` | I·comercial | — | nota NFS-e (serviços da proposta paga, tomador = cliente). O desconto da proposta é rateado entre os itens pelo valor; a parte dos serviços vai em `desconto_incondicionado` (e `base_calculo` = serviços − desconto). Simulada sem token fora de produção. |
| POST | `/calculadora` | I·comercial | `{ custos: { produtos_centavos?, mao_obra_centavos?, deslocamento_centavos?, outros_centavos? }, margem_pct (0–90), regime: { tipo: "mei" } \| { tipo: "simples", anexo: "I".."V", aliquota_pct? \| rbt12_centavos? } \| { tipo: "presumido" }, iss_pct?, taxa_meio_pct?, taxa_meio_fixa_centavos?, preco_centavos? (simular um preço) }` | `{ preco_sugerido_centavos, custos_centavos, custos, impostos: { total_centavos, aliquota_efetiva_pct, detalhamento: [{ nome, aliquota_pct, centavos }] }, taxa_meio_centavos, taxa_plataforma_centavos, taxa_plataforma_pct, lucro_liquido_centavos, margem_real_pct, markup, avisos }` · Simples com `rbt12_centavos` (receita bruta dos últimos 12 meses): alíquota efetiva = (RBT12 × nominal − parcela a deduzir) / RBT12 pela faixa do anexo, e `impostos.simples: { anexo, faixa, nominal_pct, aliquota_pct }`; sem RBT12 vale `aliquota_pct` (à mão). `400` se margem+taxas ≥ 99%, sem alíquota nem RBT12, ou RBT12 acima de R$ 4,8 milhões |
| GET | `/os?status=` | I·os | — | OS (técnico: só as dele) |
| POST | `/os` | I·comercial | `{ proposta_id? (paga), cliente_id? (avulsa), tecnico_id?, titulo?, descricao?, agendada_dia?, agendada_hora?, checklist?: [texto] }` | OS (da proposta: checklist e números de série pré-preenchidos) |
| GET | `/os/:id` | I·os | — | `{ id, numero, titulo, status, agendada_para, checklist: [{item, feito}], series: [{produto, codigo, serie, garantia_meses, garantia_ate}], fotos: [{id, legenda}], assinado, historico, tecnico, cliente, link }` |
| PUT | `/os/:id` | I·comercial | `{ tecnico_id?, titulo?, descricao?, agendada_dia?, agendada_hora? }` | OS |
| POST | `/os/:id/status` | I·os | `{ status, nota? }` | OS (técnico não cancela; encerrada → `409`) |
| PUT | `/os/:id/checklist` | I·os | `{ checklist: [{ item, feito }] }` | OS |
| PUT | `/os/:id/series` | I·os | `{ series: [{ produto, codigo?, serie?, garantia_meses? }] }` | OS (calcula `garantia_ate`) |
| POST | `/os/:id/fotos` | I·os | `{ imagem: "data:image/jpeg;base64,...", legenda? }` (JPEG/PNG/WebP, até 600 KB, 30 por OS; bytes conferidos) | OS · `413` grande · `400` não é imagem |
| GET | `/os/:id/fotos/:foto` · `/os/:id/assinatura` | I·os | — | a imagem |
| POST | `/os/:id/assinatura` | I·os | `{ imagem (base64, até 200 KB), nome }` | OS. `400 { codigo: "assinatura_vazia" }` se o PNG estiver quase em branco (um toque só); `409` se já assinada. |
| GET / POST | `/contratos` | I·comercial | `{ cliente_id, descricao, valor_centavos (≥ 500), dia_vencimento (1–28), inicio? }` | contrato (assinatura mensal no Asaas **do instalador**, sem split; `409` sem chave Asaas; `400` cliente sem documento) |
| POST | `/contratos/:id/cancelar` | I·comercial | — | contrato |
| GET | `/notificacoes` · POST `/notificacoes/lidas` · GET `/envios` · GET `/auditoria` | I·comercial / I·auditoria | — | listas |

**Item de proposta** (`itens[]`):
- `{ tipo: "fornecedor", produto_id, quantidade, preco_unit_centavos (venda ao cliente), descricao? }` → o servidor preenche fornecedor, código, unidade, foto e `custo_unit_centavos` (preço da tabela do instalador). `403` se o produto não estiver visível para ele.
- `{ tipo: "proprio", descricao, codigo?, unidade?, quantidade, custo_unit_centavos?, preco_unit_centavos }`
- `{ tipo: "servico", descricao, unidade?, quantidade, custo_unit_centavos?, preco_unit_centavos }` (mão de obra, deslocamento)

Totais: `subtotal = Σ quantidade × preço`, `total = subtotal − desconto`, `taxa_plataforma = total × TAXA_PLATAFORMA_BPS`.

## 5. Público (sem login)

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/p/:token` · `/os/:token` | — | página (`index.html`) com `Referrer-Policy: no-referrer` e `noindex` |
| GET | `/api/publico/propostas/:token` | — | `{ numero, titulo, status, empresa: { nome, cnpj, cidade, uf, telefone }, cliente: { nome, documento (mascarado), endereco_obra: { cidade, uf, bairro } }, itens: [{ tipo: "produto"\|"servico", descricao, unidade, foto_url, quantidade, preco_unit_centavos, total_centavos }], subtotal_centavos, desconto_centavos, total_centavos, validade_dia, condicoes, garantia, observacoes, reserva_expira_em, aceite, pagamento: { status, forma, parcelas, link, pago_em }, pode_aceitar, pode_pagar, formas }`. Sem custo nem fornecedor. A primeira abertura marca `vista` e avisa instalador e fornecedores. |
| POST | `/api/publico/propostas/:token/aceitar` | `{ nome, documento?, concordo: true }` | proposta pública (registra nome, data e IP). `409` expirada/fora da validade/já aceita. |
| POST | `/api/publico/propostas/:token/pagar` | `{ forma: "PIX"\|"BOLETO"\|"CREDIT_CARD", parcelas? (cartão 1–12), documento? (se o cliente não tem), email? }` | `{ link, forma, parcelas, valor_centavos, status }` (link de pagamento do Asaas; repetir devolve a mesma cobrança). `409` sem aceite, reserva vencida ou instalador sem walletId. `503 { codigo: "wallet_ilegivel" }` se um walletId cadastrado não puder ser decifrado (o operador Nexor é avisado; nada é cobrado). |
| GET | `/api/publico/os/:token` | — | `{ numero, titulo, status, agendada_para, checklist, series, fotos, assinado, historico: [{ status, nota, em }], tecnico (primeiro nome), empresa, cliente (primeiro nome) }` |
| GET | `/api/publico/os/:token/fotos/:foto` | — | imagem |

Token errado conta como tentativa (40 por 15 min por IP → `429`).

## 6. Webhooks e pagamento

- `POST /webhook/asaas` — conta Asaas da **plataforma**. Cabeçalho `asaas-access-token` = token gerado e guardado cifrado (ver `GET /api/nexor/integracoes`). Eventos `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`: proposta → `paga`, reservas → `baixada` (estoque sai), repasses → `recebido`, títulos para fornecedores sem walletId, notificações. Idempotente.
- `POST /webhook/asaas/instalador/:conta_id` — conta Asaas do **instalador** (contratos recorrentes), token próprio (`webhook_contratos` no `PUT /api/instalador/conta`).
- **Split** da cobrança: cada fornecedor com walletId recebe `fixedValue` = soma do custo dos itens dele; a Nexor retém a taxa da plataforma (a cobrança é da conta da plataforma); o instalador recebe `total − fornecedores com wallet − taxa`. Fornecedor sem walletId: a parte dele fica com o instalador e vira **título** a receber (vencimento = `prazo_titulo_dias`).

## 7. Modo Demonstração (só com `DEMO=1`; sem ele tudo abaixo responde 404)

| Método | Caminho | Resposta |
|---|---|---|
| GET | `/demo` | página para escolher o papel |
| GET | `/demo/entrar?papel=` | `302` para o painel com a sessão do papel: `fornecedor_dono`, `fornecedor_comercial`, `fornecedor_financeiro`, `fornecedor2_dono`, `instalador_dono`, `instalador_tecnico`, `nexor`, `cliente` (vai para `/p/:token` de uma proposta aberta) |
| GET | `/api/demo` | `{ demo: true, sistema: "elo", nome, empresa, papeis: [{ papel, tipo, nome, descricao, url }], ia }` (faixa "Demonstração · dados fictícios") |
| GET | `/api/demo/mensagens` | últimas 50 saídas simuladas (WhatsApp, e-mail, Asaas) |
| POST | `/api/demo/reiniciar` | `{ ok: true }` volta ao retrato original |
| POST | `/api/demo/pagar` | `{ proposta_id? }` simula o Asaas confirmando a cobrança em aberto (baixa ao vivo) |

Senha de todos os usuários da demonstração: `demo-elo-2026`.

## Rotas acrescentadas na integração das telas
| Método | Caminho | Quem | Resposta |
|---|---|---|---|
| GET | `/api/publico/os/:token/assinatura` | público (token da OS) | imagem da assinatura do cliente (404 se ainda não assinou) |
| GET | `/api/instalador/notas` | instalador (dono, comercial) | todas as notas fiscais da conta, da mais nova para a mais antiga (até 300) |
| GET | `/api/publico/cnpj/:cnpj` | público | agora inclui `fornecedores_compativeis` (número) e `compativel` (sim/não), sem nomes de fornecedores |
| POST | `/api/demo/pagar` | só com `DEMO=1` | aceita `{ token }` da proposta para pagar exatamente aquela proposta |
