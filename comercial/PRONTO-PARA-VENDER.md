# O que falta para vender e gerenciar (17/11/2026)

Levantamento de todos os produtos e de tudo que a venda precisa em volta deles: servidor, cobrança, contrato e suporte. Marque a coluna "Feito" à medida que for andando.

## 1. Produtos
| Produto | Estado | Pode vender? | O que falta |
|---|---|---|---|
| Nexor Barber | Pronto para produção (Banca nota 9) | **Sim** | Nada técnico |
| Nexor RH + Ponto | Pronto (QA próprio) | **Sim** | Rodar a Banca antes do primeiro cliente grande; publicar o app Meu Ponto nas lojas, se ainda não foi |
| Nexor Contábil | Pronto | **Sim** | Rodar a Banca |
| Nexor Atende IA | Pronto | **Sim** | Rodar a Banca; cada cliente precisa do número de WhatsApp na Meta |
| Nexor Agente | Pronto | **Sim**, com conector conhecido | Rodar a Banca; conector sob medida é projeto à parte |
| Nexor Elo | Pronto para piloto (Banca 9,0) | **Piloto** com 1 fornecedor | Subir na VPS (é um sistema só, para todos os fornecedores) e cadastrar os planos na Central |
| Nexor Service Desk | Página e campanha no ar | **Ainda não** | Criar a versão Nexor (pausada): sem ela não há o que instalar |
| Site Pro, Commerce, Gestão, Automação, LGPD | Serviços | **Sim** | Orçar pela calculadora |

## 2. Para gerenciar o que foi vendido
| Área | Situação | O que falta | Quem faz |
|---|---|---|---|
| **Servidor (VPS Hostinger)** | Pacote pronto: `nuvem/README.md` | Contratar a VPS, passar o DNS para a Cloudflare, criar o túnel e rodar os instaladores | **Dono** (contas), Nexor guia |
| **Nexor Central** | Pronta | Instalar na VPS e fazer o primeiro acesso | Dono |
| **Portal do parceiro** | Pronto, dentro da Central | Gerar o link de cada parceiro | Dono |
| **Subdomínio para cliente sem servidor** | **Pronto** (`nova-empresa.sh <cliente> auto`) | Endereço curinga `*` no túnel da Cloudflare | Dono, uma vez |
| **Cobrança automática** | Central pronta para o Asaas | Conta Asaas PJ, chave de API no `.env` da VPS e webhook | **Dono** |
| **Nota fiscal da Nexor** | Não está na Central | Ativar a emissão de NFS-e no Asaas (cadastro na prefeitura de Araguari) | **Dono** e contador |
| **Preços na Central** | Central com a tabela antiga | Aprovar `PRECOS-SUGERIDOS-2026.md`; a Nexor atualiza a Central e cadastra as modalidades novas de parceiro | Dono aprova, Nexor faz |
| **Contrato** | **Modelo pronto** no Claude Docs (link em `docs/base/06`) | Revisão do advogado, nº do REP-P no INPI, chave Pix CNPJ e encarregado (DPO) | **Advogado** e dono |
| **Chaves de IA** | Cada sistema aceita | Chave da Anthropic da Nexor (Blue) e dos clientes (Atende, Contábil) | Dono e clientes |
| **WhatsApp comercial (Blue)** | Pronto | Número na Meta (WhatsApp Business API) | Dono |
| **Backup fora da VPS** | **Pronto**: `nuvem/backup-externo.sh`, cifrado com rclone (guia na seção 8) | Criar a conta B2 ou Drive, configurar o rclone e agendar; ligar o backup semanal da Hostinger | Dono, Nexor guia |
| **Monitoramento** | Guia pronto (seção 9 do `nuvem/README.md`) | Conta no UptimeRobot e um monitor por endereço `/health` | Dono |
| **Proteção da Central** | **Pronto**: guia do Cloudflare Access (seção 7) e `nuvem/conferir-acesso.sh` | Criar as duas aplicações no Access e rodar o conferidor | Dono |
| **Separar Nexor e clientes** | **Pronto**: `nuvem/instalar.sh` sozinho cria a VPS Clientes com túnel próprio (seção 6) | Fazer ao fechar o 10º cliente hospedado | Dono, Nexor guia |
| **Manuais do usuário** | Faltam em 7 produtos | Manual curto de uso por produto | Nexor, quando autorizado |

## 3. Ordem sugerida (primeiras duas semanas)
1. **Dia 1:**
   - contratar a VPS KVM 2;
   - passar o DNS para a Cloudflare;
   - criar o túnel e os endereços `central`, `api` e `*`.
2. **Dia 1:** instalar (`interno/` e depois `nuvem/`) e fazer o primeiro acesso à Central.
3. **Dia 2:**
   - conta Asaas PJ com a chave na VPS;
   - testar uma fatura no sandbox;
   - pedir a NFS-e ao contador.
4. **Dia 2:** aprovar a tabela de preços (a Nexor atualiza a Central no mesmo dia).
5. **Dias 3 a 5:** contrato revisado pelo advogado.
6. **Dias 3 a 5:** rodar a Banca no RH, no Contábil e no Atende IA, os mais vendáveis depois do Barber.
7. **Semana 2:**
   - primeiros clientes fundadores na Nuvem Nexor (`nova-empresa.sh <cliente> auto`);
   - piloto do Elo com um fornecedor.

## 4. Hospedagem no preço
Para o cliente sem servidor e sem domínio, a Nuvem Nexor entra **incluída na mensalidade**. Ela cobre:
- endereço `<cliente>.nexorconsultingit.com.br`;
- HTTPS;
- backup diário;
- atualizações.

Uma VPS KVM 2 atende de 15 a 25 clientes pequenos, então o custo por cliente fica em poucos reais. Detalhe em `PRECOS-SUGERIDOS-2026.md`, seção 3.
