import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
if (!clientId) {
  console.error("Defina GOOGLE_CLIENT_ID no ambiente local (não no chat). ");
  process.exit(1);
}

const scopes = [
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
];
const state = randomBytes(32).toString("hex");
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const server = createServer();

const equalSafe = (a, b) => {
  const aa = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(String(b ?? ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};

const timeout = setTimeout(() => {
  console.error("Tempo esgotado; nenhuma credencial foi salva.");
  server.close(() => process.exit(1));
}, 5 * 60_000);
let redirectUri = "";

server.on("request", async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end("Não encontrado");
    return;
  }
  if (!equalSafe(url.searchParams.get("state"), state)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Resposta OAuth inválida. Feche esta janela.");
    server.close(() => process.exit(1));
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Autorização não concluída. Feche esta janela.");
    server.close(() => process.exit(1));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end("<h1>Autorização concluída</h1><p>Você pode retornar ao terminal local da Nexor.</p>");
  server.close(async () => {
    clearTimeout(timeout);
    try {
      const form = new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      });
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("O Google recusou a troca do código OAuth.");
      const tokens = await response.json();
      if (typeof tokens.refresh_token !== "string" || !tokens.refresh_token) {
        throw new Error("O Google não retornou refresh token. Revogue o acesso de teste e repita com consentimento solicitado.");
      }
      console.log("\nCopie o token abaixo diretamente para o segredo GOOGLE_REFRESH_TOKEN no Render. Não o envie por chat nem o salve no repositório.\n");
      console.log(tokens.refresh_token);
      console.log("\nO token foi mantido apenas na saída local do terminal; este script não grava arquivos.");
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Falha ao concluir OAuth.");
      process.exitCode = 1;
    }
  });
});

server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })) authUrl.searchParams.set(key, value);
  console.log("Abra este link no navegador conectado à conta Nexor e aprove o acesso solicitado:");
  console.log(authUrl.toString());
  console.log("\nO servidor local aceita apenas o retorno OAuth em 127.0.0.1 e encerra em até 5 minutos.");
});

