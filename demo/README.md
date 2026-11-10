# Demonstração Nexor: o sistema real na apresentação de venda

Um comando sobe todos os sistemas da Nexor no seu notebook. Cada um vem com uma empresa fictícia cheia de dados: agenda do dia, histórico de meses, pendências, números de painel. Funciona **sem internet**. WhatsApp, SMS, pagamentos e IA são simulados, então **nada sai do computador**.

| Sistema | Empresa fictícia | Porta |
|---|---|---|
| Nexor Barber | Barbearia Navalha | 8795 |
| Nexor RH + Ponto | Padaria Pão Dourado | 8791 |
| Nexor Atende IA | Clínica Sorriso | 8790 |
| Nexor Agente | Distribuidora Vale Verde | 8792 |
| Nexor Contábil | Escritório Exemplo Contabilidade | 8793 |
| Página inicial (escolher sistema e perfil) | | 8780 |

## Preparar o notebook (uma vez)
1. Instale o **Node 22 ou mais novo** ([nodejs.org](https://nodejs.org), versão LTS).
2. Baixe este repositório (Git ou "Download ZIP" no GitHub).
3. Rode a demonstração uma vez **com internet**: na primeira vez ela instala as dependências de cada sistema. Depois funciona offline.

## Antes de cada apresentação
- **Windows:** dois cliques em `demo\iniciar.bat`.
- **Mac ou Linux:** `./demo/iniciar.sh`.
- **Só alguns sistemas:** `node demo/iniciar.mjs barber atende`.

A página `http://localhost:8780` abre sozinha. Em cerca de 1 minuto cada sistema fica "No ar". Clique no perfil para entrar, sem senha. Para encerrar, use `Ctrl+C` na janela preta.

Os dados são montados **na hora**, com datas relativas a hoje. Por isso a agenda é sempre "de hoje" e as pendências são sempre "desta semana". Suba a demonstração no próprio dia.

## Durante a apresentação
Em todas as telas aparece a faixa laranja **"Demonstração · dados fictícios"**, com:
- **Trocar de perfil:** veja o sistema como dono, funcionário ou cliente.
- **Reiniciar demonstração:** volta tudo ao estado original. Use entre uma reunião e outra, ou quando o cliente mexer muito.
- **Botões ao vivo:**

| Sistema | Botão | O que acontece |
|---|---|---|
| Barber | Simular pagamento do clube | O Asaas avisa que o cliente pagou e o clube ativa sozinho |
| Atende | Simular mensagem no WhatsApp | A IA responde na hora no painel |
| Contábil | Simular documento ou mensagem | A IA classifica o documento e responde o cliente |
| Contábil | Simular pagamento de honorário | O honorário baixa sozinho |
| Agente | WhatsApp simulado | O dono pede algo, o agente propõe e você aprova |

- **Mensagens enviadas:** mostra o que o sistema "mandou" por WhatsApp, SMS e e-mail. É a prova de que a automação funciona.

O roteiro de 10 minutos de cada produto, com o que clicar e o que falar, está no `DEMO.md` de cada pasta:
[Barber](../barber/DEMO.md) · [RH](../rh/DEMO.md) · [Atende](../atende/DEMO.md) · [Agente](../nexor-agente/DEMO.md) · [Contábil](../contabil/DEMO.md)

## IA de verdade (opcional)
Por padrão, a IA responde com roteiros prontos, coerentes com os dados da empresa fictícia. Funciona offline e sem custo. Para usar a IA real:
1. Tenha internet.
2. Ponha `ANTHROPIC_API_KEY` no ambiente do notebook. Não escreva a chave em nenhum arquivo do repositório.
3. Rode com `DEMO_IA_REAL=1`.

Nesse modo, só o endereço da IA é liberado. Todo o resto continua bloqueado.

## Segurança
- **Só nesta máquina:** cada sistema escuta só em `127.0.0.1`. Ninguém na mesma rede Wi-Fi acessa.
- **Sem rede externa:** com `DEMO=1`, toda conexão para fora é bloqueada por código, além dos simuladores. Os testes automáticos de cada sistema conferem isso.
- **Sem dados reais:** os dados são fictícios (CPFs e CNPJs gerados, telefones (34) 99999-xxxx) e cada sistema usa uma chave própria da demonstração. A demonstração não conversa com a Nexor Central.
- **Pasta separada:** os dados ficam em `data-demo/` dentro de cada sistema, separados de qualquer instalação real, e fora do Git.
- **Produção intacta:** sem `DEMO=1`, as rotas de demonstração não existem (404). O sistema instalado no cliente não muda.

## Apresentação online (próxima etapa)
A mesma demonstração pode rodar no servidor interno da Nexor, atrás do Cloudflare Tunnel com login do Cloudflare Access. Cada sistema sobe com `DEMO=1 DEMO_PUBLICO=1`, os dados reiniciam toda noite, e o link é temporário e enviado só ao cliente da reunião. **Nunca use `DEMO_PUBLICO=1` sem o login do Cloudflare Access na frente**, porque a entrada por perfil não pede senha.
