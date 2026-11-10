/* Modo Demonstração (DEMO=1): rotas só existem na demonstração, semeia e entra por papel, nenhuma chamada
   externa (trava do fetch + simuladores), reiniciar volta ao original e o servidor escuta só em 127.0.0.1. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { lerConfig } from "../src/config.js";
import { hostDeEscuta } from "../src/servidor.js";
import { criarCliente, subir } from "./ajuda.js";

let normal, demo;
before(async () => {
  normal = await subir();
  demo = await subir({ cfg: { demo: true } });
});
after(() => {
  normal?.fechar();
  demo?.fechar();
});

/** GET sem seguir redirecionamento, guardando os cookies num cliente */
async function entrar(url, papel) {
  const r = await fetch(`${url}/demo/entrar?papel=${papel}`, { redirect: "manual" });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, destino: r.headers.get("location"), cookie };
}
const comCookie = (url, cookie) => (caminho, opcoes = {}) => fetch(url + caminho, { ...opcoes, headers: { "x-nexor": "1", cookie, ...(opcoes.headers ?? {}) } }).then(async (r) => ({ status: r.status, dados: await r.json().catch(() => null) }));

test("sem DEMO=1 as rotas de demonstração respondem 404 e nada muda", async () => {
  for (const c of ["/demo/entrar?papel=admin", "/demo/faixa.js", "/api/demo", "/api/demo/mensagens"]) assert.equal((await fetch(normal.url + c, { redirect: "manual" })).status, 404, c);
  assert.equal((await fetch(`${normal.url}/api/demo/reiniciar`, { method: "POST", headers: { "x-nexor": "1" } })).status, 404);
  const html = await (await fetch(`${normal.url}/`)).text();
  assert.ok(!html.includes("/demo/faixa.js"), "a faixa não entra nas páginas fora da demonstração");
  assert.equal(normal.app.repo.um("SELECT COUNT(*) n FROM empresas").n, 0, "não semeia nada");
  assert.equal(normal.app.demo, null);
  assert.equal(lerConfig({}).demo, false);
});

test("com DEMO=1 semeia a Padaria Pão Dourado e /demo/entrar abre a sessão de cada papel", async () => {
  const info = await (await fetch(`${demo.url}/api/demo`)).json();
  assert.equal(info.demo, true);
  assert.equal(info.sistema, "Nexor RH");
  assert.deepEqual(info.papeis.map((p) => p.papel), ["admin", "rh", "gestor", "colaborador", "quiosque"]);
  assert.equal(info.ia, "simulada");

  const adm = await entrar(demo.url, "admin");
  assert.equal(adm.status, 302);
  assert.equal(adm.destino, "/#/inicio");
  const eu = await comCookie(demo.url, adm.cookie)("/api/eu");
  assert.equal(eu.status, 200);
  assert.equal(eu.dados.usuario.papel, "admin");
  assert.equal(eu.dados.empresa.nome_fantasia, "Pão Dourado");
  assert.equal(eu.dados.licenca.situacao, "ativo");
  assert.match(eu.dados.licenca.mensagem, /Demonstração/);
  assert.ok(eu.dados.contagem.ajustes >= 3 && eu.dados.contagem.ferias >= 1 && eu.dados.contagem.afastamentos >= 1, "pendências para aprovar");
  assert.ok(eu.dados.contagem.esocial >= 1, "evento do eSocial para enviar");
  const hoje = await comCookie(demo.url, adm.cookie)("/api/ponto/hoje");
  assert.ok(hoje.dados.lista.length >= 8);

  const gestor = await entrar(demo.url, "gestor");
  const g = comCookie(demo.url, gestor.cookie);
  assert.equal((await g("/api/eu")).dados.usuario.papel, "gestor");
  assert.equal((await g("/api/folhas")).status, 403, "gestor não vê a folha");
  const equipe = (await g("/api/colaboradores")).dados;
  assert.ok(equipe.length > 0 && equipe.length < 10, "gestor vê só a equipe dele");

  const col = await entrar(demo.url, "colaborador");
  assert.equal(col.destino, "/app/");
  const app = comCookie(demo.url, col.cookie);
  const me = await app("/api/app/eu");
  assert.equal(me.status, 200);
  assert.equal(me.dados.colaborador.nome, "Ana Beatriz Lima");
  const espelho = await app(`/api/app/espelho/${new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7)}`);
  assert.equal(espelho.status, 200);

  assert.equal((await entrar(demo.url, "invasor")).status, 400);
  const html = await (await fetch(`${demo.url}/`)).text();
  assert.ok(html.includes("/demo/faixa.js") && !html.includes("fonts.googleapis.com"), "faixa injetada e sem fontes externas");
});

test("nenhuma chamada sai para host externo: a trava lança e os serviços respondem pelo simulador", async () => {
  await assert.rejects(() => fetch("https://example.com/"), /demonstração.*bloqueada/i);
  await assert.rejects(() => fetch("https://central.nexorconsultingit.com.br/api/v1/sincronizar", { method: "POST" }), /bloqueada/);
  const adm = comCookie(demo.url, (await entrar(demo.url, "admin")).cookie);
  // Gupy simulada
  assert.equal((await adm("/api/recrutamento/gupy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "token-de-demonstracao" }) })).status, 200);
  const sinc = await adm("/api/recrutamento/gupy/sincronizar", { method: "POST" });
  assert.equal(sinc.status, 200, JSON.stringify(sinc.dados));
  assert.equal(sinc.dados.vagas, 2);
  // eSocial simulado: envia o pendente e consulta o recibo
  const env = await adm("/api/esocial/enviar", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(env.status, 200, JSON.stringify(env.dados));
  assert.ok(env.dados.lotes.every((l) => l.ok));
  const cons = await adm("/api/esocial/consultar", { method: "POST" });
  assert.ok(cons.dados.lotes.every((l) => l.status === "processado"));
  // Vincular à Central é recusado (a licença é "Demonstração")
  assert.equal((await adm("/api/nexor/vincular", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo: "NX-ABCD-EFGH" }) })).status, 409);
  const msgs = await (await fetch(`${demo.url}/api/demo/mensagens`)).json();
  assert.ok(msgs.some((m) => m.canal === "gupy") && msgs.some((m) => m.canal === "esocial"));
});

test("reiniciar volta os dados ao estado original e mantém o papel logado", async () => {
  const contar = () => Object.fromEntries(["colaboradores", "ajustes", "ferias", "afastamentos", "folhas", "vagas", "candidatos", "comunicados", "esocial_eventos", "marcacoes"].map((t) => [t, demo.app.repo.um(`SELECT COUNT(*) n FROM ${t}`).n]));
  const pendentes = () => demo.app.repo.um("SELECT COUNT(*) n FROM ajustes WHERE status = 'pendente'").n;
  // O teste anterior já mexeu (vagas da Gupy, eSocial enviado); estado original = depois de reiniciar uma vez
  const { cookie } = await entrar(demo.url, "rh");
  const rh = comCookie(demo.url, cookie);
  assert.equal((await fetch(`${demo.url}/api/demo/reiniciar`, { method: "POST" })).status, 403, "exige o cabeçalho do painel");
  let r = await fetch(`${demo.url}/api/demo/reiniciar`, { method: "POST", headers: { "x-nexor": "1", cookie } });
  assert.deepEqual(await r.json(), { ok: true });
  const original = contar();
  const pendOriginal = pendentes();
  // Mexe: aprova um ajuste e publica um comunicado
  const novoCookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const rh2 = comCookie(demo.url, novoCookie);
  assert.equal((await rh2("/api/eu")).dados.usuario.papel, "rh", "continua logado no mesmo papel");
  const aj = (await rh2("/api/ajustes?status=pendente")).dados;
  const lista = Array.isArray(aj) ? aj : aj.lista ?? aj.itens ?? [];
  assert.ok(lista.length);
  assert.equal((await rh2(`/api/ajustes/${lista[0].id}/decidir`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aprovar: true, status: "aprovado" }) })).status, 200);
  assert.equal((await rh2("/api/comunicados", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titulo: "Teste", texto: "Mudança feita na demonstração" }) })).status, 200);
  assert.notDeepEqual(contar(), original);
  assert.equal(pendentes(), pendOriginal - 1);
  r = await fetch(`${demo.url}/api/demo/reiniciar`, { method: "POST", headers: { "x-nexor": "1", cookie: novoCookie } });
  assert.equal(r.status, 200);
  assert.deepEqual(contar(), original);
  assert.equal(pendentes(), pendOriginal);
  void rh;
});

test("na demonstração o servidor escuta só em 127.0.0.1", async () => {
  assert.equal(hostDeEscuta({ demo: true }), "127.0.0.1");
  assert.equal(hostDeEscuta({ demo: true, demoPublico: true }), undefined);
  assert.equal(hostDeEscuta({ demo: false }), undefined);
  assert.equal(lerConfig({ DEMO: "1" }).pastaDados, "./data-demo");
  assert.ok(lerConfig({ DEMO: "1" }).chaveMestra, "chave mestra fixa de demonstração");
  assert.equal(lerConfig({}).chaveMestra, "");

  const pasta = mkdtempSync(join(tmpdir(), "nexor-rh-demo-"));
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const filho = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/servidor.js"], { cwd: raiz, env: { ...process.env, DEMO: "1", DEMO_RESET: "1", DEMO_PUBLICO: "", DATA_DIR: pasta, PORT: "0", NODE_ENV: "" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const endereco = await new Promise((resolve, reject) => {
      let saida = "";
      const t = setTimeout(() => reject(new Error(`servidor não subiu: ${saida}`)), 60_000);
      filho.stdout.on("data", (b) => {
        saida += b;
        const m = /no ar em (http:\/\/[^\s]+)/.exec(saida);
        if (m) clearTimeout(t), resolve(m[1]);
      });
      filho.stderr.on("data", (b) => (saida += b));
      filho.on("exit", (c) => reject(new Error(`servidor saiu (${c}): ${saida}`)));
    });
    assert.match(endereco, /^http:\/\/127\.0\.0\.1:\d+$/);
    const info = await (await fetch(`${endereco}/api/demo`)).json();
    assert.equal(info.demo, true);
    const { status } = await criarCliente(endereco).get("/demo/entrar?papel=admin");
    assert.equal(status, 200);
  } finally {
    filho.kill();
    rmSync(pasta, { recursive: true, force: true });
  }
});
