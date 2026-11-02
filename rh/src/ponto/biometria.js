/* Biometria do celular via WebAuthn (padrão W3C/FIDO2): a digital ou o rosto do trabalhador é conferido pelo
   próprio aparelho, que assina um desafio com uma chave guardada no chip de segurança. O servidor confere a
   assinatura com a chave pública cadastrada. A biometria nunca sai do celular (bom para a LGPD). */

import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const deB64url = (s) => Buffer.from(String(s ?? ""), "base64url");
const sha256 = (b) => createHash("sha256").update(b).digest();

/* ---------- CBOR (RFC 8949), só o necessário para WebAuthn ---------- */
export function decodificarCbor(buf) {
  let pos = 0;
  const ler = () => {
    const ini = buf[pos++];
    const maior = ini >> 5;
    let info = ini & 31;
    let valor;
    if (info < 24) valor = info;
    else if (info === 24) valor = buf[pos++];
    else if (info === 25) (valor = buf.readUInt16BE(pos)), (pos += 2);
    else if (info === 26) (valor = buf.readUInt32BE(pos)), (pos += 4);
    else if (info === 27) (valor = Number(buf.readBigUInt64BE(pos))), (pos += 8);
    else throw new Error("CBOR: tamanho indefinido não suportado");
    switch (maior) {
      case 0: return valor;
      case 1: return -1 - valor;
      case 2: { const b = buf.subarray(pos, pos + valor); pos += valor; return b; }
      case 3: { const t = buf.subarray(pos, pos + valor).toString("utf8"); pos += valor; return t; }
      case 4: return Array.from({ length: valor }, ler);
      case 5: { const m = new Map(); for (let i = 0; i < valor; i++) { const k = ler(); m.set(k, ler()); } return m; }
      case 6: return ler(); // tag: ignora e devolve o conteúdo
      case 7: return info === 20 ? false : info === 21 ? true : null;
      default: throw new Error("CBOR inválido");
    }
  };
  const r = ler();
  return { valor: r, lidos: pos };
}

/** Lê o authenticatorData: hash do site, flags, contador e (no cadastro) a credencial */
export function lerAuthData(buf) {
  const r = { rpIdHash: buf.subarray(0, 32), flags: buf[32], contador: buf.readUInt32BE(33) };
  r.presente = Boolean(r.flags & 0x01);
  r.verificado = Boolean(r.flags & 0x04);
  if (r.flags & 0x40) {
    const tam = buf.readUInt16BE(53);
    r.credencialId = buf.subarray(55, 55 + tam);
    const { valor } = decodificarCbor(buf.subarray(55 + tam));
    r.coseKey = valor;
  }
  return r;
}

/** Chave COSE → chave pública do Node (ES256 ou RS256) */
export function chaveCose(cose) {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2) {
    return { alg, jwk: { kty: "EC", crv: "P-256", x: b64url(cose.get(-2)), y: b64url(cose.get(-3)) } };
  }
  if (kty === 3) {
    return { alg, jwk: { kty: "RSA", n: b64url(cose.get(-1)), e: b64url(cose.get(-2)) } };
  }
  throw new Error("Tipo de chave não suportado");
}

const conferirClientData = (clientDataB64, tipo, desafio, origens) => {
  const bruto = deB64url(clientDataB64);
  const c = JSON.parse(bruto.toString("utf8"));
  if (c.type !== tipo) throw new Error("Tipo de operação inválido");
  if (c.challenge !== desafio) throw new Error("Desafio inválido ou expirado");
  if (!origens.includes(c.origin)) throw new Error(`Origem não permitida: ${c.origin}`);
  return bruto;
};

/** Guarda desafios de uso único por alguns minutos */
export function criarDesafios(validadeMs = 5 * 60_000) {
  const m = new Map();
  return {
    novo(chave) {
      const d = b64url(randomBytes(32));
      m.set(chave, { d, expira: Date.now() + validadeMs });
      if (m.size > 10_000) m.delete(m.keys().next().value);
      return d;
    },
    usar(chave) {
      const v = m.get(chave);
      m.delete(chave);
      return v && v.expira > Date.now() ? v.d : null;
    },
  };
}

/** Opções para o celular criar a credencial biométrica */
export function opcoesCadastro({ desafio, rpId, rpNome, colaborador, excluir = [] }) {
  return {
    challenge: desafio,
    rp: { id: rpId, name: rpNome },
    user: { id: b64url(Buffer.from(colaborador.id)), name: colaborador.cpf, displayName: colaborador.nome },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
    attestation: "none",
    timeout: 60000,
    excludeCredentials: excluir.map((id) => ({ type: "public-key", id })),
  };
}

/** Confere o cadastro e devolve a credencial a guardar */
export function conferirCadastro({ resposta, desafio, rpId, origens }) {
  conferirClientData(resposta.clientDataJSON, "webauthn.create", desafio, origens);
  const { valor: att } = decodificarCbor(deB64url(resposta.attestationObject));
  const auth = lerAuthData(att.get("authData"));
  if (!auth.rpIdHash.equals(sha256(rpId))) throw new Error("Credencial de outro site");
  if (!auth.presente || !auth.verificado) throw new Error("A biometria não foi confirmada no aparelho");
  if (!auth.credencialId) throw new Error("Credencial ausente");
  const { alg, jwk } = chaveCose(auth.coseKey);
  createPublicKey({ key: jwk, format: "jwk" }); // valida a chave
  return { id: b64url(auth.credencialId), chave: JSON.stringify(jwk), alg, contador: auth.contador };
}

/** Opções para o celular confirmar a biometria ao registrar o ponto */
export function opcoesConfirmacao({ desafio, rpId, credenciais }) {
  return { challenge: desafio, rpId, allowCredentials: credenciais.map((c) => ({ type: "public-key", id: c.id, transports: ["internal", "hybrid"] })), userVerification: "required", timeout: 60000 };
}

/** Confere a assinatura biométrica; devolve o novo contador */
export function conferirConfirmacao({ resposta, desafio, rpId, origens, credencial }) {
  const clientData = conferirClientData(resposta.clientDataJSON, "webauthn.get", desafio, origens);
  const authData = deB64url(resposta.authenticatorData);
  const auth = lerAuthData(authData);
  if (!auth.rpIdHash.equals(sha256(rpId))) throw new Error("Credencial de outro site");
  if (!auth.presente || !auth.verificado) throw new Error("A biometria não foi confirmada no aparelho");
  const chave = createPublicKey({ key: JSON.parse(credencial.chave), format: "jwk" });
  const dados = Buffer.concat([authData, sha256(clientData)]);
  const ok = verify(credencial.alg === -257 ? "sha256" : "sha256", dados, credencial.alg === -257 ? chave : { key: chave, dsaEncoding: "der" }, deB64url(resposta.signature));
  if (!ok) throw new Error("Assinatura biométrica inválida");
  // Contador que não avança pode indicar credencial clonada (aparelhos que não usam contador mandam sempre 0)
  if (auth.contador !== 0 && auth.contador <= credencial.contador) throw new Error("Credencial possivelmente clonada");
  return { contador: auth.contador };
}
