# Nexor Barber

Agendamento para barbearias, com app do cliente, clube de assinatura, produtos, comanda e comissões. *A cadeira cheia sem ninguém no telefone.*

## O que tem de diferente

- **O de sempre, em um toque.** O app aprende o barbeiro, o serviço, o dia da semana e a hora de cada cliente e já oferece o próximo horário livre perto disso.
- **Retorno no tempo certo.** Cada cliente tem o próprio ciclo de corte (média dos intervalos entre as visitas). Passou do ciclo sem horário marcado: aviso automático no WhatsApp com o link do app.
- **Vaga relâmpago.** Cancelou? A vaga vai na hora, pelo WhatsApp, para até 3 pessoas da lista de espera daquele dia. Quem confirmar primeiro leva; os outros continuam na fila.
- **Entrar sem senha.** Google, código pelo WhatsApp ou por SMS. Quem entra com Google confirma o celular, e o sistema junta o cadastro antigo do balcão.
- **Clube de assinatura.** O app identifica o assinante em cada passo do agendamento: o que está incluído, quantos usos restam no ciclo e, quando não cobre (fora do plano, limite atingido, dia não incluído ou mensalidade em atraso), o motivo e o link para pagar. Planos com serviços incluídos (ilimitado ou X por ciclo), dias da semana válidos e desconto em produtos. Cobrança recorrente pelo Asaas (Pix, boleto ou cartão) ou pagamento no balcão. O agendamento coberto pelo clube sai com valor zero e o uso é contado sozinho.
- **Loja com reserva.** O cliente reserva o produto pelo app e paga junto com o corte. O estoque reservado sai da vitrine.
- **Estou chegando.** O cliente avisa pelo app e o painel destaca quem chegou.
- **Autonomia total da barbearia.** Expediente, feriados, serviços, barbeiros, comissões, regras de agenda, WhatsApp, SMS, Google e Asaas são configurados no painel, sem a Nexor. Cada barbeiro tem login próprio: a própria agenda, folgas, expediente e comissões.

## Telas

| Painel (`/`) | App do cliente (`/app/`, instala no celular) |
|---|---|
| Agenda em linha do tempo por barbeiro, com a linha do agora, folgas, encaixe e "chegaram" | Entrar com Google, WhatsApp ou SMS |
| Comanda: serviço, produtos reservados e extras, desconto, forma de pagamento | "O de sempre" e agendamento em 4 passos (serviço, barbeiro, dia, horário) |
| Clientes (clube, sumidos, aniversariantes) e ficha com histórico | Próximo horário: estou chegando, agenda do celular (.ics), remarcar, cancelar |
| Clube: planos, assinantes, pagamento no balcão, receita recorrente | Lista de espera e vaga relâmpago |
| Produtos e estoque, venda no balcão | Clube (planos, uso do ciclo, pagamento) |
| Caixa do dia, comissões, folgas e horários, relatórios | Loja e perfil |
| Configurações e acessos da equipe | |

Papéis: **dono/administrador** (tudo), **recepção** (agenda, clientes, clube, produtos, caixa) e **barbeiro** (só a própria agenda, folgas, expediente, comandas e comissões).

## Desenvolvimento

```bash
npm install
cp .env.exemplo .env
npm start      # http://localhost:8795 (painel) · /app/ (app do cliente)
npm test       # 24 testes: regras, fluxo completo, segurança e Nexor Central
```

Implantação na barbearia: [MANUAL-IMPLANTACAO.md](MANUAL-IMPLANTACAO.md) (`implantacao/instalar.sh` com `SISTEMAS="barber"`).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/regras/` | Datas (Brasília), motor de horários (expediente, folgas, antecedência, encaixe) e clube (cobertura, ciclo, "o de sempre", ciclo de retorno) |
| `src/servicos/` | Núcleo (agendar, remarcar, cancelar, comanda, estoque, comissões, clube, lista de espera, rotina) e canais (WhatsApp, SMS Twilio, Google, Asaas) |
| `src/http/` | API do painel (`api.js`) e do app do cliente (`app.js`) |
| `src/nexor/` | Licença da Nexor Central (arquivo igual nos outros sistemas) e política de bloqueio |
| `public/` | Painel; `public/app/` é o app do cliente |
