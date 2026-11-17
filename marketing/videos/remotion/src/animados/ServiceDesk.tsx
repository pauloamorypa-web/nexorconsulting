/* Nexor Service Desk · vídeo animado (padrão da Blue). Empresa, pessoas e máquinas fictícias. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/servicedesk";
import { COR, Cartao, CenaFinal, CenaManifesto, Cena, Entra, GRAD, GRAD_BOTAO, Palavras, Rico, TXT, Toque, VERDE, VideoAnimado, entre, pop, useMola } from "../kit";

const FALAS = [
  "Pedido pelo corredor, pelo WhatsApp, pelo e-mail. Qual era o urgente mesmo?",
  "No Nexor Service Desk, todo pedido vira um chamado, com prioridade, prazo e responsável.",
  "Pediu uma informação ao usuário? O prazo pausa até ele responder.",
  "Você vê cada computador da empresa, e reinicia ou instala de longe, com permissão e registro.",
  "O painel mostra os números do mês, e a televisão da sala mostra a fila.",
  "Tudo no seu servidor, com os dados sob o seu controle.",
  "Teste grátis por trinta dias. O link está na bio.",
];

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};
const PRIO: Record<string, string> = { Crítica: "#ef4444", Alta: "#f59e0b", Média: "#3b82f6", Baixa: "#22c55e" };

/* 0 · Pedidos chegando de todo lado */
const CenaCaos: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const pedidos: [string, string, number, number, number][] = [["🚶", "A impressora parou!", -1, 380, 4], ["💬", "Tô sem internet aqui", 1, 560, 16], ["📧", "Preciso de acesso ao sistema", -1, 740, 28], ["📞", "O computador não liga", 1, 920, 40]];
  return (
    <Cena d={d}>
      {pedidos.map(([ic, t, lado, top, at]) => {
        const p = entre(f, at, at + 16);
        const treme = f > 70 ? Math.sin(f * 1.3 + top) * 6 : 0;
        return (
          <div key={t} style={{ position: "absolute", top, [lado < 0 ? "left" : "right"]: 60, padding: "24px 32px", borderRadius: 30, background: "rgba(235,241,249,0.96)", ...TXT(38, 600, "#0b1733"), transform: `translateX(${(1 - p) * lado * 700 + treme}px) rotate(${lado * -2}deg)`, boxShadow: "0 18px 50px rgba(0,0,0,0.4)" }}>
            {ic} {t}
          </div>
        );
      })}
      <Palavras texto="Qual era *o urgente* mesmo?" atraso={70} passo={5} estilo={{ position: "absolute", top: 1140, left: 72, right: 72, ...TXT(96), letterSpacing: "-0.02em" }} />
    </Cena>
  );
};

/* 1 · Tudo vira chamado: prioridade, prazo e responsável */
const CenaChamados: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const lista: [string, string, string, number, string][] = [["#2487", "Servidor de arquivos fora do ar", "Crítica", 45, "Bruno"], ["#2485", "Sem acesso à pasta do Financeiro", "Alta", 312, "Ana"], ["#2484", "Impressora da recepção", "Média", 840, "Rafael"], ["#2483", "Instalar leitor de PDF", "Baixa", 2880, "Ana"]];
  return (
    <Cena d={d}>
      <Titulo texto="Todo pedido *vira um chamado.*" />
      <div style={{ position: "absolute", top: 400, left: 50, right: 50, display: "flex", flexDirection: "column", gap: 16 }}>
        {lista.map(([n, t, pr, min, resp], i) => {
          const rest = Math.max(1, min - Math.floor(f / 8));
          const h = Math.floor(rest / 60);
          return (
            <Cartao key={n} atraso={i * 9} estilo={{ padding: "26px 30px", borderLeft: `10px solid ${PRIO[pr]}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", ...TXT(26, 600, COR.suave) }}>
                <span>{n}</span>
                <span style={{ color: PRIO[pr] }}>● {pr}</span>
              </div>
              <div style={{ ...TXT(38, 600), marginTop: 8 }}>{t}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, ...TXT(28, 500, COR.suave) }}>
                <span>⏱️ restam {h > 0 ? `${h}h ` : ""}{rest % 60} min</span>
                <span>👤 {resp}</span>
              </div>
            </Cartao>
          );
        })}
      </div>
    </Cena>
  );
};

/* 2 · Pediu informação: o prazo pausa */
const CenaPausa: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const pausa = f >= 44;
  const seg = pausa ? 44 : f;
  const total = 5 * 3600 + 7 * 60 - seg * 23;
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const p = useMola(44, { damping: 9, mass: 0.6 });
  return (
    <Cena d={d}>
      <Titulo texto="O prazo *pausa sozinho.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 400, left: 60, right: 60 }}>
        <div style={{ ...TXT(30, 600, COR.suave) }}>#2485 · Sem acesso à pasta do Financeiro</div>
        <div style={{ marginTop: 20, padding: "22px 26px", borderRadius: 24, background: "rgba(255,255,255,0.06)", ...TXT(34, 500) }}>
          <b style={{ color: COR.ciano }}>Ana:</b> <span>Juliana, qual computador você está usando?</span>
        </div>
        <div style={{ marginTop: 28, ...TXT(30, 600, COR.suave) }}>Prazo (SLA)</div>
        <div style={{ ...TXT(120), letterSpacing: "-0.02em", color: pausa ? "#fbbf24" : COR.gelo }}>
          {hh}h {String(mm).padStart(2, "0")}min {String(ss).padStart(2, "0")}s
        </div>
        {pausa && (
          <div style={{ marginTop: 14, display: "inline-block", padding: "14px 26px", borderRadius: 999, background: "rgba(245,158,11,0.2)", ...TXT(34, 600, "#fbbf24"), transform: `scale(${p})` }}>⏸ Pausado · aguardando o usuário</div>
        )}
      </Cartao>
    </Cena>
  );
};

/* 3 · Cada computador, de longe, com permissão e registro */
const CenaMaquinas: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const pcs = ["FIN-PC04", "ADM-NB02", "SRV-ARQ01", "ALM-PC02", "DEV-NB05", "REC-PC01", "RH-PC03", "VEN-NB07", "DIR-NB01"];
  const sel = f >= 26;
  const instala = entre(f, 66, 120);
  const ok = f >= 122;
  return (
    <Cena d={d}>
      <Titulo texto="Cada computador, *de longe.*" />
      <div style={{ position: "absolute", top: 400, left: 60, right: 60, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {pcs.map((n, i) => {
          const alvo = n === "REC-PC01";
          const off = n === "ALM-PC02";
          return (
            <Entra key={n} atraso={i * 3} y={24}>
              <div style={{ position: "relative", padding: "22px 10px", borderRadius: 24, textAlign: "center", background: alvo && sel ? "linear-gradient(135deg, rgba(0,88,250,0.85), rgba(0,180,255,0.7))" : "rgba(14,30,66,0.62)", border: `1.5px solid ${alvo && sel ? COR.ciano : "rgba(120,170,255,0.22)"}` }}>
                <div style={{ fontSize: 56 }}>{n.startsWith("SRV") ? "🗄️" : n.includes("NB") ? "💻" : "🖥️"}</div>
                <div style={{ ...TXT(26, 600), marginTop: 6 }}>{n}</div>
                <div style={{ ...TXT(22, 600, off ? "#94a3b8" : "#4ade80") }}>● {off ? "offline" : "online"}</div>
                {alvo && <Toque em={24} />}
              </div>
            </Entra>
          );
        })}
      </div>
      {sel && (
        <Cartao atraso={30} estilo={{ position: "absolute", top: 1000, left: 60, right: 60, padding: "28px 34px" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {["🔄 Reiniciar", "📦 Instalar programa"].map((a, i) => (
              <div key={a} style={{ position: "relative", flex: 1, padding: "20px 0", textAlign: "center", borderRadius: 20, background: i === 1 && f >= 60 ? GRAD_BOTAO : "rgba(255,255,255,0.08)", ...TXT(30, 600) }}>
                {a}
                {i === 1 && <Toque em={58} />}
              </div>
            ))}
          </div>
          {f >= 64 && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", ...TXT(30, 600) }}>
                <span>Leitor de PDF → REC-PC01</span>
                <span style={{ color: ok ? "#4ade80" : COR.ciano }}>{ok ? "instalado" : `${Math.round(instala * 100)}%`}</span>
              </div>
              <div style={{ marginTop: 10, height: 14, borderRadius: 7, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ width: `${instala * 100}%`, height: "100%", background: ok ? VERDE : GRAD }} />
              </div>
              <div style={{ marginTop: 14, ...TXT(26, 500, COR.suave) }}>🔐 aprovado por Ana · registrado na auditoria</div>
            </div>
          )}
        </Cartao>
      )}
    </Cena>
  );
};

/* 4a · Painel com os números do mês */
const CenaPainel: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const barras = [12, 18, 15, 22, 19, 25, 17, 21, 24, 16, 20, 23];
  return (
    <Cena d={d}>
      <Titulo texto="Os números *do mês.*" />
      <div style={{ position: "absolute", top: 400, left: 60, right: 60, display: "flex", gap: 16 }}>
        {[["312", "chamados"], ["94%", "no prazo"], ["3h40", "tempo médio"]].map(([n, l], i) => (
          <Cartao key={l} atraso={i * 5} estilo={{ flex: 1, padding: "26px 18px", textAlign: "center" }}>
            <div style={{ ...TXT(66), color: COR.ciano }}>{i === 0 ? Math.round(entre(f, 4, 40) * 312) : i === 1 ? `${Math.round(entre(f, 4, 40) * 94)}%` : n}</div>
            <div style={{ ...TXT(26, 600, COR.suave) }}>{l}</div>
          </Cartao>
        ))}
      </div>
      <Cartao atraso={10} estilo={{ position: "absolute", top: 640, left: 60, right: 60 }}>
        <div style={{ ...TXT(32, 600, COR.suave) }}>Abertos e resolvidos por dia</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 320, marginTop: 20 }}>
          {barras.map((b, i) => (
            <div key={i} style={{ flex: 1, height: `${entre(f, 10 + i * 2, 30 + i * 2) * (b / 25) * 100}%`, borderRadius: 10, background: GRAD }} />
          ))}
        </div>
      </Cartao>
    </Cena>
  );
};

/* 4b · A televisão da sala mostra a fila */
const CenaTV: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const fila: [string, string, string][] = [["#2487", "Infraestrutura", "Crítica"], ["#2485", "Acessos", "Alta"], ["#2484", "Equipamentos", "Média"], ["#2483", "Software", "Baixa"], ["#2480", "E-mail", "Média"]];
  return (
    <Cena d={d}>
      <Titulo texto="A fila *na televisão.*" />
      <Entra atraso={0} y={50} estilo={{ position: "absolute", top: 420, left: 40, right: 40 }}>
        <div style={{ padding: 18, borderRadius: 28, background: "#0b1020", boxShadow: "0 40px 100px rgba(0,0,0,0.6)", border: "4px solid #1e293b" }}>
          <div style={{ borderRadius: 16, padding: "26px 28px", background: "linear-gradient(160deg, #0b1d4a, #050d24)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...TXT(32, 600) }}>
              <span>Central de chamados</span>
              <span style={{ color: "#4ade80" }}>● ao vivo</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
              {[["18", "abertos"], ["3", "sem técnico"], ["9", "resolvidos"]].map(([n, l]) => (
                <div key={l} style={{ flex: 1, padding: "16px 0", borderRadius: 14, background: "rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ ...TXT(52), color: COR.ciano }}>{n}</div>
                  <div style={{ ...TXT(22, 600, COR.suave) }}>{l}</div>
                </div>
              ))}
            </div>
            {fila.map(([n, c, pr], i) => (
              <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "14px 4px", borderBottom: "1px solid rgba(255,255,255,0.07)", ...TXT(28, 500), opacity: entre(f, 6 + i * 5, 14 + i * 5) }}>
                <span>{n} · {c}</span>
                <span style={{ color: PRIO[pr] }}>{pr}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: 160, height: 60, margin: "0 auto", background: "#1e293b", borderRadius: "0 0 20px 20px" }} />
      </Entra>
    </Cena>
  );
};

export const VideoServiceDesk: React.FC = () => (
  <VideoAnimado
    pasta="servicedesk"
    nome="Nexor Service Desk"
    falas={FALAS}
    tempos={tempos}
    inicios={[0, 5.11, 10.62, 14.3, 19.88, 21.6, 23.73, 27.14]}
    semLegenda={[5, 6]}
    cenas={[
      (d) => <CenaCaos d={d} />,
      (d) => <CenaChamados d={d} />,
      (d) => <CenaPausa d={d} />,
      (d) => <CenaMaquinas d={d} />,
      (d) => <CenaPainel d={d} />,
      (d) => <CenaTV d={d} />,
      (d) => <CenaManifesto d={d} linha1="Tudo no seu servidor." linha2="Seus dados, seu controle." emoji="🔐" />,
      (_d, voz) => <CenaFinal voz={voz} icone="🖥️" chamada="Teste grátis por *30 dias*" botao="Link na bio →" />,
    ]}
  />
);
export const temposServiceDesk = tempos;
