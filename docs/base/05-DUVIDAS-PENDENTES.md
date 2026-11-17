# 5. Dúvidas e pendências

O que falta o dono decidir, conferir ou autorizar. Ao resolver, mova para `02-DECISOES-APROVADAS.md`. Atualizado em 17/11/2026.

## Para o dono decidir ou conferir
| Item | O que falta |
|---|---|
| Elo · tarifas do Asaas | Conferir no contrato as tarifas de Pix, boleto e cartão e ajustar `ASAAS_TARIFA_*` (hoje são estimativas) |
| Elo · modelo de cobrança | Validar: a cobrança sai da conta Asaas da Nexor e a taxa da plataforma é de 2,5% |
| Service Desk v1.12 no cliente | Aprovar cada computador uma vez, dar a permissão de comando remoto a quem precisa, preencher o `.env`, testar os agentes em Windows e Mac reais |
| Banca nas outras páginas | Citar a Banca também nas páginas dos outros produtos? |
| Texto base de 16 px | Os painéis usam 14,5 px. A regra de tipografia recomenda 16 px no texto principal; mudar altera todas as telas. Subir para 16 px? |
| Tabela de preços nova | Aprovar ou ajustar `comercial/PRECOS-SUGERIDOS-2026.md` (Ponto mais barato, Agente Start, Service Desk por técnico, implantação grátis no Barber e modalidades novas de parceiro). Depois a Nexor atualiza a Central |
| Preço nas plataformas de software | Recomendação: caminho misto, em `marketing/marketplaces/README.md`. Confirmar |
| Bancos | Antes do primeiro arquivo CNAB real, validar com o gerente do banco. Para a API Pix, cada cliente cria a credencial e o certificado no portal do próprio banco |
| Preço no site | Confirmar que a regra "site não publica mensalidade" vale para todos os produtos |

| VPS e servidor | Contratar a VPS KVM 2 na Hostinger, passar o DNS para a Cloudflare, criar o túnel com `central`, `api` e `*`, instalar e fazer o primeiro acesso à Central. Passo a passo em `nuvem/README.md`; lista completa em `comercial/PRONTO-PARA-VENDER.md` |
| Contrato | Não há modelo de contrato de assinatura, termos de uso e anexo LGPD. A Nexor rascunha quando pedido; advogado revisa |
| Nota fiscal da Nexor | Ativar a NFS-e no Asaas com o contador |

## Trabalho pausado ou em andamento
| Frente | Estado |
|---|---|
| Kit de marketing completo, roteiros de vídeo e demonstração do Service Desk | **Pausado** a pedido do dono. Retomar quando ele pedir "voltar para a estruturação". Detalhes em `docs/RETOMAR-MARKETING.md` |

## Lacunas contra a regra "todo produto tem manuais e marketing"
| Produto | Manual de instalação | Manual do usuário |
|---|---|---|
| Barber, Contábil | Tem (`MANUAL-IMPLANTACAO.md`) | Falta |
| Atende, RH, Agente, Elo | Só o guia geral (`implantacao/GUIA-INSTALACAO.md`) | Falta |
| Service Desk | Vem no ZIP do cliente; falta a versão Nexor | Falta |

Fazer esses manuais só quando o dono pedir (não começar por conta própria).
