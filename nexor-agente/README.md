# Nexor Agente

IA pessoal no WhatsApp que o próprio cliente personaliza conversando e que **executa tarefas nos sistemas da empresa**, com **aprovação do dono** antes de qualquer alteração.

> "Luna, a partir de agora fale de um jeito mais direto e me chame de chefe."
> "Quantas caixas de água temos no estoque?"
> "Cria um pedido de 40 caixas para o Mercado Bom Preço."  → 🔐 botões **Aprovar / Recusar** no WhatsApp → pedido criado no ERP.

## Como funciona

```
Dono no WhatsApp ──► Meta (Cloud API) ──► Nexor Agente (servidor da empresa) ──► Claude (IA)
                                              │                                   │
                                              ├── conectores HTTP (ERP, CRM, …) ◄─┘ ferramentas
                                              │     • leitura: na hora
                                              │     • escrita: só depois do toque em "Aprovar"
                                              └── servidores MCP (Google, Notion, HubSpot…) — lista fechada de ferramentas
```

- **Só o dono manda.** Apenas os números em `DONOS` dão ordens. Qualquer outra pessoa recebe uma recusa educada e nada é executado.
- **Personalização pelo próprio WhatsApp:** nome do agente, jeito de falar, instruções permanentes ("sempre me mande o resumo em tópicos") e memórias ("o contato do fornecedor de água é…"). Fica em `dados/perfil.json`.
- **Qualquer sistema com API:** cada sistema entra como um conector em `conectores.json` (veja `conectores.exemplo.json`). Credenciais ficam em variáveis de ambiente (`${NOME}`) e **nunca vão para a IA**.
- **Aprovação:** criar, editar ou apagar (POST, PUT, PATCH, DELETE) gera um pedido com resumo em português e botões no WhatsApp. O pedido expira em 30 minutos, vale uma vez só e só o dono que pediu pode aprovar. Por conector, a escrita pode ser `aprovar` (padrão), `livre` ou `bloqueada`.
- **Servidores MCP:** a IA usa direto as ferramentas de servidores MCP remotos. Como essas chamadas são feitas pela Anthropic, **não passam pela aprovação**: use servidores e ferramentas de **leitura** ou uma lista fechada (`ferramentas`). Para ações que alteram dados, prefira um conector HTTP.
- **Auditoria:** tudo o que foi pedido, aprovado, recusado e executado fica em `dados/auditoria.jsonl`.

## Segurança
- Webhook com assinatura da Meta (`X-Hub-Signature-256`) e comparação em tempo constante.
- URL de cada chamada conferida: nada de `../`, outro domínio, redirecionamento ou caminho fora da lista do conector (proteção contra SSRF).
- Respostas de sistemas são tratadas como **dados, não ordens** (proteção contra injeção de instruções); limite de mensagens por janela; corpo limitado; cabeçalhos de segurança.
- Roda no servidor ou na nuvem da empresa do cliente: os dados dos sistemas não ficam com a Nexor.

## Rodar no computador

```bash
cd nexor-agente
npm ci
cp .env.example .env            # preencha ANTHROPIC_API_KEY e DONOS
cp conectores.exemplo.json conectores.json   # ajuste para os sistemas do cliente
npm test
npm run chat                    # conversa pelo terminal, com aprovação por s/n
```

## Publicar (Render)
O serviço tem um Blueprint próprio, `nexor-agente/render.yaml` (plano Starter, com disco para `dados/`). No Render: New → Blueprint → Blueprint Path `nexor-agente/render.yaml`. Ele fica separado do `render.yaml` da raiz para não ser criado sem você querer. Variáveis: `ANTHROPIC_API_KEY`, `DONOS`, `WHATSAPP_*` e as credenciais usadas no `conectores.json`. O arquivo `conectores.json` vai no **Secret File** do Render (Environment → Secret Files → `conectores.json`), apontado por `CONECTORES=/etc/secrets/conectores.json`.

No app da Meta, o webhook é `https://SEU-ENDERECO/webhook/whatsapp`, com o `WHATSAPP_VERIFY_TOKEN` e assinatura do campo **messages**.

## Próximos passos (roadmap)
- Áudio (transcrição) e imagens/documentos enviados pelo WhatsApp.
- Painel web para conectar sistemas sem editar JSON, com assistente de configuração.
- Conectores prontos: Nexor RH, Nexor Atende, Omie, Bling, Conta Azul, Google Agenda, planilhas.
- Rotinas agendadas ("todo dia às 8h me mande o resumo de vendas").
- Aprovação também para ferramentas MCP que alteram dados (cliente MCP próprio no servidor).
- Computador virtual (uso do computador pela IA) para sistemas antigos sem API, em ambiente isolado.

## Nexor Central

Com as variáveis `NEXOR_CENTRAL_URL`, `NEXOR_INSTANCIA`, `NEXOR_TOKEN` e `NEXOR_CHAVE_PUBLICA` (geradas na Nexor Central), o sistema envia a saúde da instalação e aplica a situação do contrato: aviso, somente leitura ou suspenso. Sem elas, funciona normalmente. Detalhes em [central/README.md](../central/README.md).
