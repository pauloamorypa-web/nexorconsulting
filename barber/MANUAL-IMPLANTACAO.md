# Manual de implantação · Nexor Barber

Do servidor ligado até o primeiro cliente agendando pelo app. Tempo típico: uma tarde, mais a aprovação dos modelos de mensagem pela Meta.

## 1. Antes da visita

- [ ] Código do cliente na Nexor Central (`NX-XXXX-XXXX`): Central → Clientes → cliente.
- [ ] Domínio do app (ex.: `agenda.barbearianavalha.com.br`) apontado para a Cloudflare da barbearia ou da Nexor.
- [ ] Cloudflare Tunnel criado, com o hostname público apontando para `http://barber:8795`.
- [ ] Lista da barbearia: serviços (nome, duração, preço), barbeiros (nome, cor, comissão de serviço e de produto), expediente e feriados, planos do clube, produtos com estoque.
- [ ] Contas da barbearia (não da Nexor): Meta Business com o número de WhatsApp, Twilio (se for usar SMS), Google Cloud (login com Google) e Asaas (clube com cobrança automática).

## 2. Instalar no servidor

```bash
cd nexorconsulting/implantacao
sudo SISTEMAS="barber" ./instalar.sh
```

O instalador pergunta o identificador da empresa, o endereço do app, o token do túnel e o código `NX-…`. No fim mostra o **código de instalação**.

- [ ] Confira que o serviço `barber` do `docker-compose.yml` tem `TRUST_PROXY: "1"` (vem assim). Atrás do Cloudflare Tunnel, é isso que faz o servidor ler o IP real do visitante nos limites de login. Fora do túnel, com a porta 8795 exposta direto, use `TRUST_PROXY=0` (o padrão do sistema).
- [ ] Guarde a `BARBER_MASTER_KEY` do `.env` no cofre da Nexor (sem ela, os tokens de WhatsApp, SMS e Asaas não abrem).
- [ ] Abra `https://SEU-ENDERECO/` e crie a barbearia com o código de instalação.
- [ ] Confira na Nexor Central que o sistema apareceu vinculado (ou vincule em Configurações → Nexor).

Barbearia junto com outro sistema no mesmo servidor: `SISTEMAS="rh barber"`. Várias barbearias num servidor: `SISTEMAS="barber" ./nova-empresa.sh slug dominio [token]`.

## 3. Configurar a barbearia (com o dono)

Tudo em **Configurações**. Explique ao dono que ele muda tudo sozinho depois.

1. **Barbearia**: nome, frase do app, endereço, telefone, Instagram, link do Maps e cor. Regras: intervalo dos horários, antecedência, até quantos dias, prazo para o cliente cancelar, lembrete, lista de espera, comissão em serviço do clube. Retorno automático e folga em dias.
2. **Expediente e feriados**: turnos por dia (`09:00-12:00, 13:00-19:00`). Feriados como dia fechado ou horário especial.
3. **Serviços**: já vêm 4 de exemplo. Ajuste preço e duração; a duração define o tamanho do horário.
4. **Barbeiros**: nome, cor na agenda, comissões e quais serviços faz. Expediente próprio em Folgas e horários.
5. **Acessos**: um login para cada barbeiro (perfil Barbeiro, ligado ao nome dele) e para a recepção.
6. **Clube**: Clube de assinatura → Novo plano. Ex.: R$ 89,90 com corte ilimitado e 2 barbas por ciclo, válido de terça a quinta, 10% em produtos.
7. **Produtos**: estoque inicial, mínimo para alerta e se aparece na vitrine do app.

## 4. Canais

### WhatsApp (API oficial da Meta)

- [ ] No app da Meta (developers.facebook.com), copie o **ID do número** e gere um **token permanente** (usuário do sistema com `whatsapp_business_messaging`).
- [ ] Copie a **chave secreta do app** (Configurações → Básico).
- [ ] Cole em Configurações → WhatsApp, SMS, Google e Asaas e salve.
- [ ] Na Meta, configure o webhook com a URL e o token de verificação mostrados no painel e assine o campo `messages`.
- [ ] Crie e envie para aprovação os modelos (idioma pt_BR) e escreva o nome de cada um no painel:

| Uso | Categoria | Variáveis, na ordem |
|---|---|---|
| Código de acesso | Autenticação (botão copiar código) | código |
| Confirmação | Utilidade | nome, serviço, quando, barbeiro |
| Lembrete | Utilidade | nome, serviço, quando, barbeiro |
| Vaga da lista de espera | Utilidade | nome, quando, link |
| Retorno | Marketing | nome, dias desde o último corte, link |
| Mensalidade em atraso | Utilidade | nome, link de pagamento |

Sem modelo cadastrado, o sistema manda texto simples, que a Meta só entrega se o cliente falou com a barbearia nas últimas 24 h. **Sem o modelo de código, o login pelo WhatsApp de clientes novos não chega.**

- [ ] Teste: campo "Testar envio" com o seu celular.

### SMS (Twilio, opcional)

- [ ] Account SID, Auth Token e o número remetente (ou Messaging Service SID `MG…`).
- [ ] Teste pelo painel. O SMS também serve de reserva para os avisos quando o WhatsApp falhar.

### Entrar com Google (opcional)

- [ ] Google Cloud → APIs e serviços → Credenciais → ID do cliente OAuth → **Aplicativo da Web**.
- [ ] Em **Origens JavaScript autorizadas**, coloque o endereço do app (`https://agenda…`).
- [ ] Cole o Client ID no painel. O botão aparece no app na hora.

### Clube com cobrança automática (Asaas, opcional)

- [ ] Gere a chave da API no Asaas da barbearia (comece em sandbox para testar).
- [ ] Cole no painel e escolha o ambiente. O painel gera o token do webhook.
- [ ] No Asaas → Integrações → Webhooks: URL `https://SEU-ENDERECO/webhook/asaas`, o token mostrado no painel e os eventos de cobrança (`PAYMENT_*`).
- [ ] Teste: assine um plano pelo app com um CPF de teste, pague no sandbox e confira que a assinatura ficou ativa.

Sem Asaas, o cliente assina pelo app e paga no balcão; a recepção registra o pagamento em Clube → Pagamento.

## 5. Teste de aceite (faça com o dono)

- [ ] Pelo celular, entrar no app pelo WhatsApp (ou SMS/Google).
- [ ] Agendar um corte; a confirmação chega no WhatsApp.
- [ ] Ver o horário na agenda do painel; tocar em "Estou chegando" e ver o destaque no painel.
- [ ] Fechar a comanda com um produto; conferir caixa, estoque e comissão do barbeiro.
- [ ] Com outro celular na lista de espera, cancelar um horário e ver a vaga chegar.
- [ ] Barbeiro entra com o login dele e só vê a própria agenda.
- [ ] Backup: `./backup-agora.sh` e conferir a pasta `backups`.

## 6. Divulgação

- [ ] Link do app (Configurações → Canais) na bio do Instagram e no status do WhatsApp.
- [ ] QR Code do link impresso no balcão e no espelho.
- [ ] No primeiro atendimento de cada cliente, peça para ele agendar o próximo pelo app.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Código do WhatsApp não chega | Modelo de autenticação aprovado e nome escrito igual no painel; token válido; número com DDD. |
| Botão do Google não aparece | Client ID salvo e a origem autorizada no Google Cloud igual ao endereço do app (com https). |
| Assinatura não ativa depois do pagamento | Webhook do Asaas com a URL e o token do painel; veja em Configurações → Auditoria. |
| Cliente não vê horários | Expediente do dia, folgas, antecedência mínima e se o barbeiro faz aquele serviço. |
| App mostra "agendamento indisponível" | Contrato bloqueado na Nexor Central: regularize e o sistema volta em até 5 minutos. |
