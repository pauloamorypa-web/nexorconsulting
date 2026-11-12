# 6. Mapa do repositório e estado dos produtos

Para achar sem procurar. Atualizado em 12/11/2026.

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
| Nexor Guardião | `guardiao/` | 8798 | A criar | A rodar | Em construção |
| Portal da demonstração | `demo/` | 8780 | | | Pronto |

Outras páginas de serviço (sem sistema próprio na demonstração): `sistema-erp` (Gestão), `software-sob-medida`, `criacao-de-sites` (Site Pro), `loja-virtual` (Commerce), `automacao-de-processos-com-ia`, `cofre-de-senhas` (Cofre), `inventario-de-ti` (IT Platform).

## Sistemas internos
| Sistema | Pasta | Para quê |
|---|---|---|
| Nexor Central | `central/` | Clientes, planos, teste, fundadores, faturas, comissões, licenças, fila de conversão offline |
| Blue (assistente de vendas) | `agent/` | Atende contatos, pontua, faz cadência, envia eventos ao Meta e ao Google, relatório por campanha |
| Servidor interno | `interno/` | Central e Blue com túnel, backup e endurecimento |
| Implantação por empresa | `implantacao/` | Docker, túnel, backup, guia de instalação |

## Site
| O quê | Onde |
|---|---|
| Página inicial | `index.html`, `assets/css/style.css`, `assets/js/*.js` |
| Páginas de produto (geradas) | `tools/paginas.py` → `solucoes/<slug>/index.html` |
| Cards de soluções | `assets/js/solucoes.js` |
| Telas dos produtos | `assets/img/<produto>/` · vídeos em `assets/video/` |
| Rastreio de campanha | `assets/js/rastreio.js` |
| Sitemap e privacidade | `sitemap.xml`, `privacidade.html` |

## Comercial e marketing
| O quê | Onde |
|---|---|
| Planos, preços, fundadores, comissões | `comercial/PLANOS-E-PRECOS.md` e `central/src/planos.js` |
| Elo: preços e prospecção em Araguari | `comercial/ELO-PRECOS.md`, `comercial/ELO-ARAGUARI.md` |
| Guardião: mercado, preços, proposta | `comercial/GUARDIAO-MERCADO.md`, `comercial/GUARDIAO-PRECOS.md`, `comercial/proposta-guardiao/` |
| Peças prontas | `marketing/pecas/` (fonte em `marketing/fonte/pecas.html`) |
| Textos por canal | `marketing/CANAIS.md`, `marketing/README.md`, `marketing/ELO-MARKETING.md` |
| Campanhas, projeção e simulador | `marketing/campanhas/` |
| Marca e uniformes | `marketing/marca/`, `marketing/uniformes/` |
| Vídeos e gerador | `marketing/videos/` |

## Qualidade
| O quê | Onde |
|---|---|
| Agentes da Banca | `.claude/agents/banca-*.md` |
| Como rodar e escala de gravidade | `banca/README.md` |
| Relatórios e vereditos | `banca/relatorios/2026-11-barber`, `2026-11-elo`, `2026-11-chamados-ti` |
| Avaliação como produto (Nexor Shield) | `banca/AVALIACAO-PRODUTO.md` |

## Como rodar os testes
`cd <produto> && npm test` (Node 22). Demonstração de todos: `node demo/iniciar.mjs` ou só alguns: `node demo/iniciar.mjs barber elo`.
