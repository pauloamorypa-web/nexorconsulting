# Implantação dos sistemas Nexor por empresa

> **Passo a passo completo de todos os cenários** (servidor Linux ou Windows, mini PC, nuvem, notebook com configuração contra hibernação, servidor da Nexor) **e dos casos com e sem domínio: [GUIA-INSTALACAO.md](GUIA-INSTALACAO.md).**

> **Nexor Contábil** (escritórios de contabilidade): manual completo em **[contabil/MANUAL-IMPLANTACAO.md](../contabil/MANUAL-IMPLANTACAO.md)**. Instale com `sudo SISTEMAS="contabil" ./instalar.sh`, ou com `SISTEMAS="rh contabil"` para os dois.
>
> **Quais sistemas sobem:** a linha `SISTEMAS=` do `.env` (`rh`, `contabil` ou `rh contabil`). Instalações antigas, sem essa linha, continuam como `rh`. Todos os scripts (`atualizar.sh`, `backup-agora.sh`, `empresa.sh`) leem essa linha.

Cada empresa cliente recebe **o próprio ecossistema Nexor**: o Nexor RH, e quando contratados o Atende IA e o Nexor Agente, rodando juntos numa rede interna só dela, com banco, arquivos, chaves, backups e domínio separados. Nenhuma empresa enxerga os dados de outra, mesmo quando várias rodam no mesmo servidor.

```
                 internet (HTTPS)
                       │
              Cloudflare Tunnel  ← sem abrir portas no roteador
                       │
 ┌──────────── rede interna "nexor" desta empresa ────────────┐
 │  Nexor RH  ◄──── chave de integração (leitura) ──── Agente │
 │   (rh:8791)                                       (opcional)│
 │      │                                                      │
 │  backup diário (banco + arquivos) ──► ./backups ──► cópia   │
 │                                                    externa  │
 └─────────────────────────────────────────────────────────────┘
```

## Qual cenário usar

| Cenário do cliente | Recomendação | Por quê |
|---|---|---|
| **Tem servidor com espaço** (Linux, ou Windows com Hyper-V) | ✅ **Rodar no servidor do cliente** com Docker + Cloudflare Tunnel | Dados ficam com o cliente (o modelo da Nexor). Custo zero de infraestrutura para a Nexor. |
| **Não tem servidor, mas pode investir** | ✅ **Mini PC dedicado** (ex.: Intel N100/i3, 16 GB, SSD 512 GB, nobreak) **ou VPS no nome do cliente** | Mini PC: R$ 1.500 a R$ 3.000 uma vez, sem mensalidade. VPS (ex.: Hostinger, Contabo, AWS Lightsail): R$ 30 a R$ 80/mês, sem depender da energia e da internet da empresa. |
| **Só tem notebooks do setor** | ⚠️ **Não usar notebook como servidor.** Indicar a nuvem (VPS no nome do cliente ou Nuvem Nexor) | O ponto pelo celular precisa do servidor ligado 24 h. Notebook desliga, hiberna, sai da empresa, atualiza o Windows e quebra. Perder o banco de ponto é risco trabalhista (Portaria 671). O notebook vira só o **acesso ao painel** e, se quiser, o **quiosque**. |
| **Não tem nada e prefere não cuidar de infraestrutura** | ✅ **Nuvem Nexor**: servidor da Nexor com o ecossistema separado por empresa (`nova-empresa.sh`) | Mais simples para o cliente, receita recorrente de hospedagem para a Nexor. **Muda o papel na LGPD** (veja abaixo). |

**Ordem de preferência para o Nexor RH (ponto):** VPS no nome do cliente ≈ servidor próprio do cliente com nobreak > mini PC dedicado > Nuvem Nexor > *(nunca)* notebook.

### Requisitos mínimos por empresa
- **Nexor RH:** 1 vCPU, 1 GB de RAM, 10 GB de disco (até cerca de 300 colaboradores). Com Atende e Agente: 2 vCPU e 2 a 4 GB.
- **Sistema:** Ubuntu 22.04/24.04 ou Debian 12 (servidor Windows: crie uma máquina virtual Ubuntu no Hyper-V).
- **Internet:** qualquer uma (o túnel funciona atrás de roteador comum). Nobreak no servidor físico.
- **Domínio:** um subdomínio do cliente (ex.: `rh.paodourado.com.br`) ou da Nexor (ex.: `paodourado.rh.nexorconsultingit.com.br`).

### LGPD e contrato em cada cenário
- **Servidor ou nuvem do cliente:** o cliente é o **controlador** e guarda os dados; a Nexor é **operadora** só quando acessa para suporte. É o modelo atual do site.
- **Nuvem Nexor:** a Nexor passa a **armazenar** os dados como **operadora**. É obrigatório:
  - um contrato com acordo de tratamento de dados (DPA);
  - medidas de segurança documentadas;
  - backup e plano de incidentes.
  - Também é preciso ajustar o texto do site e da política, que hoje dizem "a Nexor não guarda os dados".

## Instalação passo a passo (servidor do cliente, VPS ou mini PC)

1. **Domínio e túnel (Cloudflare, gratuito)**
   1. Coloque o domínio do cliente (ou o da Nexor) na Cloudflare.
   2. Em **Zero Trust → Networks → Tunnels → Create a tunnel**, escolha o tipo **Cloudflared**, dê o nome da empresa e **copie o token**.
   3. Em **Public Hostname**, adicione `rh.paodourado.com.br` → **Service:** `http://rh:8791`.
2. **No servidor:**
   ```bash
   sudo apt update && sudo apt install -y git
   git clone https://github.com/pauloamorypa-web/nexorconsulting.git /opt/nexor   # repositório privado: use um token de leitura (deploy key)
   cd /opt/nexor/implantacao
   sudo ./instalar.sh
   ```
   O script instala o Docker, pergunta o identificador da empresa, o domínio e o token do túnel, gera a **chave mestra** e sobe o Nexor RH com o backup diário.
3. **Guarde a `RH_MASTER_KEY`** (arquivo `.env`) no cofre da Nexor. **Sem ela nada dos arquivos e do certificado pode ser lido, nem pelos backups.**
4. Abra `https://rh.paodourado.com.br`, use o **código de instalação** mostrado no fim do script e crie o primeiro administrador.

Para liberar o painel na rede local (sem internet), coloque `RH_PORTA_LOCAL=0.0.0.0:8791` no `.env` e rode `sudo ./instalar.sh` de novo. O **app do colaborador** sempre precisa do endereço HTTPS, por causa da biometria e do GPS.

## Nuvem Nexor (várias empresas no servidor da Nexor)

```bash
cd /opt/nexor/implantacao
sudo ./nova-empresa.sh padaria-pao-dourado rh.paodourado.com.br TOKEN_DO_TUNEL
sudo ./empresa.sh padaria-pao-dourado ps          # situação
sudo ./empresa.sh padaria-pao-dourado logs -f rh  # logs
```

Cada empresa fica em `clientes/<empresa>/`, com `.env`, backups e conectores próprios, e roda num projeto Docker separado (`nexor-<empresa>`), com rede e volumes isolados. Um túnel por empresa.

## Ecossistema: como os sistemas conversam

1. No Nexor RH: **Configurações → Integrações → Nova chave** (ex.: "Nexor Agente"). Copie a chave.
2. Coloque a chave em `NEXOR_RH_CHAVE` no `.env` e suba com o perfil do agente:
   ```bash
   sudo PERFIS="tunel agente" ./instalar.sh
   ```
3. O `conectores.json` já aponta para `http://rh:8791/api/integracao/v1`, dentro da rede interna. O Agente passa a responder no WhatsApp perguntas como "quem está trabalhando agora?" e "quem sai de férias este mês?".

A API de integração é **somente leitura**, não entrega CPF, salário nem documentos e pode ser revogada no painel a qualquer momento.

## Nexor Central: cobrança, bloqueio automático e suporte

Cada instalação se liga à **[Nexor Central](../central/README.md)**, o painel da Nexor para gerir todos os clientes.
- **Na Central:** abra Clientes → (cliente) → **Novo sistema** e copie as 4 linhas `NEXOR_*`.
- **No `.env` desta instalação:** cole as 4 linhas e rode `sudo ./atualizar.sh`.

A partir daí:
- A Central acompanha a saúde da instalação e o backup.
- A régua de cobrança (aviso → somente leitura → suspenso) é aplicada sozinha.
- O botão **Entrar como Suporte Nexor** abre o sistema do cliente como administrador. Lá dá para esconder do cliente módulos, abas e campos.

Sem as variáveis `NEXOR_*`, o sistema funciona normalmente, sem licença.

## Backup (regra 3-2-1)

- **Automático:** o serviço `backup` faz uma cópia por dia, consistente e com verificação de integridade, em `./backups` (guarda os últimos 14).
- **Cópia fora do servidor (obrigatória):** agende o `backup-agora.sh` com `DESTINO_EXTERNO` (outro servidor por SSH, NAS ou HD externo):
  ```bash
  sudo crontab -e
  0 23 * * * DESTINO_EXTERNO="nexor@backup.nexor:/backups/paodourado" /opt/nexor/implantacao/backup-agora.sh >> /var/log/nexor-backup.log 2>&1
  ```
- **Restaurar:**
  1. `docker compose stop rh`
  2. Copie `rh.db` e `arquivos/` do backup para o volume: `docker compose cp ./backups/rh-AAAAMMDD-HHMM/. rh:/dados/`
  3. `docker compose start rh`

  A restauração precisa da **mesma** `RH_MASTER_KEY`.
- **Teste uma restauração por mês** num servidor de teste. Backup que nunca foi restaurado não é backup.

## Atualizar

```bash
cd /opt/nexor/implantacao && sudo ./atualizar.sh
```
Faz backup antes, baixa a versão nova e reinicia. Os dados ficam nos volumes e não são apagados.

## Checklist de entrada em produção (por cliente)

- [ ] Domínio HTTPS funcionando e `https://DOMINIO/health` respondendo `{"ok":true}`
- [ ] `RH_MASTER_KEY` guardada no cofre da Nexor (e em um segundo lugar seguro)
- [ ] Primeiro administrador criado com o código de instalação
- [ ] Empresa, locais com **coordenadas de GPS** e raio, jornadas, cargos e departamentos cadastrados
- [ ] Número do **registro do REP-P no INPI** em Configurações → Empresa (Portaria 671)
- [ ] Colaboradores cadastrados e convites do app enviados; **teste o ponto no local** com 2 ou 3 pessoas
- [ ] Quiosque com QR (se usado) num tablet fixo, com o link do painel
- [ ] Certificado digital A1 enviado e eSocial testado no ambiente **produção restrita** antes de ir para produção
- [ ] Tabelas da folha conferidas (INSS, IRRF, salário mínimo do ano)
- [ ] Backup diário funcionando **e** cópia externa agendada; uma restauração de teste feita
- [ ] Cliente e sistema cadastrados na **Nexor Central**, `NEXOR_*` no `.env` e o sistema aparecendo **no ar** na Central
- [ ] Na aba **Nexor · desenvolvedor**, escondido o que o cliente não contratou ou não deve alterar
- [ ] Contrato assinado com SLA de suporte, cláusula de tratamento de dados (LGPD) e cláusula de suspensão por falta de pagamento
