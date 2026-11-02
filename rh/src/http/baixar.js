/* Página de download do app (/baixar) e arquivos que permitem ao QR Code abrir direto o app instalado:
   /.well-known/assetlinks.json (Android App Links) e /.well-known/apple-app-site-association (iOS Universal Links). */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function arquivosConhecidos(cfg, caminho) {
  const a = cfg.apps;
  if (caminho === "/.well-known/assetlinks.json" && a.androidSha256.length)
    return JSON.stringify([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: a.id, sha256_cert_fingerprints: a.androidSha256 } }]);
  if (caminho === "/.well-known/apple-app-site-association" && a.appleTeamId)
    return JSON.stringify({ applinks: { details: [{ appIDs: [`${a.appleTeamId}.${a.id}`], components: [{ "/": "/app/*", comment: "App de ponto (QR Code do quiosque)" }] }] } });
  return null;
}

export function paginaBaixar(cfg, base) {
  const a = cfg.apps;
  const botao = (href, rotulo, sub, classe) => (href ? `<a class="loja ${classe}" href="${esc(href)}" rel="noopener"><small>${sub}</small><b>${rotulo}</b></a>` : "");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Baixar o app Meu Ponto</title>
  <meta name="description" content="Baixe o app de ponto para iPhone ou Android." />
  <meta name="theme-color" content="#060b16" />
  <link rel="icon" href="/img/favicon.png" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: radial-gradient(circle at 50% 0, #0f2e5c, #060b16 60%); color: #e8eef9; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px 16px; box-sizing: border-box; }
    main { max-width: 440px; width: 100%; text-align: center; display: grid; gap: 14px; justify-items: center; }
    img { width: 96px; height: 96px; border-radius: 22px; }
    h1 { margin: 6px 0 0; font-size: 28px; }
    p { margin: 0; color: #a7b4ca; }
    .lojas { display: grid; gap: 10px; width: 100%; margin-top: 10px; }
    .loja { display: grid; text-align: left; padding: 12px 18px; border-radius: 14px; background: #fff; color: #0b1220; text-decoration: none; }
    .loja small { font-size: 12px; } .loja b { font-size: 19px; }
    .loja.apk { background: #13203a; color: #e8eef9; border: 1px solid #2a3b5e; }
    .web { color: #93c5fd; }
    ol { text-align: left; color: #a7b4ca; padding-left: 20px; margin: 0; }
    .destaque { outline: 3px solid #3b8dff; }
  </style>
</head>
<body>
  <main>
    <img src="/img/icone-192.png" alt="" />
    <h1>Meu Ponto</h1>
    <p>Registre o ponto com a digital, o rosto ou o QR Code da empresa, veja o espelho, o holerite e os comunicados.</p>
    <div class="lojas">
      ${botao(a.appStore, "App Store", "Baixar para iPhone na", "ios")}
      ${botao(a.googlePlay, "Google Play", "Baixar para Android no", "android")}
      ${botao(a.apk, "Baixar o APK", "Android, instalação direta", "apk")}
    </div>
    ${a.appStore || a.googlePlay || a.apk ? "" : `<p>O app das lojas ainda não foi publicado pela empresa. Use a versão web, que funciona como app:</p>`}
    <a class="web" href="${esc(base)}/app/">Abrir a versão web do app →</a>
    <ol>
      <li>Depois de instalar, entre com seu CPF e o código de 6 números que o RH enviou.</li>
      <li>Ative a digital ou o rosto quando o app pedir.</li>
    </ol>
  </main>
  <script>
    const ua = navigator.userAgent;
    const alvo = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "";
    if (alvo) document.querySelector(".loja." + alvo)?.classList.add("destaque");
  </script>
</body>
</html>`;
}
