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

/* ---------- Biometria: chave do aparelho liberada pela digital ou rosto ---------- */

/* A chave fica no chip de segurança do celular (Android Keystore / Secure Enclave do iPhone), pelo
   plugin próprio ChaveSegura. A chave privada nunca sai do chip e só assina depois da digital ou do
   rosto do dono: nem um celular com root consegue registrar o ponto sem a biometria. */
const chip = () => P().ChaveSegura;

export async function biometriaDisponivel() {
  try {
    return Boolean((await chip().disponivel()).disponivel);
  } catch {
    return false;
  }
}

const guardar = (chave, valor) => P().SecureStorage.internalSetItem({ prefixedKey: chave, data: valor, sync: false, access: 1 });
const ler = async (chave) => (await P().SecureStorage.internalGetItem({ prefixedKey: chave, sync: false }).catch(() => ({ data: null }))).data;
const apagar = (chave) => P().SecureStorage.internalRemoveItem({ prefixedKey: chave, sync: false }).catch(() => {});

const erroChip = (e) => {
  if (e?.code === "cancelado") return new Error("Biometria cancelada. Toque de novo para registrar.");
  if (e?.code === "chave_invalidada" || e?.code === "sem_chave") return Object.assign(new Error("A biometria do celular mudou. Ative a digital ou o rosto do ponto de novo."), { recadastrar: true });
  return new Error(e?.message || "A digital ou o rosto não foram confirmados.");
};

/** Cria a chave no chip do celular e devolve a parte pública para o servidor */
export async function criarChaveAparelho() {
  let r;
  try {
    r = await chip().criar();
  } catch (e) {
    throw erroChip(e);
  }
  const id = b64url(crypto.getRandomValues(new Uint8Array(18)));
  await guardar(ID, id);
  await apagar(CHAVE); // chave antiga (fora do chip), se existir
  return { id, chave: { kty: "EC", crv: "P-256", x: r.x, y: r.y }, hardware: Boolean(r.hardware), strongbox: Boolean(r.strongbox) };
}

/** Assina o desafio do servidor com a chave do chip; o próprio sistema pede a digital ou o rosto */
export async function assinarComBiometria(desafio, idsValidos) {
  const id = await ler(ID);
  if (!id || !idsValidos.includes(`ap:${id}`)) return null;
  try {
    const r = await chip().assinar({ desafio, motivo: "Confirme para registrar o ponto" });
    return { id: `ap:${id}`, assinatura: r.assinatura };
  } catch (e) {
    throw erroChip(e);
  }
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
