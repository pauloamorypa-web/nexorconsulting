/* Recursos nativos quando o app roda instalado pela App Store ou Google Play (Capacitor).
   No navegador (PWA) nada disso é usado: valem WebAuthn, BarcodeDetector e a geolocalização do navegador.
   Os plugins são chamados direto pela ponte nativa do Capacitor (window.Capacitor.Plugins). */

const C = window.Capacitor;
export const nativo = Boolean(C?.isNativePlatform?.());
export const plataforma = nativo ? C.getPlatform() : "web";
const P = () => C.Plugins;

const CHAVE = "nexor_ponto_chave";
const ID = "nexor_ponto_id";
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ---------- Biometria: chave do aparelho liberada pela digital ou rosto ---------- */

export async function biometriaDisponivel() {
  try {
    const r = await P().BiometricAuthNative.checkBiometry();
    return Boolean(r.isAvailable);
  } catch {
    return false;
  }
}

async function confirmarDigital(motivo) {
  try {
    await P().BiometricAuthNative.internalAuthenticate({ reason: motivo, cancelTitle: "Cancelar", androidTitle: "Meu Ponto", androidSubtitle: motivo, allowDeviceCredential: false, androidConfirmationRequired: false });
  } catch (e) {
    throw new Error(/cancel/i.test(`${e.code} ${e.message}`) ? "Biometria cancelada. Toque de novo para registrar." : "A digital ou o rosto não foram confirmados.");
  }
}

const guardar = (chave, valor) => P().SecureStorage.internalSetItem({ prefixedKey: chave, data: valor, sync: false, access: 1 });
const ler = async (chave) => (await P().SecureStorage.internalGetItem({ prefixedKey: chave, sync: false }).catch(() => ({ data: null }))).data;

/** Cria a chave do aparelho (depois de confirmar a digital) e devolve a parte pública para o servidor */
export async function criarChaveAparelho() {
  await confirmarDigital("Confirme para ativar o ponto com biometria");
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privada = b64url(await crypto.subtle.exportKey("pkcs8", par.privateKey)).replace(/-/g, "+").replace(/_/g, "/");
  const publica = await crypto.subtle.exportKey("jwk", par.publicKey);
  const id = b64url(crypto.getRandomValues(new Uint8Array(18)));
  await guardar(CHAVE, privada);
  await guardar(ID, id);
  return { id, chave: { kty: publica.kty, crv: publica.crv, x: publica.x, y: publica.y } };
}

/** Assina o desafio do servidor com a chave do aparelho, só depois da digital ou do rosto */
export async function assinarComBiometria(desafio, idsValidos) {
  const id = await ler(ID);
  const privada = await ler(CHAVE);
  if (!id || !privada || !idsValidos.includes(`ap:${id}`)) return null;
  await confirmarDigital("Confirme para registrar o ponto");
  const chave = await crypto.subtle.importKey("pkcs8", deB64(privada), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(desafio));
  return { id: `ap:${id}`, assinatura: b64url(assinatura) };
}

/* ---------- QR Code e localização ---------- */

/** Abre o leitor de QR e devolve o endereço lido (URL) */
export async function escanearUrl(instrucao) {
  const r = await P().CapacitorBarcodeScanner.scanBarcode({ hint: 0, scanInstructions: instrucao, scanButton: false, scanText: " ", cameraDirection: 1, scanOrientation: 1 }).catch((e) => {
    if (/cancel/i.test(`${e.code} ${e.message}`)) return null;
    throw new Error(/permiss|denied|camera/i.test(e.message) ? "Permita o uso da câmera nos Ajustes do celular para ler o QR Code." : "Não foi possível abrir a câmera.");
  });
  try {
    return r?.ScanResult ? new URL(r.ScanResult) : null;
  } catch {
    return null;
  }
}

/** QR do quiosque: devolve o token e o servidor de onde ele veio */
export async function lerQrNativo() {
  const u = await escanearUrl("Aponte para o QR Code do quiosque de ponto");
  const q = u?.searchParams.get("q");
  return q ? { q, origem: u.origin } : null;
}

/* ---------- Sessão e servidor da empresa (app das lojas) ---------- */
const SESSAO = "nexor_ponto_sessao";
export const guardarSessao = (token) => guardar(SESSAO, token);
export const lerSessao = () => ler(SESSAO);
export const apagarSessao = () => P().SecureStorage.internalRemoveItem({ prefixedKey: SESSAO, sync: false }).catch(() => {});
export const servidorSalvo = () => {
  try {
    return localStorage.getItem("nx-servidor");
  } catch {
    return null;
  }
};
export const salvarServidor = (url) => {
  try {
    url ? localStorage.setItem("nx-servidor", url) : localStorage.removeItem("nx-servidor");
  } catch {
    /* sem armazenamento */
  }
};

export async function localizarNativo() {
  const geo = P().Geolocation;
  const perm = await geo.requestPermissions({ permissions: ["location"] }).catch(() => ({ location: "granted" }));
  if (perm.location === "denied") throw new Error("Permita o acesso à localização nos Ajustes do celular para registrar o ponto.");
  const p = await geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 20000 });
  return { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy };
}

/** QR Code lido pela câmera do celular abre o app (App Links / Universal Links) */
export function aoAbrirLink(fn) {
  if (!nativo) return;
  P().App.addListener("appUrlOpen", ({ url }) => {
    try {
      const q = new URL(url).searchParams.get("q");
      if (q) fn(q);
    } catch {
      /* link sem QR */
    }
  });
}
