/* Cliente da API Pix no padrão do Banco Central (o mesmo contrato em todos os bancos:
   /cob, /cobv, /pix e /webhook). Serve para gerar cobrança Pix com baixa automática e
   consultar os Pix recebidos, direto no banco do cliente, sem intermediário.

   Cada banco exige: client_id e client_secret do portal do desenvolvedor, certificado mTLS
   da empresa (arquivo .crt/.pem e chave .key) e a chave Pix cadastrada.
   Segurança (padrão Nexor): segredos só em variável de ambiente ou cifrados no banco de dados,
   nunca em log nem em resposta da API. Os caminhos de produção abaixo vêm dos portais públicos
   de cada banco; confira no portal antes de ativar e use a homologação primeiro.
   Fonte comum: assets/bancos/. Copiado para cada produto por tools/bancos.sh. */
import https from "node:https";
import { readFileSync } from "node:fs";

/* endereço da API e do token de cada banco (produção), conferidos em comercial/PESQUISA-BANCOS-ARAGUARI.md.
   null = pegar no portal do banco. Itaú está migrando para secure.gateway.api.itau: confira antes de ativar. */
export const PROVEDORES = {
  "001": { nome: "Banco do Brasil", api: "https://api-pix.bb.com.br/pix/v2", token: "https://oauth.bb.com.br/oauth/token", escopo: "cob.write cob.read pix.read pix.write", extra: "gw-dev-app-key" },
  "341": { nome: "Itaú", api: "https://secure.api.itau/pix_recebimentos/v2", token: "https://sts.itau.com.br/api/oauth/token", escopo: "" },
  "237": { nome: "Bradesco", api: "https://qrpix.bradesco.com.br/v2", token: "https://qrpix.bradesco.com.br/auth/server/oauth/token", escopo: "" },
  "033": { nome: "Santander", api: null, token: null, escopo: "" }, // endereço não confirmado na documentação oficial: pegar com o gerente Cash
  "756": { nome: "Sicoob", api: "https://api.sicoob.com.br/pix/api/v2", token: "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token", escopo: "cob.write cob.read pix.read webhook.read webhook.write" },
  "748": { nome: "Sicredi", api: "https://api-pix.sicredi.com.br/api/v2", token: "https://api-pix.sicredi.com.br/oauth/token", escopo: "cob.write cob.read pix.read webhook.read webhook.write" },
  "077": { nome: "Inter", api: "https://cdpj.partners.bancointer.com.br/pix/v2", token: "https://cdpj.partners.bancointer.com.br/oauth/v2/token", escopo: "cob.write cob.read pix.read webhook.read webhook.write" },
  "104": { nome: "Caixa", api: null, token: null, escopo: "" },
  "336": { nome: "C6 Bank", api: null, token: null, escopo: "" },
};

/* requisição HTTPS com certificado do cliente (mTLS); injetável nos testes */
function requisitarPadrao({ url, metodo, cabecalhos, corpo, cert, key, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== "https:") return reject(new Error("A API Pix só aceita HTTPS."));
    const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: metodo, headers: cabecalhos, cert, key, timeout: timeoutMs, minVersion: "TLSv1.2" }, (res) => {
      const partes = [];
      let tam = 0;
      res.on("data", (c) => {
        tam += c.length;
        if (tam > 2 * 1024 * 1024) return req.destroy(new Error("Resposta grande demais do banco."));
        partes.push(c);
      });
      res.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        let json;
        try { json = texto ? JSON.parse(texto) : {}; } catch { json = { bruto: texto.slice(0, 300) }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("timeout", () => req.destroy(new Error("O banco não respondeu a tempo.")));
    req.on("error", reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

const TXID_OK = /^[a-zA-Z0-9]{26,35}$/;
export function novoTxid(prefixo = "NX") {
  const base = (prefixo.replace(/[^A-Za-z0-9]/g, "") + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
  return base.padEnd(26, "0");
}

/**
 * Cria o cliente de um banco.
 * cfg: { banco: "756", clientId, clientSecret, certPath|cert, keyPath|key, api?, token?, escopo?, chaveDev? }
 */
export function clientePix(cfg, { requisitar = requisitarPadrao, agora = () => Date.now() } = {}) {
  const prov = PROVEDORES[String(cfg.banco).padStart(3, "0")] ?? {};
  const api = cfg.api ?? prov.api;
  const tokenUrl = cfg.token ?? prov.token;
  if (!api || !tokenUrl) throw new Error(`Informe os endereços da API Pix do banco ${cfg.banco} (pegue no portal do desenvolvedor do banco).`);
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("Faltam o client_id e o client_secret do banco.");
  const cert = cfg.cert ?? (cfg.certPath ? readFileSync(cfg.certPath) : undefined);
  const key = cfg.key ?? (cfg.keyPath ? readFileSync(cfg.keyPath) : undefined);
  if (!cert || !key) throw new Error("Falta o certificado da empresa (arquivo do certificado e da chave) exigido pelo banco.");
  const escopo = cfg.escopo ?? prov.escopo ?? "";
  const extraQs = prov.extra && cfg.chaveDev ? `${prov.extra}=${encodeURIComponent(cfg.chaveDev)}` : "";
  let token = null;
  let validade = 0;

  async function obterToken() {
    if (token && agora() < validade - 30_000) return token;
    const corpo = new URLSearchParams({ grant_type: "client_credentials", ...(escopo ? { scope: escopo } : {}) }).toString();
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    const r = await requisitar({ url: tokenUrl, metodo: "POST", cabecalhos: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}`, "content-length": Buffer.byteLength(corpo) }, corpo, cert, key });
    if (r.status !== 200 || !r.json?.access_token) throw erroBanco("Não consegui entrar na API do banco", r);
    token = r.json.access_token;
    validade = agora() + Number(r.json.expires_in ?? 300) * 1000;
    return token;
  }

  async function chamar(metodo, caminho, corpoObj) {
    const t = await obterToken();
    const corpo = corpoObj ? JSON.stringify(corpoObj) : undefined;
    const sep = caminho.includes("?") ? "&" : "?";
    const url = api + caminho + (extraQs ? sep + extraQs : "");
    const r = await requisitar({ url, metodo, cabecalhos: { authorization: `Bearer ${t}`, "content-type": "application/json", ...(corpo ? { "content-length": Buffer.byteLength(corpo) } : {}) }, corpo, cert, key });
    if (r.status === 401) token = null;
    if (r.status < 200 || r.status >= 300) throw erroBanco(`O banco recusou ${metodo} ${caminho.split("?")[0]}`, r);
    return r.json;
  }

  return {
    banco: prov.nome ?? cfg.banco,
    /** Cobrança imediata. Devolve { txid, status, pixCopiaECola, location } */
    async criarCobranca({ txid = novoTxid(), valor, chave, expiracaoSeg = 3600, devedor, descricao }) {
      if (!TXID_OK.test(txid)) throw new Error("txid deve ter de 26 a 35 letras e números.");
      const v = Number(valor);
      if (!Number.isFinite(v) || v <= 0) throw new Error("Valor da cobrança inválido.");
      const corpo = { calendario: { expiracao: expiracaoSeg }, valor: { original: v.toFixed(2) }, chave, ...(descricao ? { solicitacaoPagador: String(descricao).slice(0, 140) } : {}), ...(devedor ? { devedor } : {}) };
      const r = await chamar("PUT", `/cob/${txid}`, corpo);
      return { txid: r.txid ?? txid, status: r.status, pixCopiaECola: r.pixCopiaECola, location: r.location ?? r.loc?.location };
    },
    /** Situação da cobrança: ATIVA, CONCLUIDA, REMOVIDA_PELO_USUARIO_RECEBEDOR ou REMOVIDA_PELO_PSP */
    async consultarCobranca(txid) {
      const r = await chamar("GET", `/cob/${encodeURIComponent(txid)}`);
      return { txid: r.txid, status: r.status, pago: r.status === "CONCLUIDA", pix: r.pix ?? [] };
    },
    /** Pix recebidos no período (ISO 8601). Devolve [{ e2eid, txid, valor, horario, pagador }] */
    async pixRecebidos(inicio, fim) {
      const out = [];
      for (let pagina = 0; pagina < 50; pagina++) {
        const r = await chamar("GET", `/pix?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}&paginacao.paginaAtual=${pagina}`);
        for (const p of r.pix ?? []) out.push({ e2eid: p.endToEndId, txid: p.txid, valor: Number(p.valor), horario: p.horario, pagador: p.pagador?.nome ?? p.infoPagador ?? "" });
        const pg = r.parametros?.paginacao;
        if (!pg || pagina + 1 >= Number(pg.quantidadeDePaginas ?? 1)) break;
      }
      return out;
    },
    /** Cadastra a URL que o banco chama quando um Pix cai (precisa ser HTTPS pública) */
    async configurarWebhook(chave, url) {
      if (!/^https:\/\//.test(url)) throw new Error("O webhook do Pix precisa ser HTTPS.");
      await chamar("PUT", `/webhook/${encodeURIComponent(chave)}`, { webhookUrl: url });
      return true;
    },
  };
}

/* erro sem segredo: mostra status e a mensagem do banco, nunca token nem cabeçalho */
function erroBanco(msg, r) {
  const detalhe = r?.json?.detail ?? r?.json?.title ?? r?.json?.error_description ?? r?.json?.message ?? "";
  return Object.assign(new Error(`${msg} (HTTP ${r?.status ?? "?"}${detalhe ? `: ${String(detalhe).slice(0, 160)}` : ""}).`), { status: 502 });
}
