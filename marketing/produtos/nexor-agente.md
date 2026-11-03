# Nexor Agente

**IA pessoal no WhatsApp, personalizada pelo próprio cliente, que executa tarefas nos sistemas da empresa com aprovação do dono.**
Status: **primeira versão funcionando** no código (`nexor-agente/`), prévia "Em breve" no site.

## A promessa (com honestidade)
- **"Fala com ela pelo WhatsApp e ela faz o que você pedir"** → sim, dentro dos sistemas **conectados**.
- **"Em qualquer sistema"** → qualquer sistema que tenha **API** (a maioria dos ERPs, CRMs, e-commerces, bancos e ferramentas na nuvem) ou um **servidor MCP**. Sistemas antigos sem API entram depois, com uso do computador pela IA em ambiente isolado (roadmap).
- **"Ela faz tudo"** → ela consulta na hora e **prepara** as alterações; criar, editar, apagar, pagar ou enviar só acontece depois do **"Aprovar"** do dono. Esse é o diferencial de confiança.

## Para quem
Donos e gestores de pequenas e médias empresas que vivem no WhatsApp e não têm tempo de abrir cinco sistemas para saber o estoque, criar um pedido, ver quem está atrasado ou marcar uma reunião.

## O que já funciona (MVP)
| Recurso | Como |
|---|---|
| Conversa no WhatsApp | Cloud API oficial da Meta, respostas em balões, "digitando…" |
| Personalização pelo chat | Nome, jeito de falar, empresa, instruções permanentes e memórias (`dados/perfil.json`) |
| Ação em sistemas com API | Conectores HTTP em `conectores.json`, com caminhos permitidos por sistema |
| Ação em sistemas com MCP | Servidores MCP remotos com lista fechada de ferramentas |
| Aprovação | Botões Aprovar/Recusar no WhatsApp, expiram em 30 min, uso único, só o dono |
| Só o dono manda | Lista de números autorizados (`DONOS`) |
| Segurança | Credenciais só no servidor, proteção contra SSRF e redirecionamento, dados de sistemas tratados como dados, limite de mensagens, assinatura do webhook |
| Auditoria | Tudo em `dados/auditoria.jsonl` |
| Teste sem WhatsApp | `npm run chat` no terminal |

## Roadmap
1. **Áudio e documentos:** o dono manda áudio ou foto e a IA entende.
2. **Rotinas agendadas:** "todo dia 8h me manda as vendas de ontem".
3. **Painel web:** conectar sistemas sem editar arquivo, com assistente.
4. **Conectores prontos:** Nexor RH, Nexor Atende, Omie, Bling, Conta Azul, Google Agenda e planilhas.
5. **Aprovação também no MCP:** cliente MCP próprio no servidor para pedir aprovação por ferramenta.
6. **Sistemas sem API:** computador virtual isolado, com a IA usando a tela, sempre com aprovação.
7. **Equipe:** mais de um número, com permissões diferentes por pessoa.

## Preço sugerido (para validar)
| Plano | Inclui | Implantação | Mensalidade |
|---|---|---|---|
| Essencial | 1 dono, até 2 sistemas conectados | R$ 2.500 | R$ 497 |
| Profissional | até 3 pessoas, até 5 sistemas, rotinas | R$ 5.000 | R$ 997 |
| Empresarial | equipe, sistemas ilimitados, conectores sob medida | sob consulta | a partir de R$ 1.997 |

Mais o consumo de IA (Anthropic) e da Meta, pagos direto pelo cliente. Cada conector novo sob medida: R$ 2.000 a R$ 5.000.

## Riscos e cuidados
- **Prometer só o que está conectado.** No diagnóstico, listar os sistemas do cliente e confirmar quais têm API.
- **MCP sem aprovação:** só ferramentas de leitura ou lista fechada até o roadmap 5.
- **LGPD:** a IA processa dados da empresa pelo provedor de IA; contrato e aviso ao cliente; dados em repouso no servidor dele.
- **Responsabilidade:** o dono aprova; o contrato deixa claro que a IA executa o que foi aprovado.
