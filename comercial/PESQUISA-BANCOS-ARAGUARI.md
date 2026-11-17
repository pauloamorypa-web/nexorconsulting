# Pesquisa · integração com bancos (Araguari e Brasil)

Data da pesquisa: 17/11/2026. Fontes com link em cada seção.
Regra: o que não foi achado em fonte está marcado como **não confirmado**. Confira tudo no portal oficial antes de prometer a cliente.

---

## 1. Bancos e cooperativas em Araguari (MG)

| Instituição | Presença em Araguari | Evidência |
|---|---|---|
| Banco do Brasil | Sim. Av. Tiradentes, Centro | [Guia Fácil](https://guiafacil.com/encontre/bancos/araguari/mg) |
| Caixa | Sim. Duas agências: Av. Tiradentes, 381 e Av. Senador Melo Viana, 860 (segunda agência inaugurada). Há também posto na Av. Batalhão Mauá, 1326 | [Serasa (CNPJ)](https://empresas.serasaexperian.com.br/consulta-gratis/CAIXA-ECONOMICA-FEDERAL-00360305009675), [Gazeta do Triângulo](https://gazetadotriangulo.com.br/caixa-economica-federal-inaugura-nova-agencia-em-araguari/), [lista de postos CEF (MG)](https://sigconsaida.mg.gov.br/wp-content/uploads/arquivos/padronizacao/postos_atendimento_cef.pdf) |
| Itaú | Sim. Rua Rui Barbosa, Centro | [Guia Fácil](https://guiafacil.com/encontre/bancos/araguari/mg) |
| Bradesco | Sim. Agência 506, Rua Rui Barbosa, 46 | [Econodata](https://www.econodata.com.br/consulta-empresa/60746948071214-banco-bradesco-sa), [Ache Agência](https://acheagencia.com.br/caixa-eletronico/banco-bradesco-agencia-506-telefone-endereco-araguari-mg/) |
| Santander | Sim. Agência 3028, Av. Tiradentes, 310 | [Agência do Banco](https://www.agenciadobanco.com.br/agencia-3028-santander), [Serasa (CNPJ)](https://empresas.serasaexperian.com.br/consulta-gratis/BANCO-SANTANDER-BRASIL-SA-90400888179606) |
| Banco Mercantil | Sim. Rua Rui Barbosa, Centro | [Guia Fácil](https://guiafacil.com/encontre/bancos/araguari/mg) |
| **Sicoob Aracoop** | Sim. Cooperativa fundada em Araguari (1999); está entre as 11 maiores do sistema Sicoob | [Sicoob Aracoop](https://www.sicoob.com.br/web/sicoobaracoop/sicoob-aracoop), [notícia 2026](https://www.sicoob.com.br/web/sicoobaracoop/noticias/-/asset_publisher/xAioIawpOI5S/content/sicoob-aracoop-registra-resultado-financeiro-superior-a-r-100-milh%C3%B5es-em-2025-e-refor%C3%A7a-solidez-financeira-durante-ago-em-araguari) |
| **Sicoob Aracredi** | Sim. Sede em Araguari; contatos listam sede e ponto de atendimento na Av. Senador Melo Viana, 255 | [Sicoob Aracredi](https://www.sicoob.com.br/web/sicoobaracredi/sicoob-aracredi), [contatos](https://www.sicoob.com.br/web/sicoobaracredi/contatos) |
| Unicred | Sim. Rua Coronel Lindolfo França, Centro | [Guia Fácil](https://guiafacil.com/encontre/bancos/araguari/mg) |
| Sicredi | Araguari está na área da Sicredi Planalto RS/MG. Endereço de agência **não confirmado** | [Sicredi Planalto RS/MG](https://www.sicredi.com.br/coop/planalto-rs-mg/a-cooperativa/), [expansão Triângulo](https://www.sicredi.com.br/coop/planalto-rs-mg/noticias/institucional/com-42-novas-agencias-em-2024-sicredi-chega-duas-mil-cidades-do-pais/) |
| Cresol | **Não encontrado** em Araguari | buscas sem resultado |

Obs.: diretórios comerciais podem estar velhos (o Guia Fácil ainda lista HSBC, que não existe mais). Confirmar no app de cada banco.

### Bancos digitais muito usados por PME
Inter, Nubank PJ, C6, Cora, PagBank, Mercado Pago, Asaas, Stone aparecem nos comparativos de conta PJ.
Fontes: [Contabilizei](https://www.contabilizei.com.br/contabilidade-online/abrir-conta-digital-pj/), [Sebrae PR](https://sebraepr.com.br/comunidade/artigo/qual-melhor-banco-para-abrir-conta-pj-em-2025-veja-o-ranking), [Tactus](https://tactus.com.br/melhor-conta-pj-digital-gratuita/), [Wise](https://wise.com/br/blog/melhor-banco-online-pj).
Não achei pesquisa com participação de mercado por PME. A ordem acima não é ranking.

---

## 2. Lista final (12) e o que cada um tem de API

Critério: os 6 grandes com agência na cidade, as 2 marcas de cooperativa locais, o Mercantil (local) e 3 digitais com API aberta a PME.

### Tabela resumo

| # | Banco | API Pix padrão BC (/cob, /cobv, /pix, webhook) | mTLS | Boleto por API | Extrato por API | Pagamento salário/fornecedor |
|---|---|---|---|---|---|---|
| 1 | Banco do Brasil | Sim | Sim | Sim (API Cobrança) | Sim (API Extratos) | CNAB 240 sim; API de lotes existe |
| 2 | Caixa | Sim (manual Pix Automático cita /cob, /cobv, /cobr no padrão Bacen) | não confirmado | Sim (webservice XML SIGCB) | Sim segundo Kobana | CNAB 240 sim |
| 3 | Itaú | Sim (Pix Recebimentos) | Sim | Sim (API de boletos) | Sim segundo Kobana | CNAB 240 (SISPAG) sim; SISPAG por API sob pedido |
| 4 | Bradesco | Sim | Sim | Sim (API Cobrança v1.6.4) | Sim segundo Kobana | CNAB 240 (Multipag) sim |
| 5 | Santander | Sim | Sim | Sim (gestão de boletos) | Sim segundo Kobana | CNAB 240 sim (segundo Kobana: pagamentos) |
| 6 | Sicoob (Aracoop/Aracredi) | Sim | Sim | Sim (Cobrança Bancária v3) | Sim segundo Kobana | CNAB 240 sim (guia oficial) |
| 7 | Sicredi | Sim | Sim | Sim segundo Kobana | Sim segundo Kobana | CNAB 240 fornecedores sim (layout v15.3) |
| 8 | Mercantil | **Não confirmado** | — | Só arquivo (EDI/CNAB) segundo Kobana | não confirmado | não confirmado |
| 9 | Inter | Sim (/pix/v2/cob) | Sim | Sim (/cobranca/v2/boletos) | Sim (/banking/v2/extrato) | Pix/pagamento por API |
| 10 | C6 | Sim (API Pix e Pix Automático; padrão BC não confirmado) | não confirmado | Sim | Sim | Agendamento de pagamentos por API |
| 11 | Cora | Não é API Pix BC; boleto com QR Pix | Sim (mTLS na integração direta) | Sim | Sim | Transferência e pagamento por API |
| 12 | Asaas | Não é padrão BC; API própria REST | Não (chave de API) | Sim | Sim (extrato da conta Asaas) | Transferência/Pix por API |

Fora da tabela: **Nubank PJ** não tem API oficial para empresas (há só pedidos de clientes na comunidade e NuPay for Business para checkout) ([comunidade Nubank](https://comunidade.nubank.com.br/sugestoes-ideias/post/api-oficial-do-nubank-para-desenvolvedores-LTEXHSz8me8nKtW), [Woovi](https://woovi.com/artigos/api-do-nubank-como-a-woovi-pode-ser-a-solucao-que-voce-procura/), [NuPay](https://docs.nupaybusiness.com.br/checkout/docs/openapi/index.html)). Mercado Pago, PagBank e Stone têm API própria de pagamento; não pesquisei a fundo.

### O padrão da API Pix é o mesmo entre bancos?
- **Recebimento (cob, cobv, pix recebidos, webhook): sim.** O Banco Central publica a especificação ([bacen/pix-api](https://github.com/bacen/pix-api)). Os bancos seguem os mesmos caminhos e JSON. Todos usam OAuth2 *client credentials* com certificado (mTLS).
- **O que muda por banco:** URL base, URL do token, nomes de escopo, cabeçalhos extras (ex.: `gw-dev-app-key` no BB, `x-inter-conta-corrente` no Inter) e como se gera o certificado.
- **Envio de Pix (pagar) não tem padrão Bacen.** Cada banco faz o seu. Fonte: [discussão #480 no repositório do Bacen](https://github.com/bacen/pix-api/discussions/480).

### URLs públicas encontradas

| Banco | Produção | Homologação | Token OAuth | Portal |
|---|---|---|---|---|
| BB | `https://api-pix.bb.com.br/pix/v2` | `https://api-pix.hm.bb.com.br/pix/v2` | `https://oauth.bb.com.br/oauth/token` (homolog: `oauth.hm.bb.com.br/oauth/token`) | [developers.bb.com.br](https://bb.com.br/site/developers/) |
| Bradesco | `https://qrpix.bradesco.com.br` | `https://qrpix-h.bradesco.com.br` | `…/auth/server/oauth/token` | [api.bradesco](https://api.bradesco/) |
| Itaú | `secure.api.itau/pix_recebimentos` (migrando para `secure.gateway.api.itau`) | não confirmado | `https://sts.itau.com.br/api/oauth/token` | [devportal.itau.com.br](https://devportal.itau.com.br/api-certificates-expiration-2026) |
| Santander | `trust-pix.santander.com.br` (não confirmado em doc oficial) | `trust-open-h.api.santander.com.br` (sob pedido ao gerente Cash) | não confirmado | [developer.santander.com.br](https://developer.santander.com.br/api/documentacao/pix#/) |
| Sicoob | `https://api.sicoob.com.br/pix/api/v2` | sandbox no portal | `https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token` | [developers.sicoob.com.br](https://developers.sicoob.com.br/portal/) |
| Sicredi | `https://api-pix.sicredi.com.br/api/v2` | `api-pix-h.sicredi.com.br` | `https://api-pix.sicredi.com.br/oauth/token` | [developer.sicredi.com.br](https://www.sicredi.com.br/site/pixpj/api-pix/) |
| Caixa | `https://api.caixa.gov.br:8443/servicos-bancarios/requisicoes/pix-automatico` | `…:8443/sandbox/…` | não confirmado | [manual técnico](https://www.caixa.gov.br/empresa/pagamentos-recebimentos/recebimentos/pix-automatico/Documents/api-pix-automatico-manual-tecnico.pdf) |
| Inter | `https://cdpj.partners.bancointer.com.br` | não confirmado | `https://cdpj.partners.bancointer.com.br/oauth/v2/token` | [developers.inter.co](https://developers.inter.co/) |
| C6 | não confirmado | não confirmado | não confirmado | [developers.c6bank.com.br](https://developers.c6bank.com.br/) |
| Cora | `matls-clients.api.cora.com.br` (stage: `matls-clients.api.stage.cora.com.br`) | stage | não confirmado | [developers.cora.com.br](https://developers.cora.com.br/) |
| Asaas | `https://api.asaas.com/v3` | `https://api-sandbox.asaas.com/v3` | não usa (chave de API) | [docs.asaas.com](https://docs.asaas.com/docs/visao-geral) |

Fontes das URLs: BB (suporte Celcoin, "Configuração do Pix BB", e [ACBr](https://www.projetoacbr.com.br/forum/topic/83809-pix-do-bb-parou/)); Bradesco ([manual API Pix 2.0.0](https://banco.bradesco/pix/assets/docs/api_pix_200.pdf)); Itaú ([aviso oficial](https://devportal.itau.com.br/api-certificates-expiration-2026), [ACBr](https://www.projetoacbr.com.br/forum/topic/78074-erro-na-autentica%C3%A7%C3%A3o-do-token-pix-banco-ita%C3%BA/), [Cigam](https://www.cigam.com.br/wiki/index.php?oldid=160457)); Santander ([ACBr](https://www.projetoacbr.com.br/forum/topic/76632-alteração-do-endpoint-api-santander-para-testes/)); Sicoob ([ACBr](https://www.projetoacbr.com.br/forum/topic/76085-pixcd-parou-de-funciona-com-sicoob-itau-e-banco-do-brasil-na-ultima-atualiza%C3%A7%C3%A3o/), [Postman Sicoob](https://documenter.getpostman.com/view/20565799/Uzs6yNhe)); Sicredi ([guia técnico 2026](https://www.sicredi.com.br/media/produtos/filer_public/2026/01/13/guia_tecnico_integracoes_apipix.pdf), [ACBr](https://www.projetoacbr.com.br/forum/topic/77849-eacbrpixhttpexception-erro-http-500-metodo-post-url-httpsapi-pix-hsicredicombroauthtoken/)); Inter ([exemplo de código](https://example-code.com/js/banco_inter_oauth2_client_credentials.asp), [Jentic](https://jentic.com/apis/inter)); Cora ([docs](https://developers.cora.com.br/docs/utiliza%C3%A7%C3%A3o-das-apis)); Asaas ([docs](https://docs.asaas.com/reference/create-new-payment)).

### Detalhes por banco (boleto, extrato, pagamentos)
- **BB:** escopos `cob.write cob.read pix.read pix.write`. A partir de 15/09/2026 o BB confere se os escopos batem com as APIs liberadas ([Cigam](https://www.cigam.com.br/wiki/index.php/Open_Banking_Banco_do_Brasil:_Evite_interrup%C3%A7%C3%B5es_nas_integra%C3%A7%C3%B5es_de_Cobran%C3%A7a_com_o_Banco_do_Brasil:_Revise_o_Scope_das_credenciais_at%C3%A9_15/09/2026)). API de Extratos só de conta corrente ([BB](https://bb.com.br/site/developers/api-extratos/)).
- **Caixa:** boleto por webservice XML em `barramento.caixa.gov.br/sibar/...` ([leiaute](https://www.caixa.gov.br/Downloads/cobranca-caixa/WEBSERVICE-XML-COBRANCA-BANCARIA.pdf)). Salário e fornecedor em CNAB 240 ([manual](https://www.caixa.gov.br/Downloads/pagamentos-de-salarios-fornecedores-e-auto-pagamento/Leiaute_CNAB240_Pagamentos_e_Debito_Automatico.pdf)). Cobra tarifa sobre Pix de PJ ([bpmoney](https://bpmoney.com.br/?p=132012)).
- **Itaú:** API de boletos ([Fortes](https://ajuda.fortestecnologia.com.br/kb/pt-br/article/434033/api-cobranca-itau), [Cielo](https://docs.cielo.com.br/atendimento/docs/como-configurar-o-boleto-registrado-ita%C3%BA-api)). SISPAG CNAB 240 com tipo 30 = salários, 20 = fornecedores ([SISPAG](https://download.itau.com.br/bankline/SISPAG_CNAB.pdf)).
- **Bradesco:** API Cobrança ([manual 1.6.4](https://assets.bradesco/content/dam/portal-bradesco/gestao-api-payments/API_Cobran%C3%A7a_DOWNLOAD_V1.6.4.pdf)). Multipag CNAB 240 para salários e fornecedores ([layouts](https://banco.bradesco/html/pessoajuridica/solucoes-integradas/outros/layout-de-arquivo.shtm), [Multipag](https://banco.bradesco/html/pessoajuridica/solucoes-integradas/pagamentos/multipag.shtm)).
- **Santander:** Pix e boleto por API ([portal](https://developer.santander.com.br/), [Santander Empresas](https://www.santander.com.br/empresas/cash/api)).
- **Sicoob:** guia CNAB 240 de pagamentos e transferências ([guia](https://www.sicoob.com.br/documents/20128/1635942/Guia+de+importacao+de+arquivos+CNAB+240+Piloto.pdf/53ce530c-54ee-7952-32fb-3e5f2f2a57a9?version=2.0&t=1747666535910&download=true)). Pix com mTLS (RFC 8705) ([Tecnospeed](https://atendimento.tecnospeed.com.br/hc/pt-br/article_attachments/10402422907799)).
- **Sicredi:** CNAB 240 fornecedores v15.3 ([Sicredi](https://www.sicredi.com.br/site/pagamentos/para-empresa/pagamento-fornecedores/)). Integração da API Pix gratuita; tarifa do Pix com a cooperativa ([Sicredi](https://www.sicredi.com.br/site/pixpj/api-pix/)).
- **Inter:** Pix, boleto e extrato no mesmo portal; mTLS obrigatório ([MCP Banco Inter](https://mcpservers.org/es/servers/samuelmoraesf/mcp-banco-inter), [Inter API Banking](https://inter.co/empresas/api-banking/)).
- **C6:** APIs de Boleto, Pix, Pix Automático, Extrato, Agendamento de pagamentos, integração sem custo ([C6](https://www.c6bank.com.br/apis-integracao/)).
- **Cora:** boleto, boleto com QR Pix, transferência, pagamento, extrato ([Cora](https://developers.cora.com.br/)).
- **Asaas:** cobrança por Pix, boleto, cartão; webhooks; sandbox. Tarifas públicas: boleto ou Pix recebido R$ 2,15 (promo R$ 1,08); cartão à vista R$ 0,49 + 2,99%; sem mensalidade ([preços](https://www.asaas.com/precos-e-taxas)).
- **Visão geral por banco (API x arquivo):** [Kobana](https://www.kobana.com.br/en/integrations/banks) lista BB, Caixa, Itaú, Bradesco, Santander e Sicoob com API + EDI para boleto, Pix, pagamentos, transferências e extrato; Sicredi com boleto, Pix e extrato; Mercantil só EDI para boleto; Inter API Pix e extrato; Cora API boleto.

---

## 3. Open Finance (ler extrato de várias contas)

| Agregador | Preço público | O que cobre | Fonte |
|---|---|---|---|
| Pluggy | Dados: a partir de **R$ 2.500/mês** (até 500 conexões ativas). Pagamentos Pix: a partir de R$ 500/mês. Sandbox grátis; teste em produção 15 dias. "Meu Pluggy" grátis só para contas do próprio titular (até 5 conexões, sem uso comercial) | Extrato, saldo, cartão, investimentos de cerca de 220 instituições num JSON único; Open Finance regulado e conexão direta | [preços](https://www.pluggy.ai/precos), [Meu Pluggy](https://www.pluggy.ai/meu-pluggy), [conectores](https://www.pluggy.ai/produtos/conectores-de-dados) |
| Belvo | Plano Launch **US$ 1.000/mês**; Growth sob consulta; sandbox grátis | Dados e pagamentos Open Finance na América Latina; iniciação de Pix | [planos](https://belvo.com/plans-and-pricing/), [Pix](https://belvo.com/blog/belvo-launches-open-finance-payment-initiation-leverage-pix-brazil/) |
| Klavi | Sem preço público | Foco em crédito: renda, despesas, score via Open Finance | [Klavi](https://klavi.ai/) |
| Quanto | Sem preço público encontrado | Dados e iniciação de pagamento | [LatamFintech](https://www.latamfintech.co/articles/open-finance-platform-belvo-now-offers-payment-initiation-service-in-brazil) |
| Iniciador | Sem preço público | Infraestrutura de iniciação de pagamento (ITP) para instituições e plataformas | [Iniciador](https://iniciador.com.br/) |

Resumo: Open Finance resolve leitura de extrato de muitos bancos de uma vez, mas o preço mínimo (R$ 2.500/mês na Pluggy) só fecha com vários clientes. Para começar, OFX é mais barato.

---

## 4. Extrato em arquivo (OFX / CSV)

| Banco | OFX no internet banking PJ | Fonte |
|---|---|---|
| Banco do Brasil | Sim ("Money 2000+"); histórico costuma ser 60 dias | [Projete](https://www.projete.app.br/guias/como-exportar-extrato-ofx-do-banco) |
| Caixa | Sim | [DigiConts](https://ajuda.digiconts.com.br/ajuda/ferramentas/como-exportar-extrato-ofx-do-seu-banco/) |
| Itaú | Sim (pelo computador) | [Projete](https://www.projete.app.br/guias/como-exportar-extrato-ofx-do-banco) |
| Bradesco | Sim | [Projete](https://www.projete.app.br/guias/como-exportar-extrato-ofx-do-banco) |
| Santander | Sim ("Money 2000") | [Projete](https://www.projete.app.br/guias/como-exportar-extrato-ofx-do-banco) |
| Sicoob | Sim (Sicoobnet PJ) | [Controle Ágil](https://controleagil.com.br/blog/importar-extrato-bancario-ofx) |
| Sicredi | Sim | [Controle Ágil](https://controleagil.com.br/blog/importar-extrato-bancario-ofx) |
| Inter | Sim | [Projete](https://www.projete.app.br/guias/como-exportar-extrato-ofx-do-banco) |
| C6 | Sim (app PJ) | [Controle Ágil](https://controleagil.com.br/blog/importar-extrato-bancario-ofx) |
| Mercantil, Cora, Asaas | **Não confirmado** | — |
| Nubank | App limita; pode pedir por atendimento | [DigiConts](https://ajuda.digiconts.com.br/ajuda/ferramentas/como-exportar-extrato-ofx-do-seu-banco/) |

CSV: não achei fonte confiável por banco. Tratar CSV como formato de cada banco (sem padrão). OFX é o formato universal.
Obs.: o app de celular costuma exportar só PDF; OFX sai pelo computador ([Fortes](https://fortestecnologia.movidesk.com/kb/pt-br/article/568638/guia-completo-como-exportar-extrato-em-ofx-banco-do-brasil-e-ita)).

---

## 5. Recomendação (mais barata e realista)

Montar em camadas, da mais barata para a mais cara:

1. **Importador OFX (dia 1, custo zero).** Lê extrato de quase todos os bancos da lista. Conciliação por upload. Serve para todo cliente.
2. **Adaptador único da API Pix do BC.** Um só código para /cob, /cobv, /pix e webhook. Por banco muda só uma configuração: URL base, URL do token, escopos, cabeçalho extra e certificado. Começar por Sicoob, BB, Sicredi, Bradesco, Itaú, Santander e Inter. Envio de Pix fica fora (não há padrão).
3. **Gerador e leitor CNAB 240 FEBRABAN.** Remessa de salários e fornecedores e retorno de pagamento. Uma base com "dialetos" por banco (SISPAG, Multipag, Sicoob, Sicredi, Caixa). Layout padrão: [FEBRABAN 240 v10.11](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Layout%20padrao%20CNAB240%20V%2010%2011%20-%2021_08_2023.pdf).
4. **Asaas para boleto e cartão** de quem não quer contrato de cobrança no banco. Sem mensalidade, tarifa por uso, API simples com chave e webhook.
5. **Agregador Open Finance (Pluggy) só depois**, quando houver clientes suficientes para pagar o mínimo de R$ 2.500/mês. Até lá, OFX cobre.

Alternativa paga a avaliar: [Kobana](https://www.kobana.com.br/en/integrations/banks) já integra 40+ bancos por API e CNAB (não pesquisei preço).

### Segurança (segue `docs/base/03-PADROES-REUTILIZAVEIS.md`)
- Certificado e chave do cliente guardados com AES-GCM, nunca no repositório nem no chat.
- Webhook Pix: conferir assinatura/mTLS e tratar com idempotência (mesmo `txid`/`endToEndId` não lança duas vezes).
- Lançamento de dinheiro atômico e idempotente. Isolamento por empresa em toda consulta. Auditoria com usuário, data e IP.
- Certificados vencem (ex.: Itaú passa a usar cadeia com validade de 200 dias): alertar antes do vencimento.

### Pendências para confirmar
- Endereço da Sicredi em Araguari.
- API Pix do Mercantil (não achei).
- URLs oficiais de Santander, C6 e Caixa (Pix de cobrança comum, não só Pix Automático).
- Se Caixa exige mTLS.
