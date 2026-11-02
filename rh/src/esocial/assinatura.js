/* Certificado digital A1 (arquivo .pfx/.p12, ICP-Brasil) e assinatura XMLDSig enveloped exigida pelo eSocial:
   RSA-SHA256, C14N 1.0, Reference URI="" (o evento inteiro). O certificado fica criptografado no banco. */

import { createHash, createSign, X509Certificate } from "node:crypto";
import forge from "node-forge";

/** Lê o .pfx e devolve chave privada, certificado e dados do titular */
export function lerCertificado(pfx, senha) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(pfx).toString("binary")));
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch {
    throw Object.assign(new Error("Não foi possível abrir o certificado. Confira a senha."), { status: 400 });
  }
  const chaves = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []), ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!chaves.length || !certs.length) throw Object.assign(new Error("O arquivo não contém chave e certificado."), { status: 400 });
  const chavePem = forge.pki.privateKeyToPem(chaves[0].key);
  // O certificado do titular é o que corresponde à chave (não a cadeia da AC)
  const pub = forge.pki.setRsaPublicKey(chaves[0].key.n, chaves[0].key.e);
  const certBag = certs.find((b) => forge.pki.publicKeyToPem(b.cert.publicKey) === forge.pki.publicKeyToPem(pub)) ?? certs[0];
  const certPem = forge.pki.certificateToPem(certBag.cert);
  const x509 = new X509Certificate(certPem);
  return {
    chavePem,
    certPem,
    certBase64: certPem.replace(/-----[^-]+-----|\s/g, ""),
    titular: x509.subject.split("\n").find((l) => l.startsWith("CN="))?.slice(3) ?? x509.subject,
    validoDe: new Date(x509.validFrom).getTime(),
    validoAte: new Date(x509.validTo).getTime(),
    cadeia: certs.map((b) => forge.pki.certificateToPem(b.cert)).join(""),
  };
}

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/** Assina o evento: insere <Signature> como último filho do elemento raiz <eSocial> */
export function assinarXml(xml, cert) {
  const fimRaiz = xml.lastIndexOf("</");
  if (fimRaiz < 0) throw new Error("XML inválido");
  const digest = createHash("sha256").update(xml, "utf8").digest("base64");
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI=""><Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="${C14N}"></Transform>` +
    `</Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const assinatura = createSign("RSA-SHA256").update(signedInfo, "utf8").sign(cert.chavePem, "base64");
  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo.replace(' xmlns="http://www.w3.org/2000/09/xmldsig#"', "")}` +
    `<SignatureValue>${assinatura}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${cert.certBase64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return xml.slice(0, fimRaiz) + signature + xml.slice(fimRaiz);
}

/** Assinatura CAdES destacada (PKCS#7) para o AFD da Portaria 671 */
export function assinarArquivoCades(conteudo, cert) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(Buffer.from(conteudo, "utf8").toString("binary"));
  const c = forge.pki.certificateFromPem(cert.certPem);
  p7.addCertificate(c);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(cert.chavePem),
    certificate: c,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}
