/* Nexor RH + Ponto · vídeo animado (padrão da Blue). Pessoas e valores fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/rh";
import { COR, Cartao, Celular, CenaFinal, CenaGancho, CenaManifesto, Cena, Check, Chip, Entra, GRAD, GRAD_BOTAO, Rico, TXT, Toque, VERDE, VideoAnimado, entre, pop, reais, useMola } from "../kit";

const FALAS = [
  "Dia trinta. E você ainda soma o ponto no papel?",
  "No Nexor RH, o colaborador bate o ponto pelo celular, com a digital ou o rosto.",
  "O espelho de ponto sai pronto, dentro da Portaria 671.",
  "A folha sai calculada, e o holerite chega no aplicativo de cada um.",
  "E o eSocial vai junto, assinado com o seu certificado.",
  "Você cuida das pessoas. O sistema cuida das contas.",
  "Teste grátis por trinta dias. O link está na bio.",
];

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};

/* 0 · Folha de papel com horários sendo riscados */
const Papel: React.FC = () => {
  const f = useCurrentFrame();
  const linhas = ["01 · 08:02  12:01  13:05  18:10", "02 · 07:58  12:00  13:02  18:04", "03 · 08:11  12:03  13:00  18:21", "04 · ??:??  12:05  13:10  17:58"];
  return (
    <div style={{ marginTop: 60, padding: "34px 40px", borderRadius: 18, background: "#fdf8e7", transform: "rotate(-2deg)", boxShadow: "0 30px 70px rgba(0,0,0,0.45)" }}>
      {linhas.map((l, i) => {
        const p = entre(f, 10 + i * 9, 18 + i * 9);
        return (
          <div key={l} style={{ position: "relative", fontFamily: "Inter", fontWeight: 500, fontSize: 38, color: "#3b3b3b", padding: "10px 0", borderBottom: "1.5px dashed #c9bfa0", opacity: p }}>
            {l}
            <div style={{ position: "absolute", left: 0, top: "50%", height: 5, borderRadius: 3, background: "#ef4444", width: `${entre(f, 50 + i * 4, 60 + i * 4) * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
};

/* 1 · App: relógio ao vivo, rosto ou digital, ponto registrado */
const AppPonto: React.FC = () => {
  const f = useCurrentFrame();
  const seg = Math.floor(f / 30);
  const modoRosto = f >= 40;
  const varre = (f % 30) / 30;
  const ok = f >= 92;
  return (
    <div style={{ position: "absolute", inset: 0, paddingTop: 90, textAlign: "center", background: "linear-gradient(180deg, #eef3ff, #f7f9fd)" }}>
      <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#5b6b88" }}>Meu Ponto · Ana Souza</div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 110, color: "#0b1733", marginTop: 10 }}>07:59:{String(52 + seg).padStart(2, "0")}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 14 }}>
        {["👆 Digital", "🙂 Rosto"].map((m, i) => {
          const ativo = (i === 1) === modoRosto;
          return (
            <div key={m} style={{ position: "relative", padding: "16px 30px", borderRadius: 999, fontFamily: "Inter", fontWeight: 600, fontSize: 30, background: ativo ? GRAD_BOTAO : "#fff", color: ativo ? "#fff" : "#0b1733" }}>
              {m}
              {i === 1 && <Toque em={40} />}
            </div>
          );
        })}
      </div>
      <div style={{ position: "relative", width: 330, height: 330, margin: "40px auto 0", borderRadius: modoRosto ? 165 : 40, border: `8px solid ${ok ? VERDE : COR.azul}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 190, overflow: "hidden" }}>
        {ok ? <Check atraso={92} tam={190} /> : modoRosto ? "🙂" : "👆"}
        {!ok && <div style={{ position: "absolute", left: 0, right: 0, top: `${varre * 100}%`, height: 8, background: COR.ciano, boxShadow: `0 0 30px ${COR.ciano}` }} />}
      </div>
      <div style={{ marginTop: 34, fontFamily: "Inter", fontWeight: 600, fontSize: 34, color: ok ? "#16a34a" : "#5b6b88" }}>
        {ok ? "Entrada registrada · 08:00" : modoRosto ? "Reconhecendo rosto…" : "Encoste o dedo"}
      </div>
      {ok && <div style={{ marginTop: 8, fontFamily: "Inter", fontWeight: 500, fontSize: 26, color: "#5b6b88" }}>📍 Loja Centro · comprovante enviado</div>}
    </div>
  );
};
const CenaApp: React.FC<{ d: number }> = ({ d }) => {
  const p = useMola(0);
  return (
    <Cena d={d}>
      <Titulo texto="Ponto pelo *celular.*" />
      <div style={{ position: "absolute", top: 380, left: 0, right: 0, display: "flex", justifyContent: "center", ...pop(p, 60) }}>
        <Celular largura={660} altura={860}>
          <AppPonto />
        </Celular>
      </div>
    </Cena>
  );
};

/* 2 · Espelho de ponto se preenchendo */
const CenaEspelho: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const dias = [["03/11", "08:00", "18:02", "8h 58"], ["04/11", "07:57", "18:00", "9h 01"], ["05/11", "08:04", "17:59", "8h 51"], ["06/11", "08:00", "18:10", "9h 06"], ["07/11", "07:59", "17:01", "8h 00"], ["…", "…", "…", "…"]];
  const horas = Math.round(entre(f, 10, 80) * 176);
  return (
    <Cena d={d}>
      <Titulo texto="Espelho de ponto *pronto.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 370, left: 60, right: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...TXT(40) }}>📄 Ana Souza · novembro</div>
          <Chip atraso={70} cor="#4ade80">✓ Portaria 671</Chip>
        </div>
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", ...TXT(28, 600, COR.suave), paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            <span>Dia</span><span>Entrada</span><span>Saída</span><span>Total</span>
          </div>
          {dias.map((l, i) => {
            const p = entre(f, 6 + i * 8, 14 + i * 8);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", ...TXT(34, 500), padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
                {l.map((c, j) => <span key={j} style={{ color: j === 3 ? COR.ciano : COR.gelo }}>{c}</span>)}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ ...TXT(34, 600, COR.suave) }}>Total do mês</span>
          <span style={{ ...TXT(80), background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{horas}h 20min</span>
        </div>
      </Cartao>
    </Cena>
  );
};

/* 3 · Folha calculada e holerite chegando no app */
const CenaFolha: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const linhas: [string, number, boolean][] = [["Salário", 3200, false], ["Horas extras", 286.4, false], ["INSS", -307.79, true], ["IRRF", -46.19, true]];
  const liquido = 3132.42;
  const notif = useMola(42, { damping: 12, mass: 0.7 });
  return (
    <Cena d={d}>
      <Titulo texto="Folha *calculada.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 370, left: 60, right: 60 }}>
        {linhas.map(([n, v, desc], i) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", ...TXT(38, 500), opacity: entre(f, 4 + i * 7, 12 + i * 7) }}>
            <span>{n}</span>
            <span style={{ color: desc ? "#f87171" : COR.gelo }}>{desc ? "− " : ""}{reais(Math.abs(Math.round(entre(f, 4 + i * 7, 30 + i * 7) * v * 100) / 100))}</span>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.15)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ ...TXT(40, 600, COR.suave) }}>Líquido</span>
          <span style={{ ...TXT(76), color: COR.ciano }}>{reais(Math.round(entre(f, 30, 60) * liquido * 100) / 100)}</span>
        </div>
      </Cartao>
      {f > 40 && (
        <div style={{ position: "absolute", top: 1000, left: 90, right: 90, padding: "28px 32px", borderRadius: 34, background: "rgba(235,241,249,0.97)", display: "flex", alignItems: "center", gap: 22, boxShadow: "0 20px 60px rgba(0,0,0,0.45)", transform: `translateY(${(1 - notif) * -120}px)`, opacity: notif }}>
          <div style={{ width: 90, height: 90, borderRadius: 22, background: GRAD_BOTAO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🕐</div>
          <div>
            <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 34, color: "#0b1733" }}>Meu Ponto · agora</div>
            <div style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 32, color: "#334155" }}>💰 Seu holerite de novembro chegou</div>
          </div>
        </div>
      )}
    </Cena>
  );
};

/* 4 · eSocial enviado, assinado com o certificado */
const CenaESocial: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const eventos = [["S-1200", "Remuneração"], ["S-1210", "Pagamentos"], ["S-1299", "Fechamento"]];
  return (
    <Cena d={d}>
      <Titulo texto="eSocial *junto.*" />
      <div style={{ position: "absolute", top: 370, left: 60, right: 60, display: "flex", flexDirection: "column", gap: 20 }}>
        {eventos.map(([c, n], i) => {
          const q0 = 6 + i * 16;
          const pronto = f > q0 + 22;
          return (
            <Cartao key={c} atraso={q0 - 6} estilo={{ padding: "28px 34px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <div style={{ ...TXT(40), color: COR.ciano, width: 170 }}>{c}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...TXT(36, 600) }}>{n}</div>
                  <div style={{ marginTop: 12, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                    <div style={{ width: `${entre(f, q0, q0 + 22) * 100}%`, height: "100%", background: pronto ? VERDE : GRAD }} />
                  </div>
                </div>
                {pronto ? <Check atraso={q0 + 22} tam={70} /> : <div style={{ width: 70 }} />}
              </div>
            </Cartao>
          );
        })}
      </div>
      <Entra atraso={58} estilo={{ position: "absolute", top: 1020, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "24px 40px", borderRadius: 999, border: `2px solid ${COR.ciano}`, background: "rgba(0,225,251,0.12)", ...TXT(40, 600) }}>🔐 Assinado com o seu certificado A1</div>
      </Entra>
    </Cena>
  );
};

export const VideoRH: React.FC = () => (
  <VideoAnimado
    pasta="rh"
    nome="Nexor RH + Ponto"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[5, 6]}
    cenas={[
      (d) => <CenaGancho d={d} icone="🧮" texto="Dia 30. Ainda somando *ponto no papel?*" extra={<Papel />} />,
      (d) => <CenaApp d={d} />,
      (d) => <CenaEspelho d={d} />,
      (d) => <CenaFolha d={d} />,
      (d) => <CenaESocial d={d} />,
      (d) => <CenaManifesto d={d} linha1="Você cuida das pessoas." linha2="O sistema cuida das contas." emoji="💙" />,
      (_d, voz) => <CenaFinal voz={voz} icone="🕐" chamada="Teste grátis por *30 dias*" botao="Link na bio →" />,
    ]}
  />
);
export const temposRH = tempos;
