# Instagram da Nexor: máquina de vendas

Perfil: @nexorconsultingit. Diagnóstico de 18/11/2026: 0 seguidores, 8 posts e alcance de 0 a 1 por post. A bio e 4 posts ainda falam do teste antigo de 12 horas.

Publicação: pelo conector Windsor (feed, carrossel, story e Reels), sempre com o ok do dono. Calendário e legendas: [`calendario.json`](calendario.json). Artes em JPEG: [`jpg/`](jpg/).

## 1. O funil
| Etapa | O que faz | Onde |
|---|---|---|
| Atrair | Reels e carrosséis com uma dor por produto. Impulsionamento local quando o Meta Ads estiver conectado | Feed, Reels, anúncios |
| Converter no perfil | Bio com uma promessa e um link, 3 posts fixados e destaques que respondem às dúvidas | Perfil |
| Puxar a conversa | Toda legenda termina com uma palavra para comentar (TESTE, PONTO, BARBER, IA) ou "chama no WhatsApp" | Comentários e Direct |
| Fechar | Lead vai para o WhatsApp e para a Blue no site, com rastreio `utm_source=instagram` | Site, WhatsApp, Central |

Regra: não publicar preço. Falar de "teste grátis de 30 dias", "diagnóstico gratuito" e "vagas de fundador".

## 2. Perfil (o dono faz no app, 5 minutos)
- **Nome:** Nexor Consulting | Sistemas com IA
- **Bio:**
  > IA que trabalha. Gente que cuida. 💙
  > RH e Ponto · Atende IA no WhatsApp · Barber · Contábil
  > 📍 Araguari e Triângulo · 🎁 Teste 30 dias grátis 👇
- **Link:** `https://nexorconsultingit.com.br/?utm_source=instagram&utm_medium=bio&utm_campaign=perfil`
- **Botões:** WhatsApp (34) 99733-7499 e e-mail.
- **Categoria:** Empresa de software.
- **Destaques:** Teste 30 dias · Fundadores · Produtos · Blue · Contato. Capas em `../pecas/destaque-*.png`.
- **Fixar:** `ia-gente-cuida`, `teste-30-dias` e `fundadores`.
- **Arquivar:** os 4 posts que falam em "12 horas", de 01/11 e 02/11.

## 3. Pilares de conteúdo (rodízio semanal)
1. **Dor e solução por produto** (segunda): Barber, RH e Ponto, Atende IA e Contábil, os mesmos das campanhas do Google.
2. **Prova e bastidores** (quarta): telas reais com empresas fictícias, antes e depois, o time implantando.
3. **Oferta** (sexta): teste de 30 dias, fundadores, diagnóstico gratuito.
4. **Reels** (terça e quinta): os vídeos narrados de cada produto.

## 4. Palavras-chave e respostas
| Comentário | Resposta pública | Ação |
|---|---|---|
| TESTE | "Te chamei no Direct com o link do teste 💙" | Enviar o link do teste no Direct |
| PONTO | "Te mandei no Direct como fica o ponto pelo celular na sua empresa 👊" | Link do RH e Ponto |
| BARBER | "Te mandei no Direct o teste da sua barbearia ✂️" | Link do Barber |
| IA | "Te mandei no Direct a demonstração da IA no WhatsApp 🤖" | Link do Atende IA |

A Blue faz isso sozinha, 24 horas: responde em público, chama no Direct e conversa com foco em Araguari (código em `agent/src/instagram.js`, passo a passo em `agent/README.md`, seção "Ligar ao Instagram"). Ela começa a responder quando o token do Instagram estiver no servidor.

## 5. Rotina semanal
- **Segunda, quarta e sexta:** 1 post de feed com legenda, às 11h30.
- **Terça e quinta:** 1 Reels, às 19h.
- **Todo dia:** 1 story com link ou enquete.
- **Toda segunda:** relatório da semana (alcance, salvamentos, seguidores e cliques no link) e ajuste do calendário.

## 6. Metas dos primeiros 30 dias
- 12 posts, 8 Reels e 20 stories publicados.
- 100 seguidores locais, a maioria do impulsionamento.
- 10 conversas no Direct ou no WhatsApp vindas do Instagram.
- 2 testes grátis iniciados.

## 7. Viralizar em Araguari (só orgânico, sem Facebook e sem anúncio pago)
O alcance vem dos **Reels**, de quem compartilha e das contas locais. A Nexor publica e responde. O dono faz o que a API não permite, 15 minutos por dia:
1. **Localização "Araguari, Minas Gerais"** em todo post e Reels, logo depois de publicar (editar post → Adicionar local). Isso coloca a Nexor na página do local.
2. **Áudio em alta:** nos Reels, trocar a trilha por um áudio em alta do Instagram, com volume baixo, pelo app. Isso aumenta a distribuição.
3. **Responder todo comentário em até 1 hora.** A Blue faz isso quando o servidor estiver no ar; até lá, é manual. Comentário respondido rápido faz o post subir.
4. **Interagir com contas de Araguari:** comentar de verdade (nada de "top 👏") em 10 posts por dia de perfis locais, como a prefeitura, a associação comercial, barbearias, clínicas, contabilidades e lojas.
5. **Collab:** convidar um cliente ou parceiro de Araguari para um post colaborativo (Collab). O post aparece para os seguidores dos dois.
6. **Stories com enquete e caixa de perguntas** no app, por exemplo "Sua empresa responde o WhatsApp depois das 18h?". As respostas viram conteúdo.
7. **Compartilhamento:** toda legenda pede para marcar ou mandar para alguém do ramo. Compartilhamento é o que mais espalha um post hoje.

A agenda automática publica feed às 11h22 e Reels e stories às 18h52, até 18/12.

## 8. Para acelerar (depende do dono)
- **Reels:** os 6 vídeos narrados estão em `reels/`, sem valores, e já entraram no calendário.
