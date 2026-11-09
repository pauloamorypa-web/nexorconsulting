import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

const instanteLocal = (valor) => {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return new Date(NaN);
  return new Date(`${valor}:00-03:00`);
};

export class CalendarError extends Error {
  constructor(status, code = "CALENDAR_ERROR") {
    super("Google Calendar indisponível");
    this.name = "CalendarError";
    this.status = status;
    this.code = code;
  }
}

export function criarGoogleCalendar({ configuracao = config.googleCalendar, fetchFn = fetch, agora = Date.now } = {}) {
  let token = "";
  let expiraEm = 0;
  let refreshFila;
  const configurado = () => Boolean(configuracao.clientId && configuracao.clientSecret && configuracao.refreshToken && configuracao.calendarId);

  async function obterToken() {
    if (!configurado()) throw new CalendarError(503, "CALENDAR_NOT_CONFIGURED");
    if (token && expiraEm - agora() > 60_000) return token;
    if (refreshFila) return refreshFila;
    refreshFila = (async () => {
      let resposta;
      try {
        resposta = await fetchFn(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: configuracao.clientId, client_secret: configuracao.clientSecret, refresh_token: configuracao.refreshToken, grant_type: "refresh_token" }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new CalendarError(503, "CALENDAR_AUTH_UNAVAILABLE");
      }
      if (!resposta.ok) throw new CalendarError(503, "CALENDAR_AUTH_REJECTED");
      const payload = await resposta.json();
      if (typeof payload.access_token !== "string" || !Number.isFinite(payload.expires_in)) throw new CalendarError(503, "CALENDAR_AUTH_INVALID");
      token = payload.access_token;
      expiraEm = agora() + payload.expires_in * 1000;
      return token;
    })();
    try { return await refreshFila; } finally { refreshFila = undefined; }
  }

  async function chamar(path, { method = "GET", body, query } = {}, repetir401 = true) {
    const url = new URL(`${API}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const accessToken = await obterToken();
    let resposta;
    try {
      resposta = await fetchFn(url, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new CalendarError(503, "CALENDAR_NETWORK_ERROR");
    }
    if (resposta.status === 401 && repetir401) {
      token = "";
      expiraEm = 0;
      return chamar(path, { method, body, query }, false);
    }
    if (!resposta.ok) throw new CalendarError(resposta.status === 429 ? 503 : resposta.status, resposta.status === 429 ? "CALENDAR_RATE_LIMITED" : "CALENDAR_REQUEST_REJECTED");
    return resposta.status === 204 ? {} : resposta.json();
  }

  const calendarPath = `/calendars/${encodeURIComponent(configuracao.calendarId)}`;

  return {
    configurado,

    async ocupados(de, ate) {
      const inicio = new Date(de);
      const fim = new Date(ate);
      if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) throw new CalendarError(400, "CALENDAR_RANGE_INVALID");
      const payload = await chamar("/freeBusy", {
        method: "POST",
        body: { timeMin: inicio.toISOString(), timeMax: fim.toISOString(), timeZone: "America/Sao_Paulo", items: [{ id: configuracao.calendarId }] },
      });
      const calendario = payload.calendars?.[configuracao.calendarId];
      if (!calendario || calendario.errors?.length) throw new CalendarError(503, "CALENDAR_AVAILABILITY_UNAVAILABLE");
      return (calendario.busy ?? []).map((x) => ({ inicio: new Date(x.start), fim: new Date(x.end) }));
    },

    async criarReuniao({ id, nome, contato, assunto, inicio, duracaoMinutos = 30 }) {
      const start = instanteLocal(inicio);
      if (!Number.isFinite(start.getTime()) || !Number.isInteger(duracaoMinutos) || duracaoMinutos < 10 || duracaoMinutos > 180) throw new CalendarError(400, "CALENDAR_EVENT_INVALID");
      const requestId = String(id ?? randomUUID());
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new CalendarError(400, "CALENDAR_EVENT_ID_INVALID");
      const eventId = `n${requestId.replaceAll("-", "").toLowerCase()}`;
      const end = new Date(start.getTime() + duracaoMinutos * 60_000);
      const resumo = String(assunto ?? "Apresentação Nexor").replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 160);
      const attendee = String(contato ?? "").trim();
      const attendees = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee) ? [{ email: attendee }] : [];
      const payload = await chamar(`${calendarPath}/events`, {
        method: "POST",
        query: { conferenceDataVersion: 1, sendUpdates: attendees.length ? "all" : "none" },
        body: {
          id: eventId,
          summary: resumo,
          description: `Apresentação Nexor para ${String(nome ?? "cliente").replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 120)}.\nAssunto: ${resumo}`,
          start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
          end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
          visibility: "private",
          attendees,
          conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
        },
      });
      if (!payload.id) throw new CalendarError(502, "CALENDAR_EVENT_RESPONSE_INVALID");
      return { id: payload.id, link: payload.htmlLink ?? null, linkReuniao: payload.hangoutLink ?? payload.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null };
    },

    async cancelarReuniao(eventId) {
      if (!/^n[0-9a-v]{32,64}$/.test(String(eventId))) throw new CalendarError(400, "CALENDAR_EVENT_ID_INVALID");
      await chamar(`${calendarPath}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", query: { sendUpdates: "all" } });
    },
  };
}
