# Nexor Elo — a rede que liga fornecedores e instaladores

**Uma frase:** o instalador monta o orçamento com o estoque do fornecedor, o cliente final aprova e paga, e o dinheiro já cai separado (a parte dos produtos para o fornecedor, o serviço e a margem para o instalador), sem o fornecedor ver o cliente do instalador.

Multissegmento: segurança eletrônica, elétrica, energia solar, refrigeração/climatização, telecom/redes, hidráulica, automação. O segmento é definido pelos **CNAEs aceitos** de cada fornecedor.

## Mercado (pesquisa nov/2026)
- oHub e Loja Intelbras: só geram lead (cliente pede orçamento a instaladores). Não ligam estoque nem pagamento.
- TecGuard/Softguard, Auvo, Field Control: ordem de serviço e técnico em campo. Sem estoque do fornecedor nem split.
- ERPs (Odoo, Bling, Omie): estoque e NF do próprio negócio, não conectam a rede.
- **Ninguém faz:** orçamento do instalador com estoque reservado do fornecedor + pagamento do cliente final dividido automaticamente + privacidade do cliente + crédito/bloqueio por inadimplência. É o espaço do Elo.

## Melhorias sobre a ideia original (diferenciais Nexor)
1. **Modelo fiscal correto do "dropship":** juridicamente o instalador compra do fornecedor (NF-e do fornecedor para o instalador) e vende/presta ao cliente. O split do pagamento do cliente **liquida automaticamente a compra do instalador** junto ao fornecedor. Resultado: o fornecedor nunca precisa dos dados do cliente final e a nota fecha certinho.
2. **Privacidade por desenho (LGPD):** o fornecedor vê só o instalador, os itens, a cidade/UF da obra e o status (enviada, aceita, paga). Nome, documento, telefone e endereço do cliente final ficam só com o instalador. Garantido na API e em teste.
3. **Comparador de fornecedores:** para cada item, o app mostra os fornecedores vinculados com preço, estoque e prazo e sugere a combinação mais barata (pode dividir a proposta entre fornecedores; o split vai para cada um).
4. **Kits inteligentes:** modelos prontos por segmento ("CFTV 4 câmeras", "Kit solar 5 kWp", "Quadro de distribuição") que puxam os itens do catálogo do fornecedor.
5. **Calculadora de precificação com impostos:** custo dos produtos + mão de obra + deslocamento + margem desejada → preço final, mostrando Simples Nacional (anexo e alíquota efetiva), ISS, taxa do meio de pagamento e taxa da plataforma, e o lucro líquido real.
6. **Proposta que vende:** link bonito para o cliente final (sem login), com fotos dos produtos, garantia, condições, aceite com nome+data+IP, e pagamento por Pix, boleto ou cartão parcelado.
7. **Reserva com prazo:** ao enviar a proposta, o estoque fica reservado por N dias (fornecedor define); vence sozinho, o instalador pode renovar uma vez; o fornecedor é notificado.
8. **Crédito e bloqueio:** o fornecedor dá limite de crédito por instalador (compra a prazo para além do split); títulos vencidos bloqueiam novas reservas automaticamente; o fornecedor também pode bloquear manualmente.
9. **Score do instalador:** taxa de conversão de propostas, pagamentos em dia, volume — visível ao fornecedor para decidir crédito e tabela de preço.
10. **Ordem de serviço com acompanhamento:** checklist, fotos, assinatura do cliente, status público por link ("agendado → a caminho → em execução → concluído"), e **garantia por número de série** (pós-venda e manutenção).
11. **Receita recorrente para o instalador:** contrato de manutenção/monitoramento mensal cobrado automaticamente (Asaas assinatura).
12. **Validação de CNPJ e CNAE** no cadastro do instalador (consulta pública de CNPJ), aprovação final do fornecedor.
13. **Notificações** por WhatsApp/e-mail (proposta vista, aceita, paga, reserva vencendo, título vencido).
14. **Nota fiscal facilitada:** NFS-e do serviço do instalador e NF-e de venda do fornecedor pelo provedor (Focus NFe/PlugNotas), com os dados preenchidos a partir da proposta.

## Perfis
- **Fornecedor** (painel web): equipe com papéis dono/admin/comercial/financeiro.
- **Instalador** (app PWA no celular): dono e técnicos.
- **Cliente final** (sem conta): página pública da proposta e da OS por link com token.
- **Nexor** (operação da plataforma): aprova fornecedores, vê métricas agregadas, suporte.

## Monetização
- Fornecedor: mensalidade + taxa da plataforma por venda liquidada (no split).
- Instalador: plano grátis (limitado) e plano Pro (propostas e OS ilimitadas, NF, contratos recorrentes, marca própria na proposta).

## Arquitetura (padrão Nexor)
Node 22, `node:sqlite`, zod, servidor HTTP próprio, sem framework; painel e app em JS puro (PWA); hospedado pela Nexor (multi-inquilino: vários fornecedores e instaladores na mesma instalação). Porta 8796. Mesmo padrão de segurança dos demais: scrypt assíncrono com fila, CSRF (`x-nexor: 1`), CSP, cookies HttpOnly/SameSite, rate limit só de erros, segredos cifrados (AES-GCM), auditoria, `TRUST_PROXY=0`, LGPD. Modo Demonstração (`DEMO=1`) conforme o contrato dos outros sistemas.
