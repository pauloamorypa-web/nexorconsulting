# Nexor Contábil · Modo Demonstração

Roda o sistema **de verdade** no notebook do vendedor, com dados fictícios do **Escritório Exemplo Contabilidade**, sem internet e sem risco. Nenhuma mensagem, cobrança ou e-mail sai do computador.

## Como rodar

```bash
cd contabil
npm install        # só na primeira vez
npm run demo       # = DEMO=1 DEMO_RESET=1 node src/servidor.js (sempre começa com os dados originais)
```

Abra **http://127.0.0.1:8793/demo/entrar?papel=dono**.

| Variável | Para quê |
| --- | --- |
| `DEMO=1` | Liga o modo. Sem ela nada muda: `/demo/*` e `/api/demo*` respondem 404. |
| `DEMO_RESET=1` | Apaga a pasta de dados e semeia de novo na subida (só apaga pasta marcada como de demonstração). |
| `PORT` | Porta (padrão 8793). |
| `DATA_DIR` | Pasta dos dados (padrão `./data-demo`). |
| `DEMO_PAGAMENTO_SEGUNDOS` | Em quantos segundos o Pix "cai" sozinho depois da cobrança (padrão 8; 0 desliga). |
| `DEMO_IA_REAL=1` | Usa a IA real da Anthropic (precisa de `ANTHROPIC_API_KEY`); libera só `api.anthropic.com`. |
| `DEMO_PUBLICO=1` | Escuta em todas as interfaces (versão online futura, atrás do Cloudflare Access). Sem ela, só `127.0.0.1`. |

Segurança: só escuta em 127.0.0.1; `fetch` fica travado para qualquer host que não seja localhost; WhatsApp (Meta), e-mail (Resend) e Asaas passam por simuladores locais; a licença aparece como **Demonstração** (tudo liberado, sem a Central Nexor); a chave mestra é fixa e só vale com `DEMO=1`.

## Papéis

| Papel | Quem | Entrar | Login manual |
| --- | --- | --- | --- |
| `dono` | Marina Couto, contadora dona | `/demo/entrar?papel=dono` | marina@escritorioexemplo.demo |
| `colaborador` | Rafael Lima, fiscal (perfil equipe, sem configurações) | `/demo/entrar?papel=colaborador` | rafael@escritorioexemplo.demo |
| `cliente` | Juliana Prado, Padaria Pão Dourado (portal) | `/demo/entrar?papel=cliente` | juliana@paodourado.demo (em `/portal/`) |

Senha de todos: `demo1234`. A faixa laranja no topo troca de papel e tem o botão **Reiniciar demonstração**.

## O que já vem pronto

- 12 empresas na carteira (Simples, Presumido, Real e MEI), CNPJs fictícios válidos, WhatsApp 34 99999-00xx.
- Mês que está fechando (o anterior a hoje) + dois meses de histórico, tudo com datas relativas a hoje.
- Obrigações vencendo hoje e na semana, duas atrasadas e muitas entregues.
- ~125 documentos lidos pela IA (extratos, notas, comprovantes, folha), lançamentos sugeridos/aprovados/exportados, 12 na fila de conferência, dois com alerta (CNPJ de outra empresa, foto com baixa confiança) e um sem cliente.
- Régua de cobrança já rodando (5 clientes devendo documento), guias no portal, chamados e conversas do WhatsApp.
- **Honorários** (menu só na demonstração): em dia, a vencer, 4 atrasados e um pago ontem pelo Asaas.

## Rotas da demonstração

- `GET /api/demo`: `{ demo, sistema, nome, empresa, papeis: [{papel, nome, descricao, url}], ia }`
- `GET /demo/entrar?papel=dono|colaborador|cliente`
- `POST /api/demo/reiniciar` (cabeçalho `x-nexor: 1` ou JSON): volta ao original; quem reiniciou continua logado.
- `GET /api/demo/mensagens`: últimas 50 mensagens "enviadas" (WhatsApp, e-mail, Asaas).
- `POST /api/demo/receber` `{ "de": "34999990002", "texto": "..." }` ou `{ "de": "...", "arquivo": "extrato" | "nota" | "boleto" | "recibo" | "guia", "nome": "opcional.pdf" }`: simula a mensagem chegando pelo webhook do WhatsApp e devolve as respostas da IA, a leitura do documento e o chamado aberto.
- `POST /api/demo/pagar/:id` (id do honorário ou da cobrança `pay_demo…`): pagamento recebido na hora.
- `GET /demo/pagamento/:id`: tela de pagamento fictícia (Pix) do Asaas.

Exemplo (em outro terminal, durante a apresentação):

```bash
curl -s -X POST http://127.0.0.1:8793/api/demo/receber -H 'content-type: application/json' \
  -d '{"de":"34999990002","texto":"Oi, o que ainda falta eu mandar?"}'
curl -s -X POST http://127.0.0.1:8793/api/demo/receber -H 'content-type: application/json' \
  -d '{"de":"34999990002","arquivo":"extrato"}'
```

Telefones úteis: 34999990001 Padaria · 34999990002 Mercadinho · 34999990003 Oficina · 34999990009 Restaurante.

## Roteiro de apresentação (10 minutos)

**Antes:** `npm run demo`, abra o painel como dono, deixe um terminal pronto com os dois `curl` acima e uma segunda aba no portal (`papel=cliente`).

1. **A dor (1 min).** "Quanto tempo a sua equipe passa cobrando extrato e nota por WhatsApp, um cliente de cada vez?" Mostre o **Início**: documentos a conferir, % do mês recebido, obrigações de hoje e atrasadas, clientes que mais devem. "Isso aqui é a manhã do escritório num relance."
2. **Cobrança sem ninguém cobrar (1,5 min).** Abra **Cobrança de documentos**: o Mercadinho e o Restaurante ainda devem. Mostre a régua ligada e o histórico de lembretes; clique **Cobrar agora**. "A mensagem sai do número do escritório, com a lista certa e o link do portal."
3. **O uau: o cliente responde e a IA trabalha (2,5 min).** Rode o primeiro `curl` ("o que falta?"): a IA responde com os documentos reais do cliente. Rode o segundo (manda o extrato): em segundos ele aparece em **Documentos**, lido, classificado como extrato, com os movimentos, a pendência do mês marcada como recebida e os lançamentos sugeridos em **Lançamentos**. Mostre o documento com alerta de CNPJ: "a IA sugere, o contador confere".
4. **A IA sabe a hora de chamar o contador (1 min).** `curl` com `"de":"34999990009","texto":"Posso mudar para o lucro presumido para pagar menos imposto?"`: ela não dá opinião tributária, abre o chamado no fiscal. Mostre em **Chamados**.
5. **Obrigações e prazos (1 min).** **Obrigações**: DAS, FGTS, eSocial, EFD por cliente e departamento, com feriado já ajustado; as duas atrasadas em vermelho. "Ninguém mais perde prazo por planilha."
6. **Honorários com baixa automática (1,5 min).** Menu **Honorários**: atrasados em vermelho, um pago ontem pelo Asaas. Clique **Cobrar pelo Asaas** no Restaurante: o link do Pix vai pelo WhatsApp e, em ~8 segundos, o pagamento "cai" e a baixa aparece sozinha, com o agradecimento enviado. "Inadimplência de honorário cai no primeiro mês."
7. **O portal do cliente (1 min).** Na aba do portal (Juliana, Padaria): o que falta enviar, guias para baixar, chamados e o honorário com **Pagar com Pix** (abre a tela do Asaas fictício; a baixa é automática).
8. **Equipe e fechamento (30 s).** Troque para **Colaborador** na faixa: mesmo dia a dia, sem configurações. Feche: "Tudo isso com o número de WhatsApp e a marca do seu escritório." Clique **Reiniciar demonstração** para o próximo cliente.
