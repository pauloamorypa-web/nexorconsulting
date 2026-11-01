/* Configuração do site da Nexor */

// Endereço do servidor da Blue (pasta agent/). Com ele preenchido:
// a Blue responde com IA, os leads chegam para a equipe e o teste do Atende IA usa IA de verdade.
// Vazio: a Blue faz um atendimento guiado e os leads ficam guardados no navegador até o servidor existir.
const NEXOR_API_URL = "";

// WhatsApp da Nexor (DDI + DDD + número, só dígitos)
const WHATSAPP_NUMBER = "5534997337499";

// E-mail no domínio (aparece no rodapé quando preenchido). Ex.: "contato@nexorconsultingit.com.br"
const NEXOR_EMAIL = "";

// Campanhas: preencha com os códigos das plataformas. Vazio = desligado.
const RASTREIO = {
  metaPixel: "", //        Gerenciador de Eventos da Meta → ID do conjunto de dados (só números)
  ga4: "", //              Google Analytics → Fluxo de dados → ID da métrica (G-XXXXXXX)
  googleAds: "", //        Google Ads → Metas → Conversões → tag (AW-XXXXXXXXX)
  googleAdsLead: "", //    rótulo da conversão de lead (AW-XXXXXXXXX/AbCdEf...)
  googleAdsQuente: "", //  rótulo da conversão de lead quente (opcional)
};

const whatsUrl = (msg) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
