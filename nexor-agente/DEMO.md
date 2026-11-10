# Nexor Agente: Modo Demonstração

Mostre ao cliente o agente **de verdade** funcionando, no seu notebook, com dados fictícios, sem internet e sem risco.

## Como rodar

```bash
cd nexor-agente
npm ci
npm run demo          # = DEMO=1 DEMO_RESET=1 node src/servidor.js
```

Abra **http://127.0.0.1:8792/demo/entrar?papel=dono**.

| Variável | Para quê |
|---|---|
| `DEMO=1` | Liga o modo (sem ela, nenhuma rota de demonstração existe: 404) |
| `DEMO_RESET=1` | Apaga `./data-demo` e semeia de novo na subida (o `npm run demo` já faz isso) |
| `PORT` | Porta (padrão **8792** em demonstração) |
| `DATA_DIR` | Pasta de dados (padrão `./data-demo`) |
| `DEMO_IA_REAL=1` | Usa o Claude de verdade (precisa de `ANTHROPIC_API_KEY`; só `api.anthropic.com` é liberado) |
| `DEMO_ATRASO_MS` | Tempo de "digitando" da IA roteirizada (padrão 350 ms) |
| `DEMO_PUBLICO=1` | Escuta em todas as interfaces (versão online, atrás do Cloudflare Access). Sem ela, só `127.0.0.1` |

### Segurança
- Só escuta em `127.0.0.1`. Toda saída de rede (WhatsApp da Meta, ERP, e-mail, planilha, Central Nexor) vai para um **simulador local**. Além disso, `fetch` fica travado para qualquer host externo.
- Licença aparece como **"Demonstração"**: tudo liberado, sem prazo, sem falar com a Central.
- Empresa, pessoas, CNPJs e telefones (99999-xxxx) são todos fictícios.

## Papéis (logins)

| Papel | Link | Quem é |
|---|---|---|
| `dono` | `/demo/entrar?papel=dono` | **Ricardo Moura**, dono da Distribuidora Vale Verde. Já tem 3 aprovações pendentes e a conversa de ontem |
| `socia` | `/demo/entrar?papel=socia` | **Fernanda Moura**, sócia. Também dá ordens à Luna, com fila de aprovações própria (começa vazia) |

## A empresa fictícia

**Distribuidora Vale Verde** (bebidas e mercearia, Uberlândia/MG). A agente se chama **Luna**. Os dados acompanham o dia de hoje: 90 dias de pedidos (fechada aos domingos), 22 clientes, 3 vendedores com metas do mês, 12 produtos (3 abaixo do estoque mínimo), 7 boletos vencidos de 6 clientes (R$ 13.106,40) e 5 e-mails.

Conectores simulados: **ERP** (vendas, pedidos, estoque, clientes, contas a receber), **Planilha** (metas), **E-mail** e **WhatsApp Business** da empresa.

## Rotas de demonstração

- `GET /api/demo`: `{ demo, sistema, papeis, ia }`
- `GET /demo/entrar?papel=dono|socia`: entra e abre o painel
- `POST /api/demo/reiniciar`: volta tudo ao original
- `GET /api/demo/mensagens`: últimas 50 mensagens "enviadas" (WhatsApp e e-mail)
- `POST /api/demo/receber {de, texto}`: simula uma mensagem do dono chegando pelo webhook do WhatsApp (`de` padrão: o número do Ricardo). `texto: "aprovar:A1B2C3"` simula o toque no botão Aprovar.

```bash
curl -s -X POST localhost:8792/api/demo/receber -H 'Content-Type: application/json' -d '{"texto":"quanto vendemos ontem?"}'
```

## Frases que a IA roteirizada entende

"quanto vendemos ontem / hoje / na semana / no mês?" · "manda a cobrança para os clientes atrasados" · "quem está atrasado?" (e depois "sim") · "como estamos na meta do mês?" · "quais produtos estão com estoque baixo?" (e depois "sim" para o pedido de compra) · "tem e-mail importante?" · "cria um pedido de 30 fardos de refrigerante cola para o Mercado Bom Preço" · "seu nome agora é Bia" · "lembra que o Bar do Zé só recebe depois das 14h" · "sempre me mande…" · "oi". O resto recebe uma resposta educada com o menu.

---

## Roteiro de apresentação (10 minutos)

**Antes:** rode `npm run demo`, abra o link do dono em tela cheia. Se quiser repetir, use **Reiniciar demonstração** na faixa do topo.

### 1. A dor (1 min)
> "Quantas vezes por dia você para o que está fazendo para abrir o ERP, puxar relatório, conferir quem está devendo, mandar mensagem de cobrança um por um? E quando está na rua, fica sem saber."

Mostre a tela: **"Esta é a Luna. Ela trabalha no WhatsApp do dono e tem acesso aos sistemas da empresa: ERP, planilha, e-mail e o WhatsApp dos clientes."**

### 2. Pergunta simples, resposta na hora (1,5 min)
Clique em **"Quanto vendemos ontem?"**.
> "Ela não inventa: consultou o ERP agora. Faturamento, número de pedidos, ticket médio, comparação com a semana passada, os mais vendidos e o maior cliente. Em 2 segundos, pelo WhatsApp."

Mostre em **Tarefas executadas** que a consulta ficou registrada.

### 3. O "uau": cobrança com um toque (3 min)
Clique em **"Manda a cobrança para os clientes atrasados"**.
> "Ela achou 6 clientes, 7 boletos, R$ 13 mil parados. Escreveu uma mensagem educada para cada um, com o link do boleto. **Mas não mandou nada ainda.**"

Aponte o cartão **🔐 Pedido … precisa da sua aprovação** (aparece na conversa e em Aprovações pendentes).
> "Tudo que altera alguma coisa, como mandar mensagem, criar pedido ou mudar cadastro, só acontece depois que você aprova. No WhatsApp aparecem os botões Aprovar e Recusar."

Clique em **✅ Aprovar**. Mostre o quadro **WhatsApp simulado → Mensagens enviadas**: as 6 cobranças, cada uma com o nome do cliente e o boleto.
> "Isso que levava a manhã da sua financeira levou 10 segundos, e com o seu controle."

### 4. Pelo WhatsApp, de qualquer lugar (1,5 min)
No quadro **WhatsApp simulado**, digite "como estamos na meta do mês?" e clique em **Receber**.
> "É como se você mandasse do celular, no meio da rua. Olha: o Júlio vai bater a meta, a Camila e o Rogério precisam acelerar. Ela leu a planilha de metas."

### 5. Fila de aprovações e controle (1,5 min)
Mostre as **Aprovações pendentes** que já estavam lá (pedido de compra de água, limite de crédito, tabela de preços por e-mail).
> "A Luna prepara, você decide. Pedido expira sozinho, vale uma vez só e só quem pediu aprova. Tudo fica auditado."

Aprove o **pedido de compra à Fonte Serra Azul** (ela confirma a OC) e **recuse** o e-mail da tabela (ela confirma que não fez nada).

### 6. Personalização (1 min)
Digite **"seu nome agora é Bia"** e depois **"lembra que o Bar do Zé só recebe depois das 14h"**.
> "Você personaliza conversando: nome, jeito de falar, regras permanentes, memórias. Sem tela de configuração."

### 7. Fechamento (30 s)
> "Roda no servidor da sua empresa, conecta em qualquer sistema com API, e nada é executado sem o seu OK. Quais tarefas do seu dia você gostaria de entregar para ela primeiro?"

**Dica:** com `DEMO_IA_REAL=1` e chave da Anthropic, ela entende qualquer pedido livre (precisa de internet).
