/* Utilidades dos testes: sobe o servidor numa porta livre, guarda cookies e gera um certificado A1 de teste. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import { lerConfig } from "../src/config.js";
import { montarAplicacao } from "../src/servidor.js";

export async function subir({ agora, fetchSoap } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), "nexor-rh-"));
  const cfg = { ...lerConfig({}), pastaDados: pasta, chaveMestra: "teste-chave-mestra" };
  const app = montarAplicacao({ cfg, caminhoBanco: ":memory:", agora, fetchSoap });
  await new Promise((r) => app.servidor.listen(0, r));
  const url = `http://localhost:${app.servidor.address().port}`;
  return {
    app,
    url,
    cliente: () => criarCliente(url),
    fechar() {
      app.fechar();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

export function criarCliente(url) {
  const cookies = new Map();
  async function chamar(metodo, caminho, corpo, extra = {}) {
    const bruto = Buffer.isBuffer(corpo);
    const r = await fetch(url + caminho, {
      method: metodo,
      headers: { "x-nexor": "1", cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(corpo !== undefined && !bruto ? { "content-type": "application/json" } : {}), ...extra },
      body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo),
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(";");
      const [k, v] = par.split("=");
      if (v) cookies.set(k, v);
      else cookies.delete(k);
    }
    const tipo = r.headers.get("content-type") ?? "";
    const dados = tipo.includes("json") ? await r.json() : await r.text();
    return { status: r.status, dados, cabecalhos: r.headers };
  }
  return {
    get: (c, extra) => chamar("GET", c, undefined, extra),
    post: (c, b = {}, extra) => chamar("POST", c, b, extra),
    put: (c, b = {}) => chamar("PUT", c, b),
    del: (c) => chamar("DELETE", c),
  };
}

/** Certificado A1 autoassinado (só para teste) em formato .pfx */
export function certificadoTeste(senha = "1234") {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: "commonName", value: "EMPRESA TESTE LTDA:11222333000181" }, { name: "countryName", value: "BR" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}

export const CNPJ = "11222333000181";
export const CPF = "52998224725";
export const CPF2 = "11144477735";
