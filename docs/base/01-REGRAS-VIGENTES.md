# 1. Regras vigentes

Valem para todo trabalho. Fonte: pedidos diretos do dono. Atualizado em 12/11/2026.

## Comunicação
- Tudo em português do Brasil, inclusive relatórios de agentes, commits e comentários de código.
- Linguagem simples. Dizer com clareza o que está pronto, o que está em andamento e o que falta.
- Se algo já existe, sinalizar e **não processar de novo**.

## Eficiência
- Análises e correções **completas**, sem pular agente nem item, mas com tempo e processamento otimizados.
- Reaproveitar o que já se sabe: memória, base (`docs/base/`), padrões e código existente.
- Não reler histórico, não reauditar o que já tem veredito, não reescrever material pronto.

## Segurança e sigilo
- Nunca pedir senha, token ou chave no chat. Chaves ficam em variável de ambiente ou no servidor.
- Repositório público: nenhum dado, marca, login ou domínio real de cliente. Relatórios citam "cliente" e nomes genéricos.
- Material de cliente (código, capturas com a marca dele) fica fora do repositório.
- Teste de invasão só em ambiente de teste e, para sistema de cliente, com autorização por escrito.

## Marca e conteúdo
- Não alterar a marca Nexor (logo, cores, fontes). Arquivos oficiais em `marketing/marca/`.
- Cidade da Nexor: **Araguari (MG)**. Mercado local: Araguari e Triângulo Mineiro.
- Assinatura: **IA com cuidado humano** (a IA faz o trabalho pesado; gente da Nexor acompanha; quem decide é o cliente).
- Artes, telas e demonstrações só com dados fictícios, e dizer que são fictícios.
- O site não publica mensalidade nem taxa dos planos. As condições do programa de fundadores e o teste de 30 dias são públicos.

## Entrega
- Trabalhar no branch de trabalho, commit claro em português, push, PR e merge na main (o site sai da main pelo GitHub Pages).
- Sem force push. Sem identificador de modelo em commit, PR ou código.
- Cada correção vem com teste que falha antes e passa depois. A suíte do produto fica verde.
- **Todo produto novo** sai com: manual de instalação, manual do usuário, material de marketing, demonstração e auditoria da Banca (ver `07-CHECKLIST-PRODUTO-NOVO.md`).

## Quando rodar a Banca de novo (e só nesses casos)
- Produto novo ou versão grande.
- Antes de implantar em cliente grande.
- A cada 3 meses nos produtos em produção.
- Depois de incidente de segurança.
