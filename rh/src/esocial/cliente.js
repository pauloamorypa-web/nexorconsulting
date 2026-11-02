/* Cliente dos webservices do eSocial (SOAP 1.1 com autenticação mútua por certificado A1).
   Ambiente 2 = Produção restrita (testes), ambiente 1 = Produção. */

import { request } from "node:https";
import { el, tag, tags, atributo } from "./xml.js";

export const URLS = {
  1: {
    envio: "https://webservices.envio.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
    consulta: "https://webservices.consulta.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
  },
  2: {
    envio: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
    consulta: "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
  },
};

const NS_ENVIO = "http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0";
const NS_CONSULTA = "http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0";

/** Monta o lote (até 50 eventos assinados do mesmo grupo) */
export function montarLote({ empresa, transmissorCnpj, grupo, eventos }) {
  const raiz = String(empresa.cnpj).replace(/\D/g, "").slice(0, 8);
  const corpo = eventos.map((e) => `<evento Id="${e.id_evento}">${e.xml_assinado}</evento>`).join("");
  return `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1"><envioLoteEventos grupo="${grupo}">${el("ideEmpregador", el("tpInsc", "1"), el("nrInsc", raiz))}${el("ideTransmissor", el("tpInsc", "1"), el("nrInsc", String(transmissorCnpj || empresa.cnpj).replace(/\D/g, "")))}<eventos>${corpo}</eventos></envioLoteEventos></eSocial>`;
}

const soap = (nsServ, operacao, param, conteudo) =>
  `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="${nsServ}"><soapenv:Header/><soapenv:Body><v1:${operacao}><v1:${param}>${conteudo}</v1:${param}></v1:${operacao}></soapenv:Body></soapenv:Envelope>`;

/** Chamada SOAP com o certificado do empregador (ou da procuração) */
export function chamar({ url, acao, corpo, cert, fetchSoap }) {
  if (fetchSoap) return fetchSoap({ url, acao, corpo });
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request(
      { hostname: u.hostname, path: u.pathname, method: "POST", key: cert.chavePem, cert: cert.certPem + (cert.cadeia ?? ""), headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${acao}"`, "Content-Length": Buffer.byteLength(corpo) }, timeout: 60_000 },
      (res) => {
        const partes = [];
        res.on("data", (p) => partes.push(p));
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf8");
          if (res.statusCode >= 400 && !texto.includes("retorno")) reject(Object.assign(new Error(`eSocial respondeu HTTP ${res.statusCode}: ${tag(texto, "faultstring") ?? texto.slice(0, 300)}`), { status: 502 }));
          else resolve(texto);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("O eSocial não respondeu a tempo.")));
    req.on("error", (e) => reject(Object.assign(new Error(`Falha de conexão com o eSocial: ${e.message}`), { status: 502 })));
    req.end(corpo);
  });
}

/** Envia o lote. Devolve o protocolo para consulta posterior. */
export async function enviarLote({ ambiente, lote, cert, fetchSoap }) {
  const resposta = await chamar({ url: URLS[ambiente].envio, acao: `${NS_ENVIO}/ServicoEnviarLoteEventos/EnviarLoteEventos`, corpo: soap(NS_ENVIO, "EnviarLoteEventos", "loteEventos", lote), cert, fetchSoap });
  const status = tag(tag(resposta, "status") ?? resposta, "cdResposta");
  const descricao = tag(tag(resposta, "status") ?? resposta, "descResposta");
  return { ok: status === "201", codigo: status, descricao, protocolo: tag(resposta, "protocoloEnvio"), ocorrencias: lerOcorrencias(resposta), bruto: resposta };
}

/** Consulta o processamento do lote e o resultado de cada evento */
export async function consultarLote({ ambiente, protocolo, cert, fetchSoap }) {
  const consulta = `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/consulta/retornoProcessamento/v1_0_0"><consultaLoteEventos><protocoloEnvio>${protocolo}</protocoloEnvio></consultaLoteEventos></eSocial>`;
  const resposta = await chamar({ url: URLS[ambiente].consulta, acao: `${NS_CONSULTA}/ServicoConsultarLoteEventos/ConsultarLoteEventos`, corpo: soap(NS_CONSULTA, "ConsultarLoteEventos", "consulta", consulta), cert, fetchSoap });
  const status = tag(tag(resposta, "status") ?? resposta, "cdResposta");
  const eventos = tags(resposta, "evento").length
    ? [...resposta.matchAll(/<(?:\w+:)?evento\s[^>]*Id="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?evento>/g)].map(([, id, x]) => {
        const proc = tag(x, "processamento") ?? x;
        const cd = tag(proc, "cdResposta");
        return { id, codigo: cd, ok: cd === "201" || cd === "202", descricao: tag(proc, "descResposta"), recibo: tag(x, "nrRecibo"), ocorrencias: lerOcorrencias(x) };
      })
    : [];
  return { codigo: status, processado: status === "201" || status === "202", emProcessamento: status === "101", descricao: tag(tag(resposta, "status") ?? resposta, "descResposta"), eventos, bruto: resposta };
}

function lerOcorrencias(xml) {
  return [...String(xml).matchAll(/<(?:\w+:)?ocorrencia>([\s\S]*?)<\/(?:\w+:)?ocorrencia>/g)].map(([, o]) => ({ codigo: tag(o, "codigo"), descricao: tag(o, "descricao"), tipo: tag(o, "tipo"), localizacao: tag(o, "localizacao") }));
}

void atributo;
