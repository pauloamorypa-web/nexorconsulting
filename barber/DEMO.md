# Nexor Barber · Modo Demonstração

O sistema real, com a **Barbearia Navalha** (fictícia): 75 dias de história, agenda de hoje cheia, clube de assinatura, estoque e comissões. Roda no notebook, sem internet. WhatsApp, SMS e Asaas são simulados, então **nada sai da máquina**.

## Como rodar
```bash
cd barber
npm run demo        # monta a demonstração do zero (cerca de 1 minuto) e abre em http://localhost:8795/demo
```
- **Com o pacote de todos os sistemas:** use `demo/` na raiz do repositório.
- **Reaproveitar os dados:** `DEMO=1 npm start` sobe sem montar de novo. Monte de novo no dia da apresentação, porque a agenda fica sempre "hoje".
- **Reiniciar:** o botão **Reiniciar demonstração** na faixa laranja volta tudo ao estado original em 1 segundo.

## Perfis
| Perfil | Quem | O que mostra |
|---|---|---|
| Dono | Rafael Lima | Agenda de todos, caixa, clube, relatórios, comissões, configurações |
| Recepção | Carla Mendes | Agenda do dia, comandas, clube |
| Barbeiro | Bruno Rocha | Só a própria agenda e as próprias comissões |
| Cliente (app) | Lucas Andrade | App do cliente: assinante do clube, horário marcado amanhã |

Entre por `http://localhost:8795/demo` ou pelo botão **Trocar de perfil** na faixa. Não precisa de senha.
- **Senha, se for preciso:** `demo-navalha-1`, com o e-mail do perfil (`rafael@navalha.demo`, `carla@navalha.demo`, `bruno@navalha.demo`).

## Botões da faixa (só na demonstração)
- **Mensagens enviadas:** o que o sistema mandou por WhatsApp, SMS e Asaas, como lembrete, confirmação, código e cobrança.
- **Simular pagamento do clube:** o Asaas avisa que o cliente pagou o Pix, e o clube ativa sozinho.
- **Simular mensagem no WhatsApp:** um cliente escreve, e o sistema responde na hora com o link do app.

## Roteiro de apresentação (10 minutos)
Dor do dono de barbearia: **agenda no caderno ou no WhatsApp, cliente que falta, caixa e comissão no papel, clube que ninguém controla.**

1. **A agenda do dia (1 min)**, como Dono.
   - Mostre as colunas por barbeiro, quem já foi atendido, quem está na cadeira e quem chegou.
   - Fale: *"Isso aqui substitui o caderno e o vai e vem no WhatsApp. Cada barbeiro vê a própria coluna no celular."*
2. **O cliente marca sozinho (2 min).**
   - Clique em **Trocar de perfil → Cliente (app)**, de preferência com a janela no tamanho de celular.
   - Mostre o horário de amanhã, o clube e a loja.
   - Toque em **Agendar**: serviço, barbeiro, dia e horário em 4 toques.
   - Volte ao Dono: o horário novo já está na agenda.
   - Abra **Mensagens enviadas**: a confirmação saiu pelo WhatsApp.
   - Fale: *"Seu cliente agenda às 23h sem te chamar. E recebe lembrete 3 horas antes, então ele falta menos."*
3. **Fechar a comanda (1 min).**
   - Num horário "Na cadeira", clique em **Fechar comanda**.
   - Acrescente uma pomada, escolha Pix e feche.
   - Fale: *"A comissão do barbeiro, o estoque e o caixa já se resolveram. Fim do caderninho."*
4. **Clube de assinatura (2 min).**
   - Abra **Clube de assinatura**: assinantes ativos, receita do mês e quem está atrasado.
   - Clique em **Simular pagamento do clube**: a assinatura pendente fica **ativa** sozinha.
   - Fale: *"Receita recorrente todo mês, cobrada pelo Asaas, com baixa automática. Atrasou, o cliente recebe o link para pagar."*
5. **Números do negócio (1 min).**
   - Mostre **Relatórios**: faturamento, ticket médio, ocupação por dia, faltas e clientes sumidos.
   - Mostre também **Comissões** por barbeiro.
   - Fale: *"Você sabe quanto entrou, quem mais vende e quem sumiu. O sistema avisa o cliente que está na hora de voltar."*
6. **Visão do barbeiro (1 min).**
   - Clique em **Trocar de perfil → Barbeiro**: ele vê só a própria agenda e as próprias comissões.
   - Fale: *"Cada um vê o que é seu. Dono e recepção veem tudo."*
7. **WhatsApp (1 min).**
   - Clique em **Simular mensagem no WhatsApp** e escreva "Tem horário hoje?".
   - Abra **Mensagens enviadas**: a resposta automática saiu com o link do app.
8. **Fechamento (1 min).**
   - Fale: *"Você testa 30 dias grátis na sua barbearia, com a gente configurando junto."*
   - Mostre o programa de fundadores, se ainda houver vagas.
   - Clique em **Reiniciar demonstração** para a próxima reunião.

## Segurança
- **Só nesta máquina:** o servidor escuta só em `127.0.0.1`. `DEMO_PUBLICO=1` libera a rede, mas só para a versão online atrás do login do Cloudflare Access.
- **Sem rede externa:** qualquer conexão para fora da máquina é bloqueada por código, além dos simuladores.
- **Sem dados reais:** os dados são fictícios e a chave mestra é própria da demonstração. A demonstração não conversa com a Nexor Central.
- **Rotas só na demonstração:** sem `DEMO=1`, as rotas `/demo` e `/api/demo` não existem (404). O teste `test/demo.test.js` confere isso.
