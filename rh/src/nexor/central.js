/* Ligação do sistema com a Nexor Central.
   - A cada 5 minutos envia a saúde da instalação (só contagens, nenhum dado pessoal) e recebe a licença assinada.
   - A licença diz a situação do contrato: ativo, aviso, restrito (somente leitura) ou bloqueado.
   - A assinatura Ed25519 é conferida com a chave pública da Central: ninguém forja uma licença.
   - Sem contato com a Central, vale a última licença até a validade; depois disso o sistema fica "restrito"
     (nunca bloqueado por falta de internet) e volta sozinho no próximo contato.
   Sem NEXOR_CENTRAL_URL configurada, o sistema funciona normalmente (instalações antigas e testes). */

import { createPublicKey, verify } from "node:crypto";

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

const ATIVO = { situacao: "ativo", mensagem: "", link: null, manter_ponto: true, contato: null };

export function criarCentralNexor({ repo, cfg, agora = () => Date.now(), fetchFn = fetch, versao = "1.0.0", produto = "rh", saude = () => ({}) }) {
  const n = cfg.nexor ?? {};
  const configurada = Boolean(n.central && n.instancia && n.token && n.chavePublica);
  repo.db.exec("CREATE TABLE IF NOT EXISTS nexor_licenca (id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT, recebida_em INTEGER, tentativa_em INTEGER, erro TEXT)");
  repo.db.exec("INSERT OR IGNORE INTO nexor_licenca (id) VALUES (1)");
  let relogio = null;

  const linha = () => repo.um("SELECT * FROM nexor_licenca WHERE id = 1");
  const licencaGuardada = () => {
    const l = linha();
    const d = conferirAssinado(l?.token, n.chavePublica);
    return d && d.tipo === "licenca" && d.inst === n.instancia ? d : null;
  };

  /** Situação valendo agora */
  function estado() {
    if (!configurada) return { ...ATIVO, origem: "sem_central" };
    const d = licencaGuardada();
    if (!d) return { ...ATIVO, origem: "aguardando" }; // instalação nova: funciona até o primeiro contato
    if (d.valido_ate < agora()) {
      const dias = Math.floor((agora() - d.emitida) / 86400_000);
      return { situacao: d.situacao === "bloqueado" ? "bloqueado" : "restrito", mensagem: d.situacao === "bloqueado" ? d.mensagem : `Sem contato com a Nexor há ${dias} dias. O sistema fica em modo somente leitura até a conexão voltar. Confira a internet do servidor.`, link: d.link ?? null, manter_ponto: d.manter_ponto !== false, contato: d.contato ?? null, origem: "vencida" };
    }
    return { situacao: d.situacao, mensagem: d.mensagem ?? "", link: d.link ?? null, manter_ponto: d.manter_ponto !== false, contato: d.contato ?? null, origem: "central" };
  }

  async function sincronizar() {
    if (!configurada) return { ok: false, erro: "Central não configurada" };
    repo.rodar("UPDATE nexor_licenca SET tentativa_em = ? WHERE id = 1", agora());
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
      repo.rodar("UPDATE nexor_licenca SET token = ?, recebida_em = ?, erro = NULL WHERE id = 1", dados.licenca, agora());
      return { ok: true, situacao: d.situacao };
    } catch (e) {
      repo.rodar("UPDATE nexor_licenca SET erro = ? WHERE id = 1", String(e.message).slice(0, 300));
      return { ok: false, erro: e.message };
    }
  }

  // Links de acesso de suporte já usados (uso único)
  repo.db.exec("CREATE TABLE IF NOT EXISTS nexor_acessos (nonce TEXT PRIMARY KEY, expira_em INTEGER NOT NULL)");
  /** Confere o link de acesso de suporte gerado pela Central */
  function conferirAcesso(token) {
    if (!configurada) return null;
    const d = conferirAssinado(token, n.chavePublica);
    if (!d || d.tipo !== "acesso" || d.inst !== n.instancia || !(d.exp > agora()) || d.exp - agora() > 10 * 60_000 || !d.nonce) return null;
    repo.rodar("DELETE FROM nexor_acessos WHERE expira_em < ?", agora());
    if (repo.um("SELECT 1 FROM nexor_acessos WHERE nonce = ?", String(d.nonce))) return null;
    repo.rodar("INSERT INTO nexor_acessos (nonce, expira_em) VALUES (?, ?)", String(d.nonce), d.exp);
    return d;
  }

  return {
    configurada,
    estado,
    sincronizar,
    conferirAcesso,
    info() {
      const l = linha();
      return { configurada, central: n.central || null, instancia: n.instancia || null, ultimo_contato: l?.recebida_em ?? null, ultima_tentativa: l?.tentativa_em ?? null, erro: l?.erro ?? null };
    },
    iniciar() {
      if (!configurada) return;
      const rodar = () => sincronizar().catch(() => {});
      setTimeout(rodar, 3_000).unref?.();
      relogio = setInterval(rodar, Math.max(1, n.intervaloMin ?? 5) * 60_000);
      relogio.unref?.();
    },
    parar: () => clearInterval(relogio),
  };
}
