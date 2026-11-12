# 5. Dúvidas e pendências

O que falta o dono decidir, conferir ou autorizar. Ao resolver, mova para `02-DECISOES-APROVADAS.md`. Atualizado em 12/11/2026.

## Para o dono decidir ou conferir
| Item | O que falta |
|---|---|
| Elo · tarifas do Asaas | Conferir no contrato as tarifas de Pix, boleto e cartão e ajustar `ASAAS_TARIFA_*` (hoje são estimativas) |
| Elo · modelo de cobrança | Validar: a cobrança sai da conta Asaas da Nexor e a taxa da plataforma é de 2,5% |
| Conversão offline | Colocar o mesmo token em `CONVERSAO_TOKEN` na Central e na Blue, e a `CONVERSAO_URL` na Central |
| Service Desk v1.12 no cliente | Aprovar cada computador uma vez, dar a permissão de comando remoto a quem precisa, preencher o `.env`, testar os agentes em Windows e Mac reais |
| Guardião · preços dos concorrentes | Conferir nos links antes de usar em proposta (a pesquisa leu só os resultados da busca) |
| Guardião · jurídico | Contrato de tratamento de dados e modelo do laudo de integridade precisam de revisão de advogado |
| Guardião · revenda a 40% | A margem cai para 57% a 60%, abaixo da meta. Manter ou limitar a 35%? |
| Banca nas outras páginas | Citar a Banca também nas páginas dos outros produtos? |
| Preço no site | Confirmar que a regra "site não publica mensalidade" vale para todos os produtos |

## Trabalho pausado ou em andamento
| Frente | Estado |
|---|---|
| Kit de marketing completo, roteiros de vídeo e demonstração do Service Desk | **Pausado** a pedido do dono. Retomar quando ele pedir "voltar para a estruturação". Detalhes em `docs/RETOMAR-MARKETING.md` |
| Nexor Guardião | Em construção: servidor e proposta de venda. Faltam telas, fotos, página no site, manuais, marketing e Banca |

## Lacunas contra a regra "todo produto tem manuais e marketing"
| Produto | Manual de instalação | Manual do usuário |
|---|---|---|
| Barber, Contábil | Tem (`MANUAL-IMPLANTACAO.md`) | Falta |
| Atende, RH, Agente, Elo | Só o guia geral (`implantacao/GUIA-INSTALACAO.md`) | Falta |
| Service Desk | Vem no ZIP do cliente; falta a versão Nexor | Falta |
| Guardião | A fazer | A fazer |

Fazer esses manuais só quando o dono pedir (não começar por conta própria).
