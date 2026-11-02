# Nexor RH

Sistema completo de gestão de pessoas da Nexor Consulting: **ponto eletrônico com biometria do celular e QR Code**, app do trabalhador, férias, afastamentos, benefícios, folha de pagamento, rescisão, recrutamento, comunicados e **integração com o eSocial**.

Node.js 22 sem framework, banco SQLite nativo do Node, interface em JavaScript puro (sem build). Roda em qualquer servidor com Node 22.13 ou mais novo.

## O que tem

| Área | Funções |
| --- | --- |
| **Ponto (REP-P, Portaria MTP 671/2021)** | Registro pelo app com biometria do celular (digital/rosto via WebAuthn), QR Code rotativo do quiosque (muda a cada 30 s), cerca de GPS por local, PIN no quiosque para quem está sem celular. Cada marcação tem NSR único, hash SHA-256 encadeado e comprovante. Marcações nunca são apagadas: correções viram ajustes. |
| **Espelho e tratamento** | Horas trabalhadas, extras 50% e 100% (domingo/feriado), adicional noturno com hora reduzida (52m30s), tolerância da CLT (art. 58 §1º), faltas, atrasos, escalas (12x36, 6x1…), feriados nacionais automáticos + locais. Ajustes pedidos pelo app e aprovados pelo RH/gestor. Banco de horas. Fechamento do mês. Assinatura eletrônica do espelho pelo colaborador. |
| **Fiscalização** | AFD (Anexo I), AEJ (Anexo II), assinatura CAdES do AFD (.p7s) com o certificado da empresa e verificação de integridade da cadeia de hash. |
| **Colaboradores** | Admissão completa, ficha, contrato, dependentes, benefícios, documentos com validade (ASO, CNH, NRs) e aviso de vencimento, histórico. |
| **Férias e ausências** | Períodos aquisitivos e concessivos com alerta de férias em dobro, programação com validação da CLT (art. 134 §3º), abono pecuniário, recibo, pedidos pelo app, atestados com foto pelo app, afastamentos com motivos do eSocial. |
| **Folha** | Mensal, 13º (1ª e 2ª parcelas), férias e rescisão (5 motivos, aviso proporcional, multa do FGTS). INSS progressivo, IRRF com desconto simplificado e a redução da Lei 15.270/2025, FGTS, salário-família, VT 6%, insalubridade, periculosidade, DSR, lançamentos variáveis. Holerite no app. Exportação de pagamentos (CSV). |
| **eSocial (leiaute S-1.3)** | Eventos gerados sozinhos a cada fato: S-1000, S-1005, S-1010, S-1020, S-2200, S-2205, S-2206, S-2230, S-2299, S-1200, S-1210, S-1299. Assinatura XMLDSig com certificado A1, envio em lotes ao webservice oficial (produção restrita ou produção) e consulta do retorno com recibos. |
| **Recrutamento** | Vagas, página pública de candidatura com upload de currículo e consentimento LGPD, funil de arrastar e soltar. |
| **Comunicados** | Publicados no app com confirmação de leitura. |
| **Painel** | Quem está trabalhando agora, atrasados, pedidos pendentes, férias a vencer, fim de experiência, aniversários, documentos vencendo. Perfis: administrador, RH e gestor (gestor vê só a própria equipe). |

### Endereços

- `/`: painel do RH
- `/app/`: app do trabalhador (instalável no celular: "Adicionar à tela inicial")
- `/quiosque/`: tela do QR Code para o tablet da entrada (link gerado em Configurações → Locais e quiosque)
- `/vagas/?e=<empresa>`: página pública de vagas
- `/health`: verificação de saúde

## Como rodar

```bash
cd rh
npm install
cp .env.example .env      # ajuste as variáveis
npm start                 # http://localhost:8791
```

O primeiro acesso cria a empresa e o administrador.

Para ver o sistema funcionando com dados fictícios (Padaria Pão Dourado, 8 colaboradores, um mês de ponto):

```bash
DATA_DIR=./data npm run demo
npm start
# Painel: demo@nexorrh.com.br / demo12345
```

Testes (fluxo completo + cálculos + biometria com autenticador simulado):

```bash
npm test
```

## Implantação

- **HTTPS é obrigatório em produção.** Biometria (WebAuthn), câmera e GPS só funcionam em HTTPS (ou `localhost`).
- Defina `PUBLIC_URL` com o endereço final (ex.: `https://rh.suaempresa.com.br`). A biometria fica vinculada a esse domínio: se mudar o domínio, os colaboradores precisam cadastrar a digital de novo.
- Defina `MASTER_KEY` (texto aleatório longo). Ela criptografa o certificado digital e os arquivos enviados. **Guarde-a**: sem ela não dá para ler esses dados.
- Faça backup diário da pasta `DATA_DIR` (banco `rh.db` e pasta `arquivos/`).
- O `render.yaml` da raiz do repositório já tem o serviço `nexor-rh` com disco persistente.

## Integrações com o governo: o que está pronto e o que conferir

O sistema gera e transmite os arquivos e eventos oficiais, mas **cada empresa precisa validar antes de usar em produção**, porque os leiautes do governo mudam por notas técnicas e alguns campos dependem do enquadramento de cada empresa:

1. **eSocial**: comece no ambiente **produção restrita** (padrão). Envie o certificado A1, gere os eventos de tabela, transmita e confira o retorno do governo na tela do eSocial. As ocorrências apontam qualquer campo que precise de ajuste. Os eventos não são validados contra o XSD oficial dentro do sistema. Só mude para produção depois de tudo aceito.
2. **Ponto (REP-P)**: a Portaria 671 exige que o programa de ponto tenha **registro no INPI**. Informe o número em Configurações → Empresa. Confira os leiautes do AFD e do AEJ com a versão vigente dos anexos da Portaria antes de entregar a uma fiscalização.
3. **Tabelas da folha**: os valores padrão são INSS, salário mínimo e salário-família de **2025**, IRRF de maio/2025 e a redução do IR de 2026 (Lei 15.270/2025). **Atualize em Configurações → Tabelas sempre que sair a tabela nova** (INSS e salário mínimo mudam todo janeiro).
4. **FGTS Digital e DCTFWeb**: são apurados pelo governo a partir dos eventos do eSocial. O sistema calcula o FGTS e a multa rescisória para conferência, mas a guia é emitida no FGTS Digital.
5. **Convenção coletiva**: pisos, adicionais diferentes da CLT, horas extras acima de 50% e regras de banco de horas da convenção precisam ser configurados (jornadas, lançamentos) ou revisados manualmente.
6. **Rescisão**: o cálculo é uma estimativa para conferência (médias de variáveis e descontos específicos devem ser revisados).

## Segurança e LGPD

- Senhas com scrypt, sessões em cookie HttpOnly, proteção contra CSRF, limite de tentativas de login.
- Certificado digital e arquivos (atestados, documentos, currículos) criptografados com AES-256-GCM.
- A biometria **nunca sai do celular**: o aparelho confere a digital/rosto e assina um desafio com uma chave guardada no chip de segurança. O servidor guarda só a chave pública.
- Cada empresa só enxerga os próprios dados. Gestores só veem a própria equipe.
- Registro de auditoria das ações do RH.
- Candidatos só se inscrevem com consentimento e podem ser excluídos (com o currículo).

## Estrutura

```
rh/
├── src/
│   ├── servidor.js           # HTTP, arquivos estáticos, sessões, tempo real (SSE)
│   ├── db.js                 # esquema SQLite e repositório
│   ├── ponto/                # calendário, espelho, presença (QR/GPS), biometria (WebAuthn), registro REP-P, AFD/AEJ
│   ├── folha/                # tabelas legais e cálculos (mensal, 13º, férias, rescisão)
│   ├── esocial/              # XML canônico, eventos S-1.3, assinatura A1, cliente SOAP
│   ├── servicos/nucleo.js    # regras compartilhadas e geração automática de eventos
│   └── http/                 # rotas: cadastros, ponto, folha, pessoas, eSocial, app
├── public/                   # painel, app/ (PWA), quiosque/, vagas/
├── scripts/demo.js           # dados de demonstração
└── test/                     # testes (node --test)
```
