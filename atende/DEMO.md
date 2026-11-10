# Nexor Atende IA · Modo Demonstração

O sistema real funcionando no seu notebook, com dados fictícios da **Clínica Sorriso** (clínica odontológica inventada), **sem internet e sem risco**: nenhuma mensagem vai para o WhatsApp de verdade, nenhuma chamada sai para a Meta, a Anthropic ou a Nexor Central.

## Como rodar

```bash
cd atende
npm install        # só na primeira vez
npm run demo       # = DEMO=1 DEMO_RESET=1 node src/servidor.js
```

Abra **http://localhost:8790/demo/entrar?papel=dono**. Em `http://localhost:8790` a faixa do topo também tem os botões "Entrar como".

- `npm run demo` sempre começa do zero (`DEMO_RESET=1` apaga `./data-demo` e semeia de novo). Para manter o que foi feito entre uma execução e outra: `DEMO=1 node src/servidor.js`.
- Outra porta: `PORT=9000 npm run demo`.
- O servidor só escuta em `127.0.0.1`: ninguém da rede acessa o notebook. (`DEMO_PUBLICO=1` libera, mas só para a futura versão online atrás do Cloudflare Access.)
- IA de verdade (opcional, precisa de internet): `DEMO_IA_REAL=1 ANTHROPIC_API_KEY=... npm run demo`. Só `api.anthropic.com` é liberado; o resto continua bloqueado.

## Papéis

| Papel | Pessoa fictícia | O que vê | Entrar |
|---|---|---|---|
| Dono | Helena Prado (dentista, dona) | Tudo: painel de resultados, conversas, contatos e funil, Cérebro da IA, agenda, campanhas, configurações | `/demo/entrar?papel=dono` |
| Admin | Rafael Couto (gerente) | Igual ao dono, exceto remover o número do WhatsApp | `/demo/entrar?papel=admin` |
| Atendente | Juliana Reis (recepção) | Fila de atendimento, conversas, contatos, agenda e campanhas (sem configurações) | `/demo/entrar?papel=atendente` |

Se precisar do login pela tela normal: `helena@clinicasorriso.demo`, `rafael@clinicasorriso.demo` ou `juliana@clinicasorriso.demo`, senha `demo1234`.

## O que já vem pronto (datas relativas a hoje)

- **Conversas de hoje:** a IA atendeu o Carlos (preço da limpeza e agendamento para amanhã às 9h), a Fernanda (clareamento, lead quente 82), o Gabriel (horário de sábado) e a Luana (respondeu à campanha e recebeu horários de sábado). A Juliana está atendendo o Marcos (convênio Amil).
- **Fila "Aguardando você":** Roberto (dor com inchaço, **prioridade alta**), Patrícia (quer parcelar o implante de R$ 3.200) e Tatiane (quer falar com a Dra. Helena). Cada uma chegou com o resumo pronto, feito pela IA.
- **Contatos:** 64 pacientes com etiquetas (limpeza, clareamento, ortodontia, implante, convênio, indicação, VIP…), etapas do funil, temperatura e valor estimado.
- **Campanha:** "Clareamento de Novembro" concluída (enviada, entregue, lida e respondida, com falhas de verdade) e um rascunho "Retorno semestral · dezembro". Três modelos aprovados pela Meta.
- **Painel:** cerca de 75 dias de histórico: respostas pela IA, resolvidas pela IA, tempo da 1ª resposta, horas economizadas, funil, sentimento e assuntos.
- **Agenda:** o dia de hoje e o de amanhã cheios, com horários livres para a IA agendar ao vivo.
- **Cérebro da IA:** base de conhecimento (preços, horários, convênios, pagamento, urgência), correções da equipe e respostas rápidas.

## O "uau": cliente chegando ao vivo

Na faixa do topo, clique em **💬 Cliente chegando** e escolha uma frase (ou digite qualquer coisa). A mensagem entra **pelo mesmo caminho do webhook da Meta** e a Lia (a IA) responde no painel em 2 a 3 segundos. Quando a IA manda botões, eles aparecem no painel do simulador: toque como se fosse o cliente.

Roteiros que a IA roteirizada conhece:

| O cliente escreve | A IA faz |
|---|---|
| "Oi, quanto custa uma limpeza?" (ou clareamento, aparelho, implante…) | Consulta a base, responde o preço e manda botões **Ver horários / Tirar outra dúvida**. Etiqueta o contato e avança o funil. |
| "Ver horários" / "Quero agendar…" | Consulta a agenda real e manda 3 horários livres como botões. |
| Toque num horário | **Agenda de verdade** (aparece na Agenda e no Início), confirma com endereço e registra a nota "Agendado pela IA". |
| "Estou com muita dor no dente e inchou" | Acolhe e **transfere para a equipe com prioridade alta**. A conversa vai para a fila e o painel avisa. |
| "Quero falar com uma pessoa" | Transfere com o resumo da conversa. |
| "Vocês atendem Amil Dental?" | Responde os convênios aceitos. |
| "Obrigada!" | Despede-se e encerra o atendimento. |
| Qualquer outra coisa | Resposta educada oferecendo ajuda. |

O campo "De:" aceita o nome de um contato da demo (ex.: `Fernanda`) para a mensagem cair numa conversa que já existe.

Também dá para disparar pela linha de comando (útil com o projetor):

```bash
curl -X POST http://localhost:8790/api/demo/receber -H "x-nexor: 1" -H "Content-Type: application/json" \
  -d '{"de":"5534999997001","nome":"Mariana Alves","texto":"Oi, quanto custa uma limpeza?"}'
```

## Rotas da demonstração (só existem com `DEMO=1`; sem ele respondem 404)

| Rota | O que faz |
|---|---|
| `GET /demo/entrar?papel=dono\|admin\|atendente` | Entra como aquele usuário e abre o painel |
| `GET /api/demo` | `{ demo, sistema, nome, empresa, papeis: [{papel, nome, descricao, url}], ia }` |
| `POST /api/demo/reiniciar` | Volta tudo ao estado original (`{ ok: true }`). Precisa do cabeçalho `x-nexor: 1` |
| `POST /api/demo/receber` `{de, texto, nome?}` | Simula um cliente mandando mensagem pelo WhatsApp |
| `GET /api/demo/mensagens[?para=numero]` | Últimas 50 mensagens "enviadas" pelo simulador do WhatsApp |

**Segurança:** com `DEMO=1`, a Meta é atendida por um simulador local (que devolve até os tiques de entregue e lida), a IA é roteirizada, a Central é substituída por uma licença "Demonstração" (tudo liberado, sem prazo) e `fetch` é trocado por uma trava que recusa qualquer host fora de `localhost`/`127.0.0.1`. Os dados ficam em `./data-demo` e são todos inventados: telefones `55 34 99999-xxxx`, e-mails `@*.demo` e um CNPJ gerado.

---

## Roteiro de apresentação (10 minutos)

> A ideia é mostrar uma dor por vez e logo depois o sistema resolvendo essa dor. Fale do negócio do cliente, não da tecnologia.

**Antes:** rode `npm run demo`, entre como **Dono** e deixe a janela em tela cheia. Tenha o celular de lado (opcional) para mostrar a versão móvel.

**1. A dor (1 min), ainda sem mostrar nada**
"Quantas mensagens de WhatsApp a sua recepção recebe por dia? Quantas ficam sem resposta depois das 18h ou no sábado? Cada pergunta de preço sem resposta é um paciente que foi para o concorrente."

**2. O painel do dono (1 min) · Início**
- Aponte os números: "**91% das mensagens foram respondidas pela IA**, a primeira resposta sai em segundos e a equipe economizou horas esta semana."
- "**Precisa de você**: a IA só chama a equipe quando vale a pena. Olhe o Roberto: dor com inchaço, prioridade alta."
- Leads quentes e funil: "A IA já classifica quem está pronto para fechar."

**3. O "uau" ao vivo (3 min) · 💬 Cliente chegando**
- Clique em "Oi, quanto custa uma limpeza?". O painel abre a conversa e a Lia responde na hora, com preço e botões.
- Toque em **Ver horários** e depois num horário. "Ela olhou a agenda de verdade, ofereceu horários livres e **agendou sozinha**. Sem recepcionista, inclusive às 23h de domingo."
- Abra **Agenda**: o horário novo está lá. Volte para a conversa e mostre a ficha à direita: etiqueta "limpeza", etapa do funil atualizada.
- Mande "Estou com muita dor no dente e inchou": "Aqui ela **não tenta resolver**: acolhe e passa para a equipe com prioridade alta e o resumo pronto."

**4. A recepção (2 min) · entre como Atendente**
- Faixa do topo → **Atendente** (Juliana).
- "A recepção vê a fila **Aguardando você** em ordem de prioridade." Abra a Patrícia: o resumo diz o que ela quer (parcelar o implante). "Ninguém pergunta tudo de novo."
- Abra a conversa do Marcos: a Juliana assumiu e a IA saiu da conversa. "Quando uma pessoa entra, a IA para; quando a pessoa devolve, a IA volta."
- Mostre o botão **IA** da caixa de resposta: a IA sugere a resposta para a recepção revisar.

**5. Vender mais (1,5 min) · volte para Dono → Campanhas e Contatos**
- "Clareamento de Novembro: 48 pacientes, lidas, respondidas, e **quem respondeu já foi atendido pela IA**" (mostre a Luana nas conversas).
- Contatos: etiquetas e funil. "Monte a próxima campanha só para quem fez limpeza há 6 meses."

**6. Confiança (1 min) · Cérebro da IA e Configurações**
- Base de conhecimento: "A IA só responde o que está aqui; não inventa preço."
- "API oficial da Meta: o número não é bloqueado. Os dados ficam no servidor da clínica."

**7. Fechamento (30 s)**
"Quanto vale para você um paciente que hoje fica sem resposta? Começamos com o seu WhatsApp e a sua tabela de preços em poucos dias."

**Depois da reunião:** clique em **Reiniciar demonstração** (confirma antes) e tudo volta ao estado original para o próximo cliente.
