/* Prepara o app "Meu Ponto" para compilar:
   1. Copia as telas do app do colaborador (rh/public/app) para www/, que vai embutido no app.
   2. Gera o capacitor.config.json.

   Modelo de implantação da Nexor: cada cliente tem o Nexor RH no próprio servidor ou na própria nuvem.
   Por isso o app das lojas é um só e, na primeira vez, o colaborador conecta o app ao sistema da empresa dele
   (lendo o QR Code de ativação do RH ou digitando o endereço).

   Variáveis (opcionais):
   NEXOR_RH_URL  só para um app com a marca de UM cliente: o endereço já vem embutido e a etapa "Conectar à empresa"
                 é pulada. Deixe vazio no app genérico das lojas.
   APP_ID        identificador nas lojas (padrão br.com.nexorconsultingit.ponto)
   APP_NAME      nome que aparece no celular (padrão "Meu Ponto") */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const publico = aqui("../../public/");
const www = aqui("../www/");

const url = (process.env.NEXOR_RH_URL ?? "").trim().replace(/\/$/, "");
if (url && !url.startsWith("https://")) {
  console.error("NEXOR_RH_URL precisa começar com https:// (biometria, câmera e GPS exigem HTTPS).");
  process.exit(1);
}

/* 1. Telas embutidas no app */
const offline = existsSync(`${www}offline.html`) ? readFileSync(`${www}offline.html`) : null;
rmSync(www, { recursive: true, force: true });
mkdirSync(`${www}app`, { recursive: true });
mkdirSync(`${www}js`, { recursive: true });
mkdirSync(`${www}img`, { recursive: true });
for (const f of ["app.js", "app.css", "nativo.js", "index.html"]) cpSync(`${publico}app/${f}`, `${www}app/${f}`);
for (const f of ["api.js", "ui.js"]) cpSync(`${publico}js/${f}`, `${www}js/${f}`);
for (const f of ["logo-mark.webp", "favicon.png", "icone-192.png"]) cpSync(`${publico}img/${f}`, `${www}img/${f}`);
cpSync(`${publico}app.css`, `${www}app.css`);
// A página inicial do app é a do colaborador (sem manifest/service worker, que são só da versão web)
const inicial = readFileSync(`${publico}app/index.html`, "utf8").replace(/\s*<link rel="manifest"[^>]*>/, "").replace(/\s*<link rel="apple-touch-icon"[^>]*>/, "");
writeFileSync(`${www}index.html`, inicial);
writeFileSync(`${www}app/index.html`, inicial);
writeFileSync(`${www}app/padrao.json`, JSON.stringify(url ? { servidor: url } : {}) + "\n");
if (offline) writeFileSync(`${www}offline.html`, offline);

/* 2. Configuração do Capacitor */
const config = {
  appId: process.env.APP_ID ?? "br.com.nexorconsultingit.ponto",
  appName: process.env.APP_NAME ?? "Meu Ponto",
  webDir: "www",
  plugins: {
    SplashScreen: { launchShowDuration: 900, launchAutoHide: true, backgroundColor: "#010524", showSpinner: false },
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "never" },
};
writeFileSync(aqui("../capacitor.config.json"), JSON.stringify(config, null, 2) + "\n");

/* Links verificados (QR abrindo o app) só fazem sentido com um endereço fixo */
const trocar = (arquivo, re, novo) => {
  const f = aqui(arquivo);
  if (existsSync(f)) writeFileSync(f, readFileSync(f, "utf8").replace(re, novo));
};
if (url) {
  const host = new URL(url).host;
  // O comentário <!-- nexor-host --> fica na linha seguinte do manifesto: o \s* aceita a quebra de linha
  trocar("../android/app/src/main/AndroidManifest.xml", /android:host="[^"]*" android:pathPrefix="\/app" \/>(\s*)<!-- nexor-host -->/, `android:host="${host}" android:pathPrefix="/app" />$1<!-- nexor-host -->`);
  trocar("../ios/App/App/App.entitlements", /applinks:[^<]+/, `applinks:${host}`);
}
console.log(`Meu Ponto (${config.appId}): ${url ? `app do cliente ${url}` : "app genérico: o colaborador conecta ao servidor da empresa no primeiro acesso"}`);
