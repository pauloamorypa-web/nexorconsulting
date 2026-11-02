# Cadastro do app "Meu Ponto" nas lojas

O app das lojas é **somente o do colaborador** (bater o ponto, espelho, holerite, pedidos e comunicados).
O painel do RH continua no navegador, no endereço do servidor.

## Dados do app

| Campo | Valor |
| --- | --- |
| Nome | Meu Ponto: Nexor RH |
| Nome curto (ícone) | Meu Ponto |
| Identificador (pacote / Bundle ID) | `br.com.nexorconsultingit.ponto` |
| Categoria | Empresas (Business) |
| Classificação etária | Livre / 4+ |
| Preço | Gratuito, sem compras no app e sem anúncios |
| Site de suporte | https://www.nexorconsultingit.com.br |
| E-mail de suporte | contato@nexorconsultingit.com.br |
| Política de privacidade | https://SEU-SERVIDOR/privacidade.html |

## Textos

**Subtítulo (App Store, até 30 caracteres):** Ponto com digital e QR Code

**Descrição curta (Google Play, até 80 caracteres):** Bata o ponto com a digital ou o QR Code e veja seu espelho e holerite.

**Descrição completa:**

> O Meu Ponto é o app do colaborador das empresas que usam o Nexor RH.
>
> REGISTRE O PONTO EM SEGUNDOS
> • Toque no botão e confirme com a digital ou o Face ID
> • Ou leia o QR Code do quiosque na entrada da empresa
> • Receba na hora o comprovante de registro de ponto
>
> ACOMPANHE SUA JORNADA
> • Espelho de ponto do mês, com horas trabalhadas, extras e banco de horas
> • Assine o espelho pelo celular
>
> FALE COM O RH SEM PAPEL
> • Esqueceu de bater? Peça o ajuste pelo app
> • Envie a foto do atestado
> • Peça férias e acompanhe a resposta
>
> HOLERITE E COMUNICADOS
> • Holerites sempre à mão
> • Avisos e comunicados da empresa
>
> SEGURANÇA E PRIVACIDADE
> • Sua digital e seu rosto nunca saem do celular
> • A localização é usada só no momento de bater o ponto
> • Registro de ponto conforme a Portaria MTP nº 671/2021
>
> Para usar, sua empresa precisa ser cliente do Nexor RH. O RH envia um código de ativação de 6 números.

**Palavras-chave (App Store, até 100 caracteres):** ponto,ponto eletrônico,registro de ponto,holerite,RH,biometria,QR code,espelho de ponto,jornada

**Novidades da versão 1.0:** Primeira versão: ponto com digital, Face ID e QR Code, espelho, holerite, pedidos e comunicados.

## Para a revisão (Apple e Google)

As lojas testam o app. Como ele exige login, use o **servidor de demonstração da Nexor** (`rh.nexorconsultingit.com.br`, só com dados fictícios, conforme a regra de implantação) e informe uma conta de teste:

1. No painel do RH da empresa de demonstração, cadastre o colaborador "Revisor Apple/Google".
2. Coloque-o num local **sem** "exigir GPS" e **sem** "exigir QR Code" (os revisores não estão na sua empresa).
3. Gere o código de ativação no painel, válido por 7 dias. Gere outro se a revisão demorar.
4. No campo de notas da revisão, escreva:

> Este app é de uso interno de empresas clientes do Nexor RH; cada empresa tem o próprio servidor. Para testar: na primeira tela, digite o endereço rh.nexorconsultingit.com.br e toque em Conectar. Depois use CPF 000.000.000-00 e código de ativação 000000.
> Toque em "Registrar entrada" para bater o ponto. A biometria é opcional na conta de teste.

## Segurança dos dados (Google Play) e Privacidade (App Store)

| Dado | Coletado | Uso | Compartilhado |
| --- | --- | --- | --- |
| Nome, CPF, matrícula | Sim | Funcionalidade do app (identificação) | Não (só com o empregador) |
| Localização exata e aproximada | Sim, só ao bater o ponto | Funcionalidade (confirmar o local de trabalho) | Não |
| Fotos (atestados) | Opcional | Funcionalidade | Não |
| Biometria | **Não** sai do aparelho | — | — |

Criptografia em trânsito: sim. Exclusão: o colaborador pede ao RH da empresa (o empregador é o controlador dos dados).
Os dados ficam no servidor da empresa do colaborador, não em servidores da Nexor.

## Capturas de tela

As lojas exigem imagens do app em uso. Use a empresa de demonstração (`npm run demo` no servidor):
- iPhone: 6,9" (1320 × 2868) e 6,5" (1284 × 2778)
- Android: telefone (1080 × 1920 ou maior)

Sugestão de telas: botão de ponto, comprovante, espelho, holerite, pedidos.
