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

## Vendas B2B (24/11/2026)
- Plano: `comercial/MAQUINA-DE-VENDAS-B2B.md`. Começa por Araguari. Meta: 10 fundadores em 30 dias.
- Ordem: restaurantes (Atende IA + Cardápio 3D), contadores (Contábil + indicação), empresas com funcionários (RH e Ponto), clínicas, barbearias.
- CRM: HubSpot, funil "Nexor B2B Araguari" (Alvo → Contato feito → Demonstração → Teste de 30 dias → Proposta → Fundador fechado/Perdido). 59 empresas e 22 negócios A carregados em 24/11. Lista de alvos fica lá, nunca no repositório.
- Cardápio 3D: demonstração em `solucoes/cardapio-3d/` (restaurante fictício); geradores dos modelos em `tools/cardapio-3d/`.

## Google Ads
- 3 campanhas de Pesquisa no ar desde 17/11: Barber, RH e Ponto, Atende IA. R$ 20/dia no total.
- Região: raio de 30 km de Araguari. Anúncio do Barber sem valor (o antigo foi pausado).
- Campanha automática "Soluções em Softwares" (Performance Max): pausada.
- B2B (24/11): RH e Ponto ganhou 12 palavras B2B e negativas; Atende IA ganhou negativas e o grupo "Restaurantes e delivery" (12 palavras e anúncio do Cardápio 3D). Tudo ligado em 24/11 com ok do dono, sem mudar o orçamento.
- Conversões: tag do Google `GTM-KKXB2W8C` no site; conversão de lead do site ainda não ligada.
- Crédito: R$ 1.200 ao gastar R$ 1.200 (pagamento por Pix).

## Instagram (@nexorconsultingit)
- Só orgânico. Sem Facebook e sem Meta Ads (decisão do dono).
- Estreia publicada em 18/11 (3 posts). Calendário: `marketing/instagram/calendario.json` até 18/12.
- Agenda automática: feed às 11h22, Reels e stories às 18h52 (horário de Brasília). Religada em 24/11 com foco B2B.
- Reels: 6 vídeos em `marketing/instagram/reels/`, mantendo a narração (sem trocar áudio).

## Vídeos
- Institucional 16:9 (94 s, voz, trilha, legenda; chamada só "teste grátis por 30 dias", sem falar de cartão): `marketing/videos-finais/nexor-institucional-1080p.mp4`. Roteiro `marketing/videos/roteiros/00-institucional-2026.md`.
- TI 16:9 (cerca de 77 s: Service Desk, inventário, ações remotas, painel, TV, Cofre, IT Platform): `marketing/videos-finais/nexor-ti-1080p.mp4`. Roteiro `marketing/videos/roteiros/15-ti-2026.md`.
- Vendas B2B 16:9 (cerca de 78 s: Barber, Cardápio 3D, CRM, Restaurantes; voz Guilherme do ElevenLabs; pratos reais; sem citar cidade): `marketing/videos-finais/nexor-vendas-b2b-1080p.mp4`. Um vídeo por produto: `nexor-barber`, `nexor-cardapio-3d`, `nexor-crm`, `nexor-restaurantes` (`-1080p.mp4`). Roteiro `marketing/videos/roteiros/16-vendas-b2b-2026.md`.
- Produtos (verticais, narrados): `marketing/videos/nexor-*-locucao-vertical.mp4`.

## Tarefas agendadas desta conta
- Instagram religado em 24/11/2026 com o calendário B2B (ok do dono). Revisão do Google Ads segue desligada.
- Instagram: feed (manhã) e Reels/stories (noite), até 18/12. Nada publicado de 19/11 a 23/11.
- Google Ads: revisão de 7 dias (era 24/11). As 3 campanhas continuam no ar até o dono decidir.

## Pendências do dono
- Chave da IA válida no Render (Blue).
- App na Meta: WhatsApp (34) 99733-7499 em coexistência + Instagram; tokens no Render.
- Perfil do Instagram: bio, botão de WhatsApp, arquivar 4 posts de "12 horas", localização "Araguari, MG" em cada post.
- Asaas PJ (saque no C6) e NFS-e com o contador; VPS Hostinger e DNS na Cloudflare.
- Contrato revisado pelo advogado; número do REP-P no INPI; chave Pix CNPJ; encarregado (DPO).
- Decidir: canal Instagram no Atende IA ou ajustar o texto de venda.
