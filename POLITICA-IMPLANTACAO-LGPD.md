# ⚠️ Ponto de alerta: implantação e LGPD em todo sistema vendido pela Nexor

Esta regra vale para **todos** os produtos e projetos: Atende IA, RH, Gestão, Commerce, Site Pro, Automação, Sob Medida, Service Desk, Cofre, IT Platform e os que vierem.

## A regra

1. **O sistema é implantado no ambiente do cliente**, no servidor físico da empresa ou na conta de nuvem dela (AWS, Azure, Google Cloud, Render, outra). Banco de dados, arquivos e backups ficam no armazenamento do cliente.
2. **O cliente é o controlador dos dados** perante a LGPD. Ele responde por:
   - base legal;
   - avisos e política de privacidade para os titulares (clientes e colaboradores dele);
   - atendimento dos direitos dos titulares;
   - segurança do ambiente;
   - comunicação de incidentes à ANPD.
3. **A Nexor não guarda dados dos clientes.** Em suporte com acesso ao ambiente, a Nexor é **operadora**, só dentro do que o contrato permite.
4. **Contas de terceiros ficam em nome do cliente:** chaves de IA (Anthropic, OpenAI), WhatsApp/Meta, provedores de e-mail e de pagamento, certificados digitais. O contrato com esses fornecedores (e a transferência internacional, quando houver) fica no nome do cliente.
5. **Consultoria de LGPD é um serviço à parte**, vendido separadamente: mapeamento de dados, relatório de impacto, políticas, contratos com fornecedores, treinamento e plano de resposta a incidentes.
6. **Instâncias da Nexor servem só para demonstração**, com dados fictícios (ex.: `rh.nexorconsultingit.com.br`, testes grátis do site).

## O que o vendedor precisa fazer em toda venda

- [ ] Explicar que o sistema roda no ambiente do cliente e confirmar **onde** ele será implantado: servidor próprio ou nuvem, e de quem é a conta.
- [ ] Deixar claro que a responsabilidade pela LGPD é do cliente. Oferecer a **consultoria de LGPD** como item separado da proposta.
- [ ] Colocar no contrato:
  - escopo da implantação;
  - acesso para suporte;
  - cláusula de tratamento de dados (Nexor como operadora só durante o suporte);
  - confidencialidade;
  - devolução e eliminação de acessos ao fim do contrato.
- [ ] Confirmar que as contas de terceiros (IA, WhatsApp, certificado digital) serão abertas em nome do cliente.

## O que os produtos já trazem para ajudar o cliente

Os produtos trazem controle de acesso por perfil, criptografia de segredos e arquivos, registro de auditoria, consentimento nos formulários públicos e exclusão de dados de candidatos. Essas funções **ajudam** a adequação, mas não a substituem.

> Este documento orienta a equipe comercial e técnica da Nexor. Não é parecer jurídico: contratos e políticas devem ser revisados por um advogado.
