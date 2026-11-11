# Trabalho pausado em 11/11/2026: demonstração do Service Desk, kit de marketing completo e roteiros de vídeo

Pausado a pedido do dono. Retomar só quando ele pedir para "voltar para a estruturação".

## Pedido original (texto do dono)
> Pode criar em demonstração sim.
> Quero o material de marketing completo com todas as fotos de tudo da nexor! Redes sociais, google e plataformas de vendas!
> Se ja tiver me sinalize sem processar novamente!
> Crie roteiros para videos profissionais, com fotos e falas pro vídeo

## Onde cada frente parou
| Frente | Já feito (salvo no commit 45dd3af) | Falta |
|---|---|---|
| Demonstração do Nexor Service Desk | Cópia white-label começada, **fora do repositório** (pasta `servicedesk-parcial` no scratchpad da sessão; ainda tinha restos da marca do cliente em 4 arquivos) | Limpar a marca do cliente, Modo Demonstração (DEMO=1, trava de rede, /demo/entrar, /api/demo, reiniciar), dados fictícios, entrada em `demo/iniciar.mjs` (porta 8797), `servicedesk/DEMO.md`, testes. Se o scratchpad tiver sumido, recomeçar a partir do ZIP v1.12 entregue |
| Fotos e peças que faltam | Telas reais do Agente (`assets/img/agente/`) e do Elo (`assets/img/elo/`), início das peças novas em `marketing/fonte/pecas.html` | Revisar as capturas; cat-elo, cat-servicedesk, cat-blue, cat-sites; 4 posts do Google Meu Negócio; imagens de display do Google Ads; carrossel PDF do LinkedIn; capas de destaques e de Reels; fichas de marketplaces (Capterra, GetApp, B2B Stack); `marketing/KIT-COMPLETO.md` (índice com "já existia" e "novo"); ZIP com todas as imagens por canal |
| Roteiros de vídeo | Pasta `marketing/videos/roteiros/` iniciada; roteiros do Elo e do Service Desk adicionados ao gerador (`marketing/videos/gerador/roteiros.js`, `telas-elo/`) | Escrever os roteiros (institucional 90 s, 30 s e 15 s; 8 produtos em 60 s e 30 s; fundadores; teste 30 dias; Banca; depoimento; bastidores), pranchas de storyboard, README com plano de gravação, renderizar `nexor-elo.mp4` e `nexor-servicedesk.mp4` |

## O que já existia (não refazer)
54 peças em `marketing/pecas/`, `marketing/CANAIS.md`, 8 campanhas em `marketing/campanhas/`, 5 vídeos automáticos, telas de Atende, Barber, Contábil, RH e Service Desk, marca e uniformes.
