/* Prova de presença na marcação: QR Code rotativo do quiosque (HMAC por janela de tempo) e GPS (cerca virtual). */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Token do QR para uma janela de tempo: <estabelecimento>.<janela>.<assinatura> */
export function tokenQr(estabelecimento, segredo, agora = Date.now(), segundos = 30) {
  const janela = Math.floor(agora / (segundos * 1000));
  const assinatura = createHmac("sha256", segredo).update(`${estabelecimento}.${janela}`).digest("base64url").slice(0, 22);
  return `${estabelecimento}.${janela}.${assinatura}`;
}

/** Confere o token: aceita a janela atual e a anterior (tempo para escanear) */
export function conferirQr(token, buscarSegredo, agora = Date.now(), segundos = 30) {
  const [estab, janelaTxt, assinatura] = String(token ?? "").split(".");
  const janela = Number(janelaTxt);
  if (!estab || !assinatura || !Number.isInteger(janela)) return { ok: false, motivo: "QR Code inválido." };
  const atual = Math.floor(agora / (segundos * 1000));
  if (janela < atual - 1 || janela > atual) return { ok: false, motivo: "QR Code expirado. Escaneie o código que está na tela agora." };
  const segredo = buscarSegredo(estab);
  if (!segredo) return { ok: false, motivo: "QR Code de outro local." };
  const esperado = createHmac("sha256", segredo).update(`${estab}.${janela}`).digest("base64url").slice(0, 22);
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, motivo: "QR Code inválido." };
  return { ok: true, estabelecimento_id: estab };
}

/** Distância em metros entre duas coordenadas (fórmula de haversine) */
export function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Estabelecimento mais próximo e se a posição está dentro da cerca (raio + precisão do GPS, até 100 m de folga) */
export function conferirGps(estabelecimentos, lat, lng, precisao = 0) {
  const comLocal = estabelecimentos.filter((e) => e.lat !== null && e.lng !== null && e.ativo);
  if (!comLocal.length) return { ok: true, sem_cerca: true };
  if (typeof lat !== "number" || typeof lng !== "number") return { ok: false, motivo: "Ative a localização do celular para registrar o ponto." };
  const lista = comLocal.map((e) => ({ e, d: distanciaMetros(lat, lng, e.lat, e.lng) })).sort((a, b) => a.d - b.d);
  const { e, d } = lista[0];
  const folga = Math.min(Math.max(precisao, 0), 100);
  if (d > e.raio_m + folga) return { ok: false, motivo: `Você está a ${Math.round(d)} m de ${e.nome}. Registre o ponto no local de trabalho.`, distancia: d, estabelecimento_id: e.id };
  return { ok: true, distancia: d, estabelecimento_id: e.id };
}
