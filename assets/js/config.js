/* Configuração do site da Nexor */

// Endereço do servidor da Blue (pasta agent/). Com ele preenchido:
// a Blue responde com IA, os leads chegam para a equipe e o teste do Atende IA usa IA de verdade.
// Vazio: a Blue faz um atendimento guiado e os leads ficam guardados no navegador até o servidor existir.
const NEXOR_API_URL = "";

// WhatsApp da Nexor (DDI + DDD + número, só dígitos)
const WHATSAPP_NUMBER = "5534997337499";

const whatsUrl = (msg) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
