# Nexor Elo · Modo Demonstração

`npm run demo` → abra `http://localhost:8796/demo`. Dados fictícios, só nesta máquina (escuta em 127.0.0.1); Receita (CNPJ), Asaas, Focus NFe, WhatsApp e e-mail são simulados e qualquer outra conexão externa é bloqueada. `DEMO_RESET=1` (já no `npm run demo`) remonta tudo do zero; o botão "Reiniciar demonstração" (`POST /api/demo/reiniciar`) volta ao original sem reiniciar o servidor.

## Papéis (senha `demo-elo-2026`)
| Papel | Quem | Para mostrar |
|---|---|---|
| `fornecedor_dono` | Marcos Vieira · Distribuidora Vigia Forte (Araguari/MG) | reservas, propostas por status, vínculos, crédito, repasses, score |
| `fornecedor_comercial` | Patrícia Lemos | catálogo, tabelas, aprovar o pedido da Conecta Redes |
| `fornecedor_financeiro` | Sérgio Antunes | títulos, Eletro Rocha bloqueada por título vencido |
| `fornecedor2_dono` | Helena Prado · Elétrica Triângulo (Uberlândia/MG) | segundo fornecedor do comparador; sem conta de split (títulos) |
| `instalador_dono` | Diego Martins · Instala Seg Araguari | propostas, comparador, kits, calculadora, OS, contratos |
| `instalador_tecnico` | Rafael Souza | só as OS dele: checklist, fotos, série, assinatura |
| `nexor` | Operação Nexor | aprovar fornecedores, métricas |
| `cliente` | cliente final | página pública da proposta: ver, aceitar, pagar |

## Roteiro de 10 minutos
1. **A dor (1 min).** "Hoje o instalador liga para o distribuidor, monta orçamento no Word, o cliente aprova e o material já acabou; o dinheiro passa todo pela conta dele e o distribuidor corre atrás do pagamento."
2. **Instalador (3 min).** Entre como `instalador_dono`. Comparador: busque `CAM-BL-1080` e mostre os dois fornecedores com preço da tabela dele, estoque e prazo. Aplique o kit "CFTV 4 câmeras" numa proposta nova, rode a calculadora (Simples anexo III 6%) e veja o lucro líquido real. Envie: o estoque fica reservado por 5 dias.
3. **Cliente (2 min).** Entre como `cliente`: proposta bonita, sem login, sem custo nem fornecedor visíveis. Aceite (nome, data e IP) e clique em pagar (Pix).
4. **O "uau" (2 min).** Em outra aba, `fornecedor_dono`. Clique em "Simular pagamento" (`POST /api/demo/pagar`): a proposta vira paga, o estoque sai, o repasse do split aparece em Repasses. Mostre que o fornecedor vê o instalador, os itens dele e a cidade/UF da obra, **nunca o cliente** (LGPD).
5. **Crédito e risco (1 min).** `fornecedor_financeiro`: Eletro Rocha com título vencido está bloqueada automaticamente; o score do instalador mostra conversão e pontualidade.
6. **Pós-venda (1 min).** `instalador_tecnico`: OS em execução hoje, checklist, foto e assinatura; o link público mostra "a caminho → em execução". Contratos de monitoramento geram receita recorrente.
