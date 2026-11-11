# Nexor Guardião · especificação do produto

**O que é:** cofre em nuvem para imagens de DVR, NVR e câmeras IP. As gravações saem do local já cifradas, ficam guardadas pelo prazo do plano e só são vistas por quem tem permissão, com registro de cada acesso.

**Frase principal:** Roubaram o DVR? As imagens continuam com você.

**Para quem:** comércios, condomínios, clínicas, escolas, indústrias, postos, fazendas, redes com várias unidades e empresas de segurança eletrônica que revendem o serviço para os clientes delas.

## 1. Planos de tempo de gravação
| Plano | Retenção |
|---|---|
| 7 dias | 7 |
| 15 dias | 15 |
| 30 dias | 30 |
| 60 dias | 60 |
| 90 dias | 90 |
| 120 dias | 120 |

- O plano é **por câmera** (uma conta pode ter câmeras em planos diferentes).
- Modo de gravação por câmera: **contínua** ou **só com movimento**.
- Qualidade por câmera: econômica (subfluxo), padrão ou alta. O preço considera retenção × qualidade × modo.
- Ao vencer o prazo, o trecho é apagado sozinho (arquivo e chave), salvo se estiver **preservado**.
- Trocar de plano vale na hora para as gravações novas; diminuir o prazo só apaga o excedente depois de aviso e confirmação.

## 2. Perfis de acesso
| Perfil | Quem é | O que faz |
|---|---|---|
| **Operação Nexor** (`nexor`) | Time da Nexor | Cria contas e revendas, planos e preços, saúde de tudo, faturamento. **Não assiste** às imagens do cliente sem pedido de suporte aprovado pelo cliente (acesso temporário, registrado) |
| **Revenda** (`revenda`) | Empresa de segurança ou integrador | Gerencia as contas dos próprios clientes, instala pontes, vê saúde e consumo. Não assiste às imagens, salvo acesso temporário aprovado |
| **Gestor da conta** (`gestor`) | Dono ou responsável no cliente | Tudo da conta: locais, câmeras, usuários, permissões, planos, preservar, exportar, compartilhar, auditoria |
| **Operador** (`operador`) | Funcionário do cliente | Assiste ao vivo e às gravações das câmeras liberadas para ele; exporta só se o gestor permitir |
| **Visitante por link** | Polícia, seguradora, advogado | Vê só o trecho compartilhado, até a data de validade, com senha opcional e marca-d'água |

## 3. Como a imagem chega (ingestão)
- **Ponte Guardião** (`guardiao/ponte/`): programa leve instalado num computador ou mini-PC na rede do cliente (Windows ou Linux). Lê o DVR/NVR/câmera por **RTSP** (ou ONVIF para descobrir os endereços), corta em trechos de 10 a 60 s com `ffmpeg` sem recomprimir, **cifra no local** e envia por HTTPS. Sem abrir porta no roteador (a conexão sai de dentro para fora).
- **Fila local:** sem internet, a ponte guarda os trechos cifrados em disco (limite configurável) e envia quando a conexão volta. O painel mostra o atraso.
- **Pareamento:** o gestor ou a revenda gera um código de 8 caracteres válido por 15 minutos; a ponte troca o código por credencial própria (uma por ponte, guardada como hash, revogável).
- **Marcas:** qualquer equipamento com RTSP (Intelbras, Hikvision, Dahua, Giga, JFL, Motorola, TP-Link e outros). A ponte traz os modelos de endereço RTSP das marcas comuns.
- **Envio direto por API** para integradores (mesmo formato da ponte).

## 4. Segurança (o centro do produto)
- **Cifra de ponta:** cada trecho é cifrado com AES-256-GCM e chave própria (DEK). A DEK é embrulhada pela chave da câmera, que é embrulhada pela chave da conta (KEK), que é embrulhada pela chave-mestra do servidor (`GUARDIAO_MASTER_KEY`, fora do banco). Trocar a chave-mestra reembrulha as KEK sem regravar vídeo.
- **Apagar de verdade:** ao vencer a retenção, apaga o arquivo e a DEK. Encerrar a conta destrói a KEK: tudo fica ilegível mesmo em backup.
- **Integridade e prova:** cada trecho tem SHA-256 do conteúdo cifrado e entra numa **cadeia de hashes por câmera** (cada trecho aponta para o anterior). Qualquer troca, corte ou remoção fora da regra é detectável. A exportação leva um **laudo de integridade** (PDF/HTML) com hashes, horários, quem exportou e um código de verificação conferível numa página pública.
- **Preservação (trava de evidência):** o gestor marca um intervalo como preservado, com motivo; o trecho não expira até ser liberado. Limite por plano.
- **Acesso:** senha com scrypt, **2FA por aplicativo (TOTP) obrigatório** para gestor, revenda e Nexor; sessões HttpOnly/SameSite, CSRF por cabeçalho, CSP, limite de tentativas, bloqueio por IP opcional (lista de IPs ou países), horário permitido por operador.
- **Auditoria imutável:** quem viu o quê, quando, de onde (ao vivo, gravação, exportação, compartilhamento, mudança de permissão, plano, preservação). Também em cadeia de hashes. O gestor exporta em CSV.
- **Marca-d'água:** na reprodução e na exportação, com usuário, data e hora (dissuade vazamento por foto de tela).
- **Compartilhamento seguro:** link com validade (1 h a 30 dias), senha opcional, limite de visualizações, revogável, só o intervalo escolhido.
- **Isolamento:** toda consulta filtra pela conta; a revenda só enxerga as próprias contas. Sem IDOR.
- **LGPD:** papel de operador de dados, registro das operações, relatório de impacto modelo, aviso de câmeras para afixar, atendimento a pedido de titular (localizar e exportar ou borrar trecho), contrato de tratamento.

## 5. Diferenciais que a concorrência não entrega junto
1. Cifra antes de sair do local, com chave por conta e apagamento criptográfico.
2. Cadeia de custódia com laudo de integridade para polícia, seguro e justiça.
3. Trava de evidência (preservar além do prazo).
4. Operação Nexor e revenda **não assistem** sem autorização registrada do cliente.
5. Alerta de **sabotagem e saúde**: câmera sem sinal, imagem preta ou tampada, DVR desligado, ponte fora, atraso de envio, HD do DVR com falha (quando o equipamento informa), queda de energia provável (tudo caiu junto).
6. Funciona com o DVR que o cliente já tem, de qualquer marca, sem trocar câmera.
7. Painel de revenda white-label para empresas de segurança (marca, preços e clientes delas).
8. Planos de 7 a 120 dias por câmera, com troca na hora.
9. Relatório mensal ao gestor: horas gravadas, falhas, acessos, exportações.
10. Estimador de banda e de custo antes de contratar.

## 6. Telas
- **Cliente (`/app`):** Início (saúde, câmeras fora, últimos acessos), Câmeras (grade ao vivo e por local), Gravações (linha do tempo por câmera com movimento marcado, calendário, velocidade, salto), Exportar, Preservados, Compartilhamentos, Usuários e permissões, Auditoria, Plano e consumo, Alertas, Segurança (2FA, IPs).
- **Gerencial (`/gerencial`):** Nexor e revenda. Contas, pontes, saúde, consumo de armazenamento e banda, planos e preços, faturamento, pedidos de acesso de suporte, auditoria da operação.
- **Link público (`/c/:token`):** player do trecho compartilhado.
- **Verificação (`/verificar`):** confere o código de um laudo.
- **Celular:** tudo responsivo (PWA).

## 7. Técnica
- Padrão Nexor: Node 22, ESM, `node:sqlite`, zod, servidor HTTP próprio, CSRF `x-nexor: 1`, CSP, cookies HttpOnly/SameSite, scrypt com fila, segredos AES-GCM, limite que conta só erros, `TRUST_PROXY=0`.
- Armazenamento por interface: disco local (padrão) e S3 compatível (Backblaze B2, Wasabi, MinIO, AWS) por configuração. Metadados no SQLite.
- Reprodução: o servidor decifra em fluxo e entrega trechos fMP4/TS por HTTP com Range para o player (HLS montado na hora por intervalo). Nada decifrado é gravado em disco.
- Rotina: expiração por retenção, verificação da cadeia, saúde das câmeras e pontes, alertas (e-mail e WhatsApp por webhook), relatório mensal.
- Licença e cobrança pela Nexor Central (plano, bloqueio por inadimplência: bloqueia a visualização, **não apaga** antes do prazo de carência).
- Modo Demonstração (`DEMO=1`): empresa fictícia "Supermercado Bom Preço Araguari" e revenda "Vigia Forte Segurança", vídeos de exemplo gerados no local, sem rede externa. Porta 8798.

## 8. Fora do escopo da primeira versão
Análise de vídeo por IA (pessoas, placas, rosto), gravação de áudio, app nativo, PTZ.
