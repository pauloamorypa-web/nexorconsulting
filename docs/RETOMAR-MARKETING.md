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

## Atualização de 16/11/2026
As fotos e peças foram concluídas: 38 imagens novas geradas, carrossel do LinkedIn em PDF e índice em `marketing/KIT-COMPLETO.md`. Continuam pendentes: fichas de marketplaces (Capterra, GetApp, B2B Stack), roteiros de vídeo e demonstração do Service Desk.

## Atualização de 16/11/2026 (2)
Roteiros de vídeo concluídos (16 roteiros, 27 pranchas e plano de gravação) e fichas de marketplaces prontas em `marketing/marketplaces/`. Do pedido original, falta só a demonstração do Service Desk. Os vídeos automáticos do Elo e do Service Desk não foram renderizados.

## Vídeos com locução: concluídos em 17/11/2026
Os 8 vídeos verticais foram gerados com o plano pago do ElevenLabs (`eleven_v4`). Os textos abaixo ficam como registro.

| Feito | Vídeo |
|---|---|
| Sim | Barber, Atende IA, RH + Ponto, Contábil, Agente, Elo, Service Desk, Blue (`marketing/videos/nexor-*-locucao-vertical.mp4`, fora do git; renderizar de novo com `npx remotion render <id>`) |

Fluxo de cada um (projeto `marketing/videos/remotion/`):
1. Gerar a locução e baixar para `public/<pasta>/locucao.mp3`.
2. Copiar as telas de `assets/img/<produto>/` para `public/<pasta>/`.
3. Acrescentar o produto em `src/produtos.tsx`, com as frases iguais ao texto falado, sem as tags.
4. Rodar `node scripts/tempos.mjs <pasta>`, conferir os quadros e renderizar.

Textos já escritos (voz Cajó `gHd1exuPmjC5yOMlzA9t`, exceto a Blue):

- **Agente** (pasta `agente`): `[conversational, warm, relaxed pace] E se você pudesse perguntar para a sua empresa: quanto vendemos ontem? ... O Nexor Agente é a sua inteligência artificial no WhatsApp, ligada aos sistemas da empresa. ... Ele responde na hora, com as vendas e a meta de cada vendedor. ... Avisa o estoque que vai faltar, e quem parou de comprar. ... E quando é para agir, ele prepara e espera. Nada é feito sem o seu aprovar. ... [smiling] Sua empresa no seu bolso. Você no comando. ... São só dez vagas de fundador. O link está na bio.`
  Telas: `vendas`, `meta`, `estoque`, `aprovacoes`.
- **Elo** (pasta `elo`): `[conversational, warm, relaxed pace] Instalador, você ainda compra o material antes, e fica esperando o cliente pagar? ... No Nexor Elo, o orçamento já sai com o estoque da loja. ... A calculadora mostra os impostos e o seu lucro antes de enviar. ... O cliente aceita e paga no link, no Pix, no boleto ou no cartão. ... E o dinheiro já cai dividido: o material para a loja, o serviço para você. ... [smiling] E a loja não vê o seu cliente. ... Comece grátis. O link está na bio.`
  Telas: `app-propostas`, `nova-proposta-calculadora`, `financeiro-repasses`, `propostas-reservas`.
- **Service Desk** (pasta `servicedesk`): `[conversational, warm, relaxed pace] Pedido pelo corredor, pelo WhatsApp, pelo e-mail. Qual era o urgente mesmo? ... No Nexor Service Desk, todo pedido vira um chamado, com prioridade, prazo e responsável. ... Pediu uma informação ao usuário? O prazo pausa até ele responder. ... Você vê cada computador da empresa, e reinicia ou instala de longe, com permissão e registro. ... O painel mostra os números do mês, e a televisão da sala mostra a fila. ... [smiling] Tudo no seu servidor, com os dados sob o seu controle. ... Teste grátis por trinta dias. O link está na bio.`
  Telas (ilustrativas; usar `nota: "Tela ilustrativa · dados fictícios"`): `chamados`, `chamado`, `inventario`, `painel` e `tv`.
- **Blue** (pasta `blue`, voz Sofia `n2a9VtkZLl8j1FSXHsL7`): `[warm, friendly, relaxed pace] Onze e quarenta e sete da noite. E bateu aquela dúvida sobre a sua empresa? ... Oi! Eu sou a Blue, a assistente de inteligência artificial da Nexor. ... Me conta como é a sua empresa, que eu te mostro o sistema certo. ... Posso liberar um teste grátis de trinta dias, e marcar uma conversa com o nosso time. ... E quando você quiser falar com gente, eles estão lá. ... [smiling] Inteligência artificial que atende. Gente que cuida. ... Me chama. O link está na bio.`
  Imagens: `assets/img/blue-avatar.webp` e as peças `marketing/pecas/blue-*.png` (proporção 4:5; usar `proporcao: 0.8`).
