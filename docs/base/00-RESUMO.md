# 0. Resumo operacional (ler primeiro)

Estado em 18/11/2026. Formato chave-valor. Detalhe nos documentos 01 a 07.

## Empresa
- Nome: Nexor Consulting · assinatura "IA com cuidado humano"
- Sede: Araguari (MG) · atende: Brasil inteiro (implantação online, visita na região)
- WhatsApp comercial: (34) 99733-7499 · conta bancária principal: C6 Bank (dados fora do repo)
- Site: nexorconsultingit.com.br (GitHub Pages, publica a cada merge na main)

## Regras que mais pesam (ver 01)
- Preço: nunca publicar valor, faixa, desconto ou percentual. Preço só com atendente no WhatsApp.
- Banca para o cliente: "banca de teste de intrusão". Não citar agentes de IA.
- "Patenteado": não usar sem patente; dizer "ideias exclusivas, em desenvolvimento".
- Segredos: nunca no chat nem no repo. Só em variável de ambiente.
- Gasto em anúncio: só liga com ok explícito do dono.

## Produtos (ver 06)
- Vendáveis: Atende IA, RH e Ponto, Barber, Contábil, Agente, Elo (piloto). Service Desk: ainda não.
- Em breve (10): One, Cobra, Agenda, Voz, Vendedor, Pedidos, Documentos, Gestor, Parceiros, Shield.
- Teste: 30 dias, sem cartão. Link direto: `/#testar-<id>` (atende, rh, barber, contabil, agente, elo...).

## Site (home de 18/11/2026)
- Topo: simulador "escolha o seu negócio" (`assets/js/home.js`), abre a cena pela `utm_campaign`.
- Seções: garantias, produtos com galeria de telas reais, sistemas interligados, em breve, banca, como funciona, Blue, sob medida, dúvidas.
- Ampliar telas: `assets/js/zoom.js` (home e `solucoes/`).
- Links conferidos: 673, nenhum quebrado.

## Blue (assistente de vendas, pasta `agent/`)
- No ar: https://nexor-blue.onrender.com (Render, plano grátis, Virginia; dorme após 15 min).
- Site já aponta para ela (`NEXOR_API_URL` em `assets/js/config.js`).
- Canais: site ativo · WhatsApp e Instagram: código pronto, faltam tokens da Meta.
- Problema em 18/11: `ANTHROPIC_API_KEY` inválida no Render (erro 401). Dono precisa colar chave nova.
- Testes: 108 passando (`node --test` em `agent/`).

## Google Ads
- 3 campanhas de Pesquisa no ar desde 17/11: Barber, RH e Ponto, Atende IA. R$ 20/dia no total.
- Região: raio de 30 km de Araguari. Anúncio do Barber sem valor (o antigo foi pausado).
- Campanha automática "Soluções em Softwares" (Performance Max): pausada.
- Conversões: tag do Google `GTM-KKXB2W8C` no site; conversão de lead do site ainda não ligada.
- Crédito: R$ 1.200 ao gastar R$ 1.200 (pagamento por Pix).

## Instagram (@nexorconsultingit)
- Só orgânico. Sem Facebook e sem Meta Ads (decisão do dono).
- Estreia publicada em 18/11 (3 posts). Calendário: `marketing/instagram/calendario.json` até 18/12.
- Agenda automática: feed às 11h22, Reels e stories às 18h52 (horário de Brasília).
- Reels: 6 vídeos em `marketing/instagram/reels/`, mantendo a narração (sem trocar áudio).

## Vídeos
- Institucional 16:9 (95 s, voz, trilha, legenda): `marketing/videos-finais/nexor-institucional-1080p.mp4`. Roteiro `marketing/videos/roteiros/00-institucional-2026.md`.
- Produtos (verticais, narrados): `marketing/videos/nexor-*-locucao-vertical.mp4`.

## Tarefas agendadas desta conta
- Instagram: feed (manhã) e Reels/stories (noite), até 18/12.
- Google Ads: revisão de 7 dias em 24/11.

## Pendências do dono
- Chave da IA válida no Render (Blue).
- App na Meta: WhatsApp (34) 99733-7499 em coexistência + Instagram; tokens no Render.
- Perfil do Instagram: bio, botão de WhatsApp, arquivar 4 posts de "12 horas", localização "Araguari, MG" em cada post.
- Asaas PJ (saque no C6) e NFS-e com o contador; VPS Hostinger e DNS na Cloudflare.
- Contrato revisado pelo advogado; número do REP-P no INPI; chave Pix CNPJ; encarregado (DPO).
- Decidir: canal Instagram no Atende IA ou ajustar o texto de venda.
