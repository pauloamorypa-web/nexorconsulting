/* Opt-in explícito no texto do próprio contato; o modelo não pode concedê-lo pelo cliente. */
export function confirmouLembreteWhatsApp(texto) {
  const t = String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/\bwhats\s*app\b/.test(t) || !/\blembrete(?:s)?\b/.test(t)) return false;
  if (/\b(nao|sem|pare|cancele|cancelar|stop)\b/.test(t)) return false;
  return /\b(aceito|autorizo|concordo|quero receber|pode enviar|pode mandar|pode me avisar)\b/.test(t);
}

export function pedidoOptOutWhatsApp(texto) {
  const t = String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /^\s*(parar|pare|sair|stop|cancelar|cancele|remover|descadastrar)\b/.test(t) ||
    /\b(nao quero|nao me envie|nao envie|pare de enviar|cancele|cancelar|quero cancelar|quero parar)\b.{0,80}\b(lembrete|whatsapp|mensagem)/.test(t);
}

export function pedidoCancelarReuniao(texto) {
  const t = String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bnao\s+(quero|vou|preciso)\s+(cancelar|desmarcar)\b/.test(t)) return false;
  return /\b(cancelar|cancele|desmarcar|desmarque|cancelamento)\b.{0,80}\b(reuniao|apresentacao|diagnostico)\b/.test(t) ||
    /\b(reuniao|apresentacao|diagnostico)\b.{0,80}\b(cancelar|cancele|desmarcar|desmarque)\b/.test(t);
}
