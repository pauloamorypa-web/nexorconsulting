# Nexor RH · Modo Demonstração

Sistema real funcionando com dados fictícios (empresa **Padaria Pão Dourado**), sem internet e sem risco.

## Como rodar

```bash
cd rh
npm install        # só na primeira vez
npm run demo       # dados fictícios persistem em ./data-demo-local
```

Abra **http://127.0.0.1:8792/demo/entrar?papel=admin**. O mesmo comando funciona no Windows, macOS e Linux. Para voltar a demonstração ao estado inicial, pare o servidor e execute `npm run demo:reiniciar`.

- Escuta só em `127.0.0.1`. O servidor só aceita outras máquinas com `DEMO_PUBLICO=1`, que é para a versão online atrás do Cloudflare Access.
- Nenhuma chamada externa. O eSocial (produção restrita), a Gupy e a Nexor Central respondem por simuladores locais, e o `fetch` do servidor bloqueia qualquer host fora do localhost. As fontes do Google também saem das páginas.
- A licença aparece como "Demonstração": todos os módulos liberados, sem prazo e sem bloqueio.
- Os dados ficam em `./data-demo-local`. A demonstração preserva alterações entre inicializações; para voltar ao estado original, pare o servidor e use `npm run demo:reiniciar`.
- Todas as datas acompanham o dia de hoje: ponto de hoje com batidas, pendências dos últimos dias, histórico de 2 meses, folha do mês passado para fechar.
- O botão **Reiniciar demonstração**, na faixa laranja do topo, volta tudo ao estado original. Ele também existe como `POST /api/demo/reiniciar`.
- Para trocar de papel sem sair, use o seletor "Ver como…" na faixa.
- A demonstração usa `PORT=8792` e `DATA_DIR=./data-demo-local` por padrão para não interferir na instalação normal nem no banco `data-demo` que acompanha o pacote. Você pode substituir essas variáveis.

## Papéis

| Papel | Link | Quem é | Abre em |
|---|---|---|---|
| `admin` | `/demo/entrar?papel=admin` | Marina Souza, administradora do RH | Painel › Início |
| `rh` | `/demo/entrar?papel=rh` | Paula Ribeiro, analista de RH | Painel › Ponto |
| `gestor` | `/demo/entrar?papel=gestor` | Felipe Andrade, gerente da loja (vê só o Atendimento) | Painel › Ponto |
| `colaborador` | `/demo/entrar?papel=colaborador` | Ana Beatriz Lima, atendente | App Meu Ponto (`/app/`) |
| `quiosque` | `/demo/entrar?papel=quiosque` | Tablet da Loja Paulista | QR Code rotativo (`/quiosque/`) |

Para entrar pelo login normal, a senha é `demo12345` para todos: `demo@nexorrh.com.br` (admin), `rh@paodourado.example` (rh) e `felipe@paodourado.example` (gestor).
No app, o novato Henrique Alves ainda não ativou: use o CPF **123.505.433-07** e o código **246810**.
No quiosque, Ana bate o ponto por CPF **123.450.000-07** + PIN **2580**.

Rotas de apoio:
- `GET /api/demo`: papéis e links.
- `GET /api/demo/mensagens`: últimas 50 chamadas "enviadas" aos simuladores (eSocial, Gupy).

O RH não envia WhatsApp/SMS nem cobra pelo Asaas, por isso não há `/api/demo/pagar` nem `/api/demo/receber`. A IA também não é usada aqui (`ia: "simulada"`).

## O que já vem semeado

- 10 colaboradores em 3 departamentos e 2 locais (loja e fábrica), com 3 jornadas: comercial, 6x1 e madrugada.
- Ponto do 1º dia de dois meses atrás até agora, com biometria, QR Code, atrasos, horas extras e esquecimentos. Ana chega hoje só com a entrada, para bater a próxima ao vivo.
- Pendências: 3 ajustes de ponto (Eduarda, Diego, Isabela), 1 pedido de férias (Bruno) e 1 atestado (Camila).
- Folha de dois meses atrás fechada, com holerites no app. A folha do mês passado está calculada, esperando o fechamento.
- eSocial com certificado A1 fictício e histórico processado com recibos. A admissão do Henrique está pronta para enviar.
- Recrutamento: 3 vagas e 10 candidatos de várias origens (site, LinkedIn, Indeed, Gupy, indicação), 3 deles na triagem.
- 3 comunicados com confirmação de leitura.

## Roteiro de apresentação (10 minutos)

**Abertura (30 s).** "Quanto tempo o seu RH gasta todo mês somando cartão de ponto, corrigindo esquecimento e montando folha? Vou mostrar uma padaria de verdade, com 10 pessoas e duas unidades, funcionando agora."

**1. Painel do dono, Início (1 min) · `papel=admin`.**
Mostre os cartões: quem está trabalhando agora, atrasados hoje, pedidos para analisar, folha salarial. Desça até "Agora", com a lista ao vivo de quem bateu ponto.
Fale: *"Você abre o celular e sabe na hora quem chegou e quem faltou, sem ligar para a loja."*

**2. O colaborador bate o ponto (1 min 30) · "Ver como…" › Ana (colaborador).**
É o app Meu Ponto no navegador (no celular vira app instalado). Toque em **Registrar saída para intervalo** e mostre o comprovante com NSR.
Abra **Espelho**: o mês inteiro com horas trabalhadas, extras e atrasos. Depois **Holerites**: o holerite do mês fechado.
Fale: *"Sem relógio de parede e sem papel. Digital ou rosto do celular, ou QR Code do tablet na entrada, e o funcionário confere tudo sozinho."*
Extra opcional: "Ver como…" › Quiosque, para mostrar o QR que muda a cada 30 segundos (impede foto repassada a colega).

**3. Tempo real (30 s) · volte para Marina › Ponto.**
A batida da Ana já aparece no ponto do dia. *"Isso chegou em tempo real, sem atualizar a página."*

**4. Pendências do gestor (1 min 30) · "Ver como…" › Felipe (gestor).**
Ele vê só a equipe da loja (repare que Folha e eSocial nem aparecem no menu). Aprove o ajuste da Isabela ("o app não abriu na entrada") e veja o espelho dela se corrigir.
Fale: *"O gerente resolve na loja e o RH não vira central de recados. Tudo fica na auditoria: quem aprovou e quando."*

**5. Férias e atestado (1 min) · Paula (rh) › Férias e ausências.**
Aprove as férias do Bruno (o sistema calcula o abono) e o atestado da Camila.
Fale: *"O pedido veio pelo app, com foto do atestado. Nada de papel perdido na gaveta."*

**6. O "uau": folha + eSocial (2 min) · Paula › Folha de pagamento.**
Abra a folha do mês passado: INSS, IRRF, FGTS, horas extras e adicional noturno já calculados a partir do ponto. Clique **Fechar folha**: os holerites vão para o app e os eventos S-1200/S-1210/S-1299 são gerados sozinhos.
Vá em **eSocial** › **Enviar** e depois **Consultar**: lotes processados com recibo, mais a admissão do Henrique.
Fale: *"Do ponto ao eSocial sem digitar nada de novo. É aqui que acaba a dor de cabeça do fechamento e da multa por atraso."*

**7. Recrutamento (1 min) · Marina › Recrutamento.**
O funil por etapa e a origem dos candidatos. Mova a Juliana de "Triagem" para "Entrevista". Mostre a página pública da vaga (`/vagas/`).
Se o cliente usa Gupy, salve qualquer token e clique em **Sincronizar**: duas vagas e as candidaturas entram (via simulador).
Fale: *"A vaga vira página no Google, e o contratado já entra como colaborador com um clique."*

**8. Comunicados (30 s) · Comunicados.**
Mostre o fixado do feriado com "lido por". *"Você sabe quem leu o aviso, e ninguém diz que não sabia."*

**Fechamento (30 s).** "Tudo o que você viu é o sistema real. Para a sua empresa, a gente importa os funcionários e você bate o primeiro ponto ainda esta semana." Depois clique em **Reiniciar demonstração** para deixar tudo pronto para o próximo cliente.

