# Vendas B2B 2026 · "Quem atende primeiro?"

| Item | Definição |
|---|---|
| Objetivo | Vender o motor de vendas da Nexor na sequência pedida pelo dono: Barber → Cardápio 3D → CRM → Restaurantes (Atende IA + Cardápio 3D). |
| Público | Donos de barbearia, restaurante, pizzaria e lanchonete; empresas que vendem pelo WhatsApp. Sem citar cidade: serve para vender em qualquer lugar. |
| Formato | 16:9, 1920×1080, 30 fps, cerca de 78 s. Tudo animado, legenda queimada, capítulos no topo. |
| Voz | Guilherme (ElevenLabs, narrador brasileiro, calmo). Tempos palavra a palavra pela transcrição (ElevenLabs Scribe), com respiro de 0,6 s na troca de capítulo. |
| Regras | Sem preço, sem percentual, sem forma de pagamento. Restaurante e clientes fictícios. Telas reais sem valores. |

## Locução, cena a cena
| # | Fala | Imagem |
|---|---|---|
| 1 | Seu cliente já decidiu comprar. A pergunta é: quem atende primeiro? | Mensagens de WhatsApp chegando; "Quem atende primeiro?" |
| 2 | A Nexor junta quatro ferramentas numa só máquina de vendas. | Logo no centro; Barber, Cardápio 3D, CRM e Atende IA ligados ao motor. |
| 3 | Na barbearia, o cliente agenda sozinho pelo app, a qualquer hora. | Tela real do app do Barber, cursor em "Agendar", "Horário marcado · 23:14". |
| 4 | O lembrete chega no celular, a cadeira não fica vazia, e o clube de assinatura garante o mês. | Lembrete no celular, cadeiras enchendo, cartão do clube com "Mês garantido". |
| 5 | No restaurante, o cardápio ganha vida. | Cardápio de papel; a pizza sobe girando em 3D. |
| 6 | O cliente aponta o celular para o QR da mesa e vê o prato girando, em três dimensões. | Celular lê o QR da mesa; pizza 3D grande, selo "3D", outros pratos girando. |
| 7 | E cada conversa vira cliente no CRM. | Mensagens voam e viram o contato "Mariana Alves". |
| 8 | A IA preenche o contato, dá uma nota de interesse e move o funil sozinha. | Ficha digitada pela IA, nota 88, cartão andando no funil. |
| 9 | Sua equipe liga primeiro para quem está pronto para fechar. | Leads quentes; botão de ligar pulsando. |
| 10 | Agora, junte tudo no seu restaurante. | Cardápio 3D, Atende IA e CRM se juntam numa fachada. |
| 11 | O cliente escolhe no cardápio 3D, toca em pedir, e a IA do Nexor Atende anota o pedido no WhatsApp. | Toque em "Pedir pelo WhatsApp"; conversa com a IA anotando o pedido #127. |
| 12 | Sem parar a cozinha. Sem perder pedido. Direto com você. | Comanda impressa; três benefícios entrando na palavra. |
| 13 | A gente instala, configura e treina a sua equipe. | Três cartões com barra; selo "Implantação com gente de verdade". |
| 14 | Teste grátis por trinta dias. Chame a gente no WhatsApp. | Chamada e WhatsApp (34) 99733-7499. |
| 15 | Nexor Consulting. IA com cuidado humano. | Logo e assinatura. |

Pratos reais: fotos geradas com IA (Seedream 5 Pro) e animadas (Kling 2.5) no ElevenLabs, em `public/vendas/reais/`.

## Vídeos de cada produto (mesmas cenas, narração própria)
| Vídeo | Narração | Arquivo |
|---|---|---|
| Barber (~31 s) | Sua barbearia vive com o WhatsApp lotado? · agenda pelo app · lembrete, cadeira cheia, clube · implantação · teste · assinatura | `nexor-barber-1080p.mp4` |
| Cardápio 3D (~40 s) | Seu cliente escolhe com os olhos · o cardápio ganha vida · QR da mesa, prato girando · toca em pedir, a IA anota · implantação · teste · assinatura | `nexor-cardapio-3d-1080p.mp4` |
| CRM (~36 s) | Quantos clientes você perde? · cada conversa vira cliente · ficha, nota e funil · leads quentes · implantação · teste · assinatura | `nexor-crm-1080p.mp4` |
| Restaurantes (~38 s) | Sexta à noite, o WhatsApp não para · Cardápio 3D + Atende juntos · pedido anotado pela IA · sem parar a cozinha · implantação · teste · assinatura | `nexor-restaurantes-1080p.mp4` |

Composições `NexorVenda-<id>` em `src/Vendas.tsx` (frases em `src/tempos/v-<id>.frases.json`).

Arquivos: composição `NexorVendasB2B` em `marketing/videos/remotion/src/Vendas.tsx`; pratos 3D em `public/vendas/giro/` (gerados dos modelos do Cardápio 3D); vídeo em `marketing/videos-finais/nexor-vendas-b2b-1080p.mp4`.
