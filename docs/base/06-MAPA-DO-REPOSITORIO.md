# 6. Mapa do repositório e estado dos produtos

Para achar sem procurar. Atualizado em 17/11/2026.

## Produtos
| Produto | Pasta | Porta da demo | Página no site (`solucoes/…`) | Banca | Estado |
|---|---|---|---|---|---|
| Nexor Atende IA | `atende/` | 8790 | `chatbot-whatsapp-com-ia` | Não rodou | Pronto |
| Nexor RH + Ponto | `rh/` | 8791 | `sistema-de-ponto-eletronico` | Não rodou (teve QA próprio) | Pronto |
| Nexor Agente | `nexor-agente/` | 8792 | `agente-de-ia-no-whatsapp` | Não rodou | Pronto |
| Nexor Contábil | `contabil/` | 8793 | `sistema-para-escritorio-de-contabilidade` | Não rodou | Pronto |
| Nexor Barber | `barber/` | 8795 | `sistema-para-barbearia` | Nota 9 | Pronto para produção |
| Nexor Elo | `elo/` | 8796 | `rede-fornecedores-instaladores` | Nota 9,0 | Pronto para piloto |
| Nexor Service Desk | (versão Nexor a criar em `servicedesk/`) | 8797 | `sistema-de-chamados` | Nota 8,0 (na ferramenta do cliente, v1.12) | Página e campanha no ar; demonstração pausada |
| Portal da demonstração | `demo/` | 8780 | | | Pronto |

Outras páginas de serviço (sem sistema próprio na demonstração): `sistema-erp` (Gestão), `software-sob-medida`, `criacao-de-sites` (Site Pro), `loja-virtual` (Commerce), `automacao-de-processos-com-ia`, `cofre-de-senhas` (Cofre), `inventario-de-ti` (IT Platform).

## Sistemas internos
| Sistema | Pasta | Para quê |
|---|---|---|
| Nexor Central | `central/` | Clientes, planos, teste, fundadores, faturas, comissões, licenças, fila de conversão offline |
| Blue (assistente de vendas) | `agent/` | No ar em https://nexor-blue.onrender.com (Render, plano grátis, região Virginia, publica sozinho a cada merge na main). Atende no site, WhatsApp e Direct do Instagram (comentários com palavra-chave), pontua, faz cadência, envia eventos ao Meta e ao Google, relatório por campanha |
| Servidor interno | `interno/` | Central e Blue com túnel, backup e endurecimento |
| Implantação por empresa | `implantacao/` | Docker, túnel, backup, guia de instalação; `nova-empresa.sh <cliente> auto` cria o cliente na Nuvem Nexor |
| Nuvem Nexor (VPS Hostinger) | `nuvem/` | Borda que entrega `<cliente>.nexorconsultingit.com.br` a cada sistema; guia completo da VPS em `nuvem/README.md` |

## Site
| O quê | Onde |
|---|---|
| Página inicial | `index.html`, `assets/css/style.css`, `assets/js/*.js` |
| Páginas de produto (geradas) | `tools/paginas.py` → `solucoes/<slug>/index.html` |
| Cards de soluções | `assets/js/solucoes.js` |
| Telas dos produtos | `assets/img/<produto>/` · vídeos em `assets/video/` |
| Padrão das telas de acesso | `assets/acesso/` (fonte) e `tools/acesso.sh` (copia para os produtos) |
| Rastreio de campanha | `assets/js/rastreio.js` |
| Sitemap e privacidade | `sitemap.xml`, `privacidade.html` |

## Comercial e marketing
| O quê | Onde |
|---|---|
| Planos, preços, fundadores, comissões | `comercial/PLANOS-E-PRECOS.md` e `central/src/planos.js` |
| Elo: preços e prospecção em Araguari | `comercial/ELO-PRECOS.md`, `comercial/ELO-ARAGUARI.md` |
| Pesquisa de preços do mercado e tabela sugerida | `comercial/PESQUISA-PRECOS-2026.md`, `comercial/PRECOS-SUGERIDOS-2026.md` |
| O que falta para vender e gerenciar | `comercial/PRONTO-PARA-VENDER.md` |
| Contrato de assinatura (modelo, fora do repositório) | Claude Docs: https://claude.ai/artifact/EBRx2GvAiKunhjGiMoW2iD |
| Bancos de Araguari e APIs bancárias | `comercial/PESQUISA-BANCOS-ARAGUARI.md`; código em `assets/bancos/` |
| Peças prontas | `marketing/pecas/` (fonte em `marketing/fonte/pecas.html`) |
| Índice de todas as imagens por canal | `marketing/KIT-COMPLETO.md` (92 peças: Instagram, LinkedIn, Google Meu Negócio, Google Ads, Meta Ads, WhatsApp, impresso) |
| Instagram: máquina de vendas | `marketing/instagram/` (PLANO.md, calendario.json com 22 publicações de 19/11 a 18/12, foco em Araguari, sem valores, artes em `jpg/`; publica pelo Windsor com o ok do dono) |
| Textos por canal | `marketing/CANAIS.md`, `marketing/README.md`, `marketing/ELO-MARKETING.md` |
| Campanhas, projeção e simulador | `marketing/campanhas/` (Google Ads de lançamento: `google-ads-lancamento.json`, no ar desde 17/11/2026 pelo Windsor, R$ 20/dia; revisar termos de busca em 7 dias) |
| Marca e uniformes | `marketing/marca/`, `marketing/uniformes/` |
| Vídeos e gerador | `marketing/videos/` |
| Vídeos com locução (Remotion) | `marketing/videos/remotion/` · piloto `marketing/videos/nexor-barber-locucao-vertical.mp4` · institucional 16:9 `marketing/videos-finais/nexor-institucional-1080p.mp4` · TI 16:9 `marketing/videos-finais/nexor-ti-1080p.mp4` |
| Roteiros de vídeo e storyboards | `marketing/videos/roteiros/` (16 roteiros, 27 pranchas, plano de gravação no `README.md`) |
| Fichas para Capterra, GetApp e B2B Stack | `marketing/marketplaces/` |

## Qualidade
| O quê | Onde |
|---|---|
| Agentes da Banca | `.claude/agents/banca-*.md` |
| Como rodar e escala de gravidade | `banca/README.md` |
| Relatórios e vereditos | `banca/relatorios/2026-11-barber`, `2026-11-elo`, `2026-11-chamados-ti` |
| Avaliação como produto (Nexor Shield) | `banca/AVALIACAO-PRODUTO.md` |

## Como rodar os testes
`cd <produto> && npm test` (Node 22). Demonstração de todos: `node demo/iniciar.mjs` ou só alguns: `node demo/iniciar.mjs barber elo`.
