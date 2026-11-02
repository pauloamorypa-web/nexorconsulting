/* Gera o capacitor.config.json a partir das variáveis de ambiente.
   NEXOR_RH_URL  endereço do servidor do Nexor RH com HTTPS (ex.: https://rh.nexorconsultingit.com.br)
   APP_ID        identificador nas lojas (padrão br.com.nexorconsultingit.ponto)
   APP_NAME      nome que aparece no celular (padrão "Meu Ponto")
   O app abre o /app/ do servidor (sempre a versão mais nova, sem precisar atualizar nas lojas) e usa os
   recursos nativos do celular: biometria, câmera para o QR Code, GPS e links do QR abrindo direto no app. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const url = (process.env.NEXOR_RH_URL ?? "https://rh.nexorconsultingit.com.br").replace(/\/$/, "");
if (!url.startsWith("https://")) {
  console.error("NEXOR_RH_URL precisa começar com https:// (biometria, câmera e GPS exigem HTTPS).");
  process.exit(1);
}
const host = new URL(url).host;
const config = {
  appId: process.env.APP_ID ?? "br.com.nexorconsultingit.ponto",
  appName: process.env.APP_NAME ?? "Meu Ponto",
  webDir: "www",
  server: { url: `${url}/app/`, allowNavigation: [host], errorPath: "offline.html" },
  plugins: {
    SplashScreen: { launchShowDuration: 900, launchAutoHide: true, backgroundColor: "#060b16", showSpinner: false },
  },
  android: { allowMixedContent: false },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: false },
};
writeFileSync(new URL("../capacitor.config.json", import.meta.url), JSON.stringify(config, null, 2) + "\n");

// O mesmo host nos links que abrem o app (Android App Links e iOS Universal Links)
const trocar = (arquivo, re, novo) => {
  const f = new URL(arquivo, import.meta.url);
  if (!existsSync(f)) return;
  writeFileSync(f, readFileSync(f, "utf8").replace(re, novo));
};
trocar("../android/app/src/main/AndroidManifest.xml", /android:host="[^"]*" android:pathPrefix="\/app" \/><!-- nexor-host -->/, `android:host="${host}" android:pathPrefix="/app" /><!-- nexor-host -->`);
trocar("../ios/App/App/App.entitlements", /applinks:[^<]+/, `applinks:${host}`);
console.log(`capacitor.config.json: ${config.appName} (${config.appId}) → ${config.server.url}`);
