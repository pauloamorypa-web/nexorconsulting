# Nexor Contábil

Sistema para escritórios de contabilidade. *O escritório no piloto automático, o contador no papel de consultor.*

- **Cobrança de documentos:** o que cada cliente precisa mandar todo mês e uma régua automática por WhatsApp e e-mail.
- **Leitura de documentos com IA:** notas, extratos e recibos lidos e conferidos (CNPJ, duplicidade, documento de outra empresa). Gera pré-lançamentos que aprendem com o contador, conciliação com o extrato e exportação para o sistema contábil.
- **Obrigações e prazos:** tarefas por cliente e competência, com prazo legal (feriados e dias úteis) e prazo interno, responsável e tempo gasto.
- **Portal do cliente e WhatsApp do escritório:** pendências, envio de documentos, guias, chamados e respostas da IA com os dados do cliente.
- **Nexor Central:** licença, monitoramento, Suporte Nexor e vinculação pelo código do cliente.

**Implantação no escritório:** [MANUAL-IMPLANTACAO.md](MANUAL-IMPLANTACAO.md) (instalação com `implantacao/instalar.sh`, `SISTEMAS="contabil"`).

## Desenvolvimento

```bash
npm install
cp .env.exemplo .env      # opcional: ANTHROPIC_API_KEY para a leitura com IA
npm start                 # http://localhost:8793 (painel) · /portal/ (portal do cliente)
npm test                  # 30 testes: fluxo completo, segurança, prazos e Nexor Central
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/regras/` | Datas (feriados, dias úteis), catálogos padrão (obrigações, documentos, contas) e geração idempotente de tarefas e pendências |
| `src/ia/` | Leitura de documentos (saída estruturada + conferência por código + sugestões) e assistente do WhatsApp |
| `src/servicos/` | Núcleo (arquivos criptografados, fila de leitura, régua, avisos, WhatsApp recebido, rotina diária) e canais (Meta, Resend) |
| `src/http/` | API do painel (`api.js`) e do portal (`portal.js`) |
| `src/nexor/` | Licença da Nexor Central (arquivo igual em `rh/` e `atende/`) e política de bloqueio |
| `public/` | Painel do escritório; `public/portal/` é o portal do cliente |

Prazos e catálogos são **padrões editáveis**: o escritório confere no início de cada ano. A leitura da IA é sempre uma sugestão conferida por uma pessoa.
