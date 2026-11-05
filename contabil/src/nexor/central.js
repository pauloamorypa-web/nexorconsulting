/* Ligação do sistema com a Nexor Central. ESTE ARQUIVO É IGUAL em todos os sistemas
   (rh/, atende/, contabil/, barber/ e nexor-agente/, em src/nexor/central.js): altere todos juntos.

   - A cada 5 minutos envia a saúde da instalação (só contagens, nenhum dado pessoal) e recebe a licença assinada.
   - A licença diz a situação do contrato: ativo, aviso, restrito (somente leitura) ou bloqueado.
   - No teste grátis (plano "teste"), a licença traz também os limites (contagens da saúde) e os módulos
     travados; recusaPorTeste() aplica os dois. No fim do teste a Central manda "bloqueado".
   - A assinatura Ed25519 é conferida com a chave pública da Central: ninguém forja uma licença.
   - Sem contato com a Central, vale a última licença até a validade; depois disso o sistema fica "restrito"
     (nunca bloqueado por falta de internet) e volta sozinho no próximo contato.
   - A licença fica em DATA_DIR/nexor-licenca.json (sobrevive a reinícios).
   - Vinculação imediata: com o código do cliente (NX-XXXX-XXXX, em NEXOR_CODIGO ou digitado no painel),
     o sistema se cadastra sozinho na Central e recebe instância, token e chave pública (guardados no mesmo arquivo).
   Sem Central configurada nem código, o sistema funciona normalmente (instalações antigas e testes). */

import { createPublicKey, verify } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function conferirAssinado(token, chavePublicaB64) {
  const [p, s] = String(token ?? "").split(".");
  if (!p || !s || !chavePublicaB64) return null;
  try {
    const chave = createPublicKey({ key: Buffer.from(chavePublicaB64, "base64"), format: "der", type: "spki" });
    if (!verify(null, Buffer.from(p), chave, Buffer.from(s, "base64url"))) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const ATIVO = { situacao: "ativo", mensagem: "", link: null, manter_ponto: true, contato: null, plano: "contratado", teste_ate: null, limites: {}, travados: [] };

/**
 * Teste grátis: recusa o que o teste não inclui.
 * - travados: chaves de módulo do catálogo do sistema (politica.js) → bloqueia as rotas do módulo
 * - limites: { chave: máximo } sobre as contagens da saúde; rotas[chave] diz quais POST criam mais um
 * Devolve a mensagem para o usuário, ou null.
 */
export function recusaPorTeste(lic, metodo, caminho, { catalogo = {}, rotas = {}, contar = () => ({}) } = {}) {
  if (lic?.plano !== "teste") return null;
  const sob = (c, ps) => ps.some((p) => c === p || c.startsWith(p + "/"));
  for (const k of lic.travados ?? []) {
    const m = catalogo.modulos?.[k];
    if (m && sob(caminho, m.api)) return `${m.rotulo} não faz parte do teste grátis. Contrate um plano para liberar.`;
  }
  if (metodo !== "POST") return null;
  const aqui = Object.entries(lic.limites ?? {}).filter(([k]) => rotas[k]?.rotas?.includes(caminho));
  if (!aqui.length) return null;
  const n = contar() ?? {};
  for (const [k, max] of aqui) if (Number.isFinite(max) && (n[k] ?? 0) >= max) return `No teste grátis o limite é de ${max} ${rotas[k].rotulo}. Contrate um plano para liberar mais.`;
  return null;
}

/** Lê as variáveis NEXOR_* (iguais nos três sistemas) */
export const CENTRAL_PADRAO = "https://central.nexorconsultingit.com.br";
export const configNexor = (env = process.env) => ({
  // Com só o código do cliente, usa o endereço padrão da Central
  central: (env.NEXOR_CENTRAL_URL || (env.NEXOR_CODIGO ? CENTRAL_PADRAO : "")).replace(/\/$/, ""),
  codigo: (env.NEXOR_CODIGO ?? "").trim(),
  instancia: env.NEXOR_INSTANCIA ?? "",
  token: env.NEXOR_TOKEN ?? "",
  chavePublica: (env.NEXOR_CHAVE_PUBLICA ?? "").trim(),
  intervaloMin: Number(env.NEXOR_SYNC_MINUTES) > 0 ? Number(env.NEXOR_SYNC_MINUTES) : 5,
});

export function criarCentralNexor({ cfg, agora = () => Date.now(), fetchFn = fetch, versao = "1.0.0", produto, saude = () => ({}), urlPublica = cfg.urlPublica ?? "" }) {
  const env = cfg.nexor ?? {};
  const arquivo = join(cfg.pastaDados, "nexor-licenca.json");
  const usados = new Map(); // links de acesso de suporte já usados (uso único): nonce → validade
  let relogio = null;

  const ler = () => {
    try {
      return JSON.parse(readFileSync(arquivo, "utf8"));
    } catch {
      return {};
    }
  };
  const gravar = (mudanca) => {
    const novo = { ...ler(), ...mudanca };
    try {
      mkdirSync(cfg.pastaDados, { recursive: true });
      writeFileSync(arquivo + ".tmp", JSON.stringify(novo), { mode: 0o600 });
      renameSync(arquivo + ".tmp", arquivo);
    } catch (e) {
      console.error("[nexor] não foi possível gravar a licença:", e.message);
    }
  };
  /** Credenciais: as do .env (cadastro manual) ou as recebidas na vinculação pelo código */
  const credenciais = () => {
    const l = ler();
    return {
      central: env.central || l.central || "",
      instancia: env.instancia || l.instancia || "",
      token: env.token || l.token_sistema || "",
      chavePublica: env.chavePublica || l.chave_publica || "",
      intervaloMin: env.intervaloMin ?? 5,
    };
  };
  const vinculado = () => {
    const c = credenciais();
    return Boolean(c.central && c.instancia && c.token && c.chavePublica);
  };
  let n = credenciais();
  const licencaGuardada = () => {
    const d = conferirAssinado(ler().token, n.chavePublica);
    return d && d.tipo === "licenca" && d.inst === n.instancia ? d : null;
  };

  /** Situação valendo agora */
  function estado() {
    n = credenciais();
    if (!vinculado()) return { ...ATIVO, origem: "sem_central" };
    const d = licencaGuardada();
    if (!d) return { ...ATIVO, origem: "aguardando" }; // instalação nova: funciona até o primeiro contato
    const base = { link: d.link ?? null, manter_ponto: d.manter_ponto !== false, contato: d.contato ?? null, plano: d.plano ?? "contratado", teste_ate: d.teste_ate ?? null, limites: d.limites ?? {}, travados: d.travados ?? [] };
    if (d.valido_ate < agora()) {
      const dias = Math.floor((agora() - d.emitida) / 86400_000);
      return { ...base, situacao: d.situacao === "bloqueado" ? "bloqueado" : "restrito", mensagem: d.situacao === "bloqueado" ? d.mensagem : `Sem contato com a Nexor há ${dias} dias. O sistema fica em modo somente leitura até a conexão voltar. Confira a internet do servidor.`, origem: "vencida" };
    }
    return { ...base, situacao: d.situacao, mensagem: d.mensagem ?? "", origem: "central" };
  }

  /** Vincula esta instalação ao cliente pelo código NX-XXXX-XXXX (uma vez; depois só sincroniza) */
  async function vincular(codigo, { central = env.central || CENTRAL_PADRAO, nome } = {}) {
    if (vinculado()) return { ok: false, erro: "Este sistema já está vinculado à Nexor Central." };
    const base = String(central).replace(/\/$/, "");
    if (!/^https?:\/\//.test(base)) return { ok: false, erro: "Endereço da Central inválido." };
    try {
      const r = await fetchFn(`${base}/api/v1/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, produto, versao, url: urlPublica || null, nome }),
        signal: AbortSignal.timeout(15_000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.erro ?? `Central respondeu ${r.status}`);
      if (!d.instancia || !/^nxs_/.test(d.token ?? "") || !d.chave_publica) throw new Error("Resposta da Central incompleta");
      gravar({ central: base, instancia: d.instancia, token_sistema: d.token, chave_publica: d.chave_publica, cliente: d.cliente ?? null, vinculado_em: agora(), erro: null });
      const s = await sincronizar();
      return { ok: true, cliente: d.cliente ?? null, situacao: s.situacao ?? null };
    } catch (e) {
      gravar({ erro: String(e.message).slice(0, 300) });
      return { ok: false, erro: e.message };
    }
  }

  async function sincronizar() {
    n = credenciais();
    if (!vinculado()) return { ok: false, erro: "Central não configurada" };
    gravar({ tentativa_em: agora() });
    try {
      const r = await fetchFn(`${n.central}/api/v1/sincronizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${n.token}` },
        body: JSON.stringify({ versao, produto, saude: await saude() }),
        signal: AbortSignal.timeout(15_000),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados?.erro ?? `Central respondeu ${r.status}`);
      const d = conferirAssinado(dados.licenca, n.chavePublica);
      if (!d || d.tipo !== "licenca" || d.inst !== n.instancia) throw new Error("Licença com assinatura inválida");
      gravar({ token: dados.licenca, recebida_em: agora(), erro: null });
      return { ok: true, situacao: d.situacao };
    } catch (e) {
      gravar({ erro: String(e.message).slice(0, 300) });
      return { ok: false, erro: e.message };
    }
  }

  /** Confere o link de acesso de suporte gerado pela Central (2 minutos, uso único, desta instalação) */
  function conferirAcesso(token) {
    n = credenciais();
    if (!vinculado()) return null;
    const d = conferirAssinado(token, n.chavePublica);
    if (!d || d.tipo !== "acesso" || d.inst !== n.instancia || !(d.exp > agora()) || d.exp - agora() > 10 * 60_000 || !d.nonce) return null;
    for (const [k, exp] of usados) if (exp < agora()) usados.delete(k);
    if (usados.has(String(d.nonce))) return null;
    usados.set(String(d.nonce), d.exp);
    return d;
  }

  return {
    get configurada() {
      return vinculado();
    },
    estado,
    sincronizar,
    vincular,
    conferirAcesso,
    info() {
      const l = ler();
      const c = credenciais();
      return { configurada: vinculado(), central: c.central || null, instancia: c.instancia || null, cliente: l.cliente ?? null, ultimo_contato: l.recebida_em ?? null, ultima_tentativa: l.tentativa_em ?? null, erro: l.erro ?? null };
    },
    iniciar() {
      // Com NEXOR_CODIGO e ainda sem vínculo, vincula sozinho; depois sincroniza a cada 5 minutos
      const rodar = () => (vinculado() ? sincronizar() : env.codigo ? vincular(env.codigo) : Promise.resolve()).catch(() => {});
      setTimeout(rodar, 3_000).unref?.();
      relogio = setInterval(rodar, (env.intervaloMin ?? 5) * 60_000);
      relogio.unref?.();
    },
    parar: () => clearInterval(relogio),
  };
}
