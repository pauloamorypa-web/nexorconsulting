/* Nexor Barber · vídeo animado (padrão da Blue). Dados fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/barber";
import { Balao, Barra, COR, Cartao, Celular, CenaFinal, CenaGancho, CenaManifesto, Cena, Check, Contador, Entra, GRAD_BOTAO, Rico, TXT, Toque, VERDE, VideoAnimado, entre, reais, useMola, pop } from "../kit";

const FALAS = [
  "Parou o corte pra atender o telefone?",
  "No Nexor Barber, o cliente agenda sozinho, em um toque.",
  "Recebe o lembrete no WhatsApp, entra na lista de espera se alguém cancelar, e ainda pode assinar o clube da barbearia.",
  "No fim do dia, o caixa e as comissões já estão fechados.",
  "Você corta. O sistema cuida do resto.",
  "Teste grátis por trinta dias. O link está na bio.",
];

/* App do cliente: serviço → barbeiro → horário → agendado */
const AppAgendar: React.FC = () => {
  const f = useCurrentFrame();
  const passo = f < 30 ? 0 : f < 60 ? 1 : f < 95 ? 2 : 3;
  const x = -entre(f, 26, 36) * 100 - entre(f, 56, 66) * 100 - entre(f, 91, 101) * 100;
  const titulo = ["Escolha o serviço", "Escolha o barbeiro", "Escolha o horário", ""][passo];
  const linha = (txt: string, sub: string, ativo: boolean): React.ReactNode => (
    <div style={{ position: "relative", padding: "26px 28px", borderRadius: 24, marginBottom: 16, background: ativo ? GRAD_BOTAO : "#fff", color: ativo ? "#fff" : "#0b1733", boxShadow: "0 6px 18px rgba(11,23,51,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 32 }}>
      {txt}
      {txt === "Corte + barba" && <Toque em={22} />}
      <span style={{ fontWeight: 500, fontSize: 28, opacity: 0.8 }}>{sub}</span>
    </div>
  );
  const horas = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "15:30", "16:00", "17:30"];
  return (
    <div style={{ position: "absolute", inset: 0, paddingTop: 80 }}>
      <div style={{ padding: "0 32px", fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#5b6b88" }}>✂️ Barbearia Navalha</div>
      <div style={{ padding: "8px 32px 24px", fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 46, color: "#0b1733" }}>{titulo}</div>
      <div style={{ display: "flex", width: "400%", transform: `translateX(${x / 4}%)` }}>
        <div style={{ width: "25%", padding: "0 28px" }}>
          {linha("Corte", "R$ 45", false)}
          {linha("Corte + barba", "R$ 70", f >= 22)}
          {linha("Barba", "R$ 35", false)}
          {linha("Pigmentação", "R$ 60", false)}
        </div>
        <div style={{ width: "25%", padding: "0 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignContent: "start" }}>
          {[["RS", "Rafael", "#7c3aed"], ["BA", "Bruno", "#0ea5e9"], ["DM", "Diego", "#db2777"], ["?", "Sem preferência", "#64748b"]].map(([ini, n, c]) => (
            <div key={n} style={{ position: "relative", padding: 22, borderRadius: 24, background: n === "Rafael" && f >= 50 ? GRAD_BOTAO : "#fff", color: n === "Rafael" && f >= 50 ? "#fff" : "#0b1733", textAlign: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 28 }}>
              <div style={{ width: 96, height: 96, borderRadius: 48, margin: "0 auto 12px", background: c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>{ini}</div>
              {n}
              {n === "Rafael" && <Toque em={50} />}
            </div>
          ))}
        </div>
        <div style={{ width: "25%", padding: "0 28px" }}>
          <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#5b6b88", marginBottom: 16 }}>Sábado, 22</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {horas.map((h) => (
              <div key={h} style={{ position: "relative", padding: "22px 0", borderRadius: 20, textAlign: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 30, background: h === "10:30" && f >= 80 ? GRAD_BOTAO : "#fff", color: h === "10:30" && f >= 80 ? "#fff" : "#0b1733" }}>{h}{h === "10:30" && <Toque em={80} />}</div>
            ))}
          </div>
        </div>
        <div style={{ width: "25%", padding: "60px 28px 0", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Check atraso={100} tam={150} />
          </div>
          <div style={{ marginTop: 30, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 52, color: "#0b1733" }}>Agendado!</div>
          <div style={{ marginTop: 14, fontFamily: "Inter", fontWeight: 500, fontSize: 32, color: "#5b6b88", lineHeight: 1.4 }}>Corte + barba<br />Sábado, 10:30 · Rafael</div>
        </div>
      </div>
    </div>
  );
};

const CenaAgendar: React.FC<{ d: number }> = ({ d }) => {
  const p = useMola(0);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(70), ...pop(p) }}>
        <Rico texto="Agenda *em um toque.*" />
      </div>
      <div style={{ position: "absolute", top: 380, left: 0, right: 0, display: "flex", justifyContent: "center", ...pop(p, 80) }}>
        <Celular largura={660} altura={960}>
          <AppAgendar />
        </Celular>
      </div>
    </Cena>
  );
};

/* Lembrete no WhatsApp, lista de espera e clube, um depois do outro */
const CenaRecursos: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  return (
    <Cena d={d}>
      <Cartao atraso={0} estilo={{ position: "absolute", top: 250, left: 60, right: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, ...TXT(34, 600, "#4ade80") }}>💬 WhatsApp · lembrete</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          <Balao de="outro">Amanhã, 10:30, com o Rafael ✂️ Confirma?</Balao>
          {f > 26 && (
            <Entra atraso={26} y={20} estilo={{ alignSelf: "flex-end" }}>
              <Balao de="eu">Confirmado 👍</Balao>
            </Entra>
          )}
        </div>
      </Cartao>
      <Cartao atraso={58} estilo={{ position: "absolute", top: 720, left: 60, right: 60 }}>
        <div style={{ ...TXT(34, 600, COR.suave) }}>📋 Lista de espera</div>
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 20, ...TXT(40, 600) }}>
          <span style={{ textDecoration: f > 70 ? "line-through" : "none", opacity: f > 70 ? 0.5 : 1 }}>15:00 cancelou</span>
          <span style={{ fontSize: 44 }}>→</span>
          <span style={{ color: f > 86 ? "#4ade80" : COR.gelo }}>{f > 86 ? "João pegou" : "avisando João…"}</span>
          {f > 86 && <Check atraso={86} tam={70} />}
        </div>
      </Cartao>
      <Cartao atraso={108} destaque estilo={{ position: "absolute", top: 1010, left: 60, right: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ ...TXT(34, 600, COR.suave) }}>👑 Clube da barbearia</div>
            <div style={{ marginTop: 10, ...TXT(52) }}>Cabelo e barba <Rico texto="*ilimitados*" /></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...TXT(84), color: COR.ciano }}><Contador q0={112} q1={160} ate={47} /></div>
            <div style={{ ...TXT(28, 500, COR.suave) }}>assinantes</div>
          </div>
        </div>
      </Cartao>
    </Cena>
  );
};

/* Caixa e comissões fechando sozinhos */
const CenaCaixa: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const fechado = useMola(68, { damping: 9, mass: 0.6 });
  const barbeiros: [string, number, string][] = [["Rafael", 312, "#7c3aed"], ["Bruno", 268, "#0ea5e9"], ["Diego", 196, "#db2777"]];
  return (
    <Cena d={d}>
      <Cartao atraso={0} estilo={{ position: "absolute", top: 260, left: 60, right: 60 }}>
        <div style={{ ...TXT(36, 600, COR.suave) }}>💰 Caixa de hoje</div>
        <div style={{ marginTop: 10, ...TXT(120), letterSpacing: "-0.02em" }}>
          <Rico texto={`*${reais(Math.round(entre(f, 4, 50) * 184000) / 100)}*`} />
        </div>
        <div style={{ ...TXT(32, 500, COR.suave) }}>
          <Contador q0={4} q1={50} ate={34} /> atendimentos · Pix, cartão e dinheiro
        </div>
      </Cartao>
      <Cartao atraso={14} estilo={{ position: "absolute", top: 720, left: 60, right: 60 }}>
        <div style={{ ...TXT(36, 600, COR.suave), marginBottom: 20 }}>✂️ Comissões</div>
        {barbeiros.map(([n, v, c], i) => (
          <div key={n} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...TXT(40, 600) }}>
              <span><span style={{ display: "inline-block", width: 22, height: 22, borderRadius: 11, background: c, marginRight: 14 }} />{n}</span>
              <span>{reais(Math.round(entre(f, 20 + i * 6, 60 + i * 6) * v * 100) / 100)}</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <Barra q0={20 + i * 6} q1={60 + i * 6} ate={v / 330} altura={14} />
            </div>
          </div>
        ))}
      </Cartao>
      {f > 66 && (
        <div style={{ position: "absolute", top: 1300, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 20, ...TXT(56, 600, VERDE), transform: `scale(${fechado})` }}>
          <Check atraso={68} tam={80} /> Dia fechado
        </div>
      )}
    </Cena>
  );
};

export const VideoBarber: React.FC = () => (
  <VideoAnimado
    pasta="barber"
    nome="Nexor Barber"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[4, 5]}
    cenas={[
      (d) => <CenaGancho d={d} icone="📞" texto="Parou o corte pra *atender o telefone?*" />,
      (d) => <CenaAgendar d={d} />,
      (d) => <CenaRecursos d={d} />,
      (d) => <CenaCaixa d={d} />,
      (d) => <CenaManifesto d={d} linha1="Você corta." linha2="O sistema cuida do resto." emoji="✂️" />,
      (_d, voz) => <CenaFinal voz={voz} icone="✂️" chamada="Teste grátis por *30 dias*" botao="Link na bio →" />,
    ]}
  />
);
export const temposBarber = tempos;
