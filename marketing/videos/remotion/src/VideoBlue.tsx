/* Vídeo vertical da Blue: tudo animado, sem tela parada.
   A conversa é digitada ao vivo, a Blue pulsa com a própria voz, os sistemas são escolhidos,
   o teste é liberado, a conversa é agendada e o lead passa para o time com o resumo.
   Tempos de cada cena = pausas reais da locução (src/tempos/blue.ts); o áudio nunca é acelerado. */
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData } from "@remotion/media-utils";
import "./fontes/fontes.css";
import { ATRASO, COR, FPS } from "./VideoProduto";
import tBlue from "./tempos/blue";

const CAUDA = 2.1;
const T = tBlue.frases;
const q = (seg: number) => Math.round((seg + ATRASO) * FPS);
export const duracaoBlue = Math.round((ATRASO + T[T.length - 1][1] + CAUDA) * FPS);

const FALAS = [
  "Onze e quarenta e sete da noite. E bateu aquela dúvida sobre a sua empresa?",
  "Oi! Eu sou a Blue, a assistente de inteligência artificial da Nexor.",
  "Me conta como é a sua empresa, que eu te mostro o sistema certo.",
  "Posso liberar um teste grátis de trinta dias, e marcar uma conversa com o nosso time.",
  "E quando você quiser falar com gente, eles estão lá.",
  "Inteligência artificial que atende. Gente que cuida.",
  "Me chama. O link está na bio.",
];

const GRAD = `linear-gradient(90deg, ${COR.azulClaro}, ${COR.ciano})`;
const VIDRO: React.CSSProperties = { background: "rgba(14,30,66,0.62)", border: "1.5px solid rgba(120,170,255,0.26)", borderRadius: 34, boxShadow: "0 30px 80px rgba(0,0,0,0.45)" };

const Rico: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split("*").map((p, i) =>
      i % 2 ? (
        <span key={i} style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{p}</span>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      ),
    )}
  </>
);

/* mola de entrada a partir do quadro "de" (local à cena) */
const useMola = (de: number, cfg = { damping: 14, mass: 0.7 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - de, fps, config: cfg });
};
const pop = (p: number, y = 40): React.CSSProperties => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * y}px) scale(${0.85 + 0.15 * p})` });
const saida = (f: number, d: number) => interpolate(f, [d - 8, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/* texto digitado letra a letra, de "de" até "ate" (quadros locais) */
const Digitado: React.FC<{ texto: string; de: number; ate: number; cursor?: boolean }> = ({ texto, de, ate, cursor }) => {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [de, ate], [0, texto.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const pisca = cursor && f % 16 < 9 && n < texto.length + 1;
  return (
    <>
      {texto.slice(0, n)}
      {pisca && <span style={{ color: COR.ciano }}>|</span>}
    </>
  );
};

/* Fundo vivo: bolhas de luz que flutuam e um brilho que acompanha a voz */
const Fundo: React.FC<{ energia: number }> = ({ energia }) => {
  const f = useCurrentFrame();
  const b1 = { x: 80 + Math.sin(f / 70) * 8, y: 8 + Math.cos(f / 90) * 6 };
  const b2 = { x: 10 + Math.cos(f / 80) * 10, y: 92 + Math.sin(f / 60) * 5 };
  return (
    <AbsoluteFill style={{ background: COR.navy }}>
      <AbsoluteFill style={{ background: `radial-gradient(1100px 900px at ${b1.x}% ${b1.y}%, #12336e 0%, #07122b 45%, transparent 80%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(900px 800px at ${b2.x}% ${b2.y}%, rgba(0,225,251,${0.12 + energia * 0.12}), transparent 65%)` }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(120,170,255,0.10) 1.5px, transparent 1.5px)", backgroundSize: "44px 44px", backgroundPosition: `0 ${(f * 0.6) % 44}px`, opacity: 0.6 }} />
    </AbsoluteFill>
  );
};

/* Rosto da Blue com anéis que pulsam com a voz */
const Avatar: React.FC<{ tam: number; energia: number; online?: boolean }> = ({ tam, energia, online = true }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "relative", width: tam, height: tam }}>
      {[0, 1, 2].map((i) => {
        const ciclo = ((f + i * 20) % 60) / 60;
        return (
          <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${3 + energia * 4}px solid ${COR.ciano}`, opacity: (1 - ciclo) * (0.25 + energia * 0.6), transform: `scale(${1 + ciclo * (0.35 + energia * 0.35)})` }} />
        );
      })}
      <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: `conic-gradient(from ${f * 3}deg, ${COR.azul}, ${COR.ciano}, ${COR.azulClaro}, ${COR.azul})`, boxShadow: `0 0 ${40 + energia * 80}px rgba(0,225,251,${0.35 + energia * 0.4})` }} />
      <Img src={staticFile("blue/rosto.webp")} style={{ position: "absolute", inset: 0, width: tam, height: tam, borderRadius: "50%", objectFit: "cover", transform: "scale(1.04)" }} />
      {online && <div style={{ position: "absolute", right: tam * 0.06, bottom: tam * 0.06, width: tam * 0.17, height: tam * 0.17, borderRadius: "50%", background: "#22c55e", border: `${Math.max(4, tam * 0.025)}px solid ${COR.navy}` }} />}
    </div>
  );
};

/* Barras de áudio ao vivo */
const Onda: React.FC<{ valores: number[]; largura: number; altura: number }> = ({ valores, largura, altura }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, height: altura, width: largura, justifyContent: "center" }}>
    {valores.map((v, i) => (
      <div key={i} style={{ width: 10, height: Math.max(8, v * altura), borderRadius: 6, background: GRAD, opacity: 0.9 }} />
    ))}
  </div>
);

const Balao: React.FC<{ de: "voce" | "blue"; children: React.ReactNode; estilo?: React.CSSProperties }> = ({ de, children, estilo }) => (
  <div style={{ alignSelf: de === "voce" ? "flex-end" : "flex-start", maxWidth: 760, padding: "26px 34px", borderRadius: 34, borderBottomRightRadius: de === "voce" ? 10 : 34, borderBottomLeftRadius: de === "blue" ? 10 : 34, background: de === "voce" ? `linear-gradient(135deg, ${COR.azul}, #2f7bff)` : "rgba(235,241,249,0.96)", color: de === "voce" ? "#fff" : "#0b1733", fontFamily: "Inter", fontWeight: 500, fontSize: 44, lineHeight: 1.3, boxShadow: "0 14px 40px rgba(0,0,0,0.3)", ...estilo }}>
    {children}
  </div>
);

const Digitando: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", gap: 12, padding: "30px 36px", borderRadius: 34, borderBottomLeftRadius: 10, background: "rgba(235,241,249,0.96)" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: "#5b6b88", transform: `translateY(${Math.sin((f + i * 5) / 3.2) * -7}px)` }} />
      ))}
    </div>
  );
};

/* ---------- Cenas ---------- */

/* 0 · 23h47: relógio vira, e a dúvida é digitada */
const CenaNoite: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const min = f < 18 ? 45 : f < 36 ? 46 : 47;
  const vira = interpolate(f % 18, [0, 6], [0.6, 1], { extrapolateRight: "clamp" });
  const lua = useMola(0);
  const campo = useMola(40);
  const enviado = f > 108;
  const sobe = useMola(108);
  return (
    <AbsoluteFill style={{ alignItems: "center", opacity: saida(f, d) }}>
      <div style={{ marginTop: 330, fontSize: 120, ...pop(lua) }}>🌙</div>
      <div style={{ marginTop: 10, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 250, letterSpacing: "-0.04em", color: COR.gelo, display: "flex" }}>
        23:4<span style={{ display: "inline-block", transform: f < 36 ? `scaleY(${vira})` : undefined, background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{min % 10}</span>
      </div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 500, fontSize: 64, color: COR.suave, marginTop: -10 }}>
        <Digitado texto="E bateu aquela dúvida…" de={50} ate={90} />
      </div>
      {!enviado ? (
        <div style={{ position: "absolute", top: 1180, left: 72, right: 72, display: "flex", gap: 20, alignItems: "center", ...pop(campo) }}>
          <div style={{ flex: 1, ...VIDRO, borderRadius: 999, padding: "34px 44px", fontFamily: "Inter", fontWeight: 500, fontSize: 42, color: COR.gelo }}>
            <Digitado texto="Vocês têm sistema pra minha empresa?" de={48} ate={100} cursor />
          </div>
          <div style={{ width: 112, height: 112, borderRadius: 56, background: `linear-gradient(135deg, ${COR.azul}, #00b4ff)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50, color: "#fff", transform: `scale(${f > 100 ? 1.15 : 1})` }}>➤</div>
        </div>
      ) : (
        <div style={{ position: "absolute", top: 1180 - sobe * 120, left: 72, right: 72, display: "flex", flexDirection: "column", opacity: 1 - sobe * 0.2 }}>
          <Balao de="voce">Vocês têm sistema pra minha empresa?</Balao>
        </div>
      )}
    </AbsoluteFill>
  );
};

/* 1 · A Blue aparece e fala */
const CenaBlue: React.FC<{ d: number; energia: number; ondas: number[] }> = ({ d, energia, ondas }) => {
  const f = useCurrentFrame();
  const a = useMola(0, { damping: 11, mass: 0.8 });
  const t = useMola(14);
  const chips = ["🟢 online agora", "⚡ responde na hora", "🕐 24 horas por dia"];
  return (
    <AbsoluteFill style={{ alignItems: "center", opacity: saida(f, d) }}>
      <div style={{ marginTop: 340, transform: `scale(${a})` }}>
        <Avatar tam={460} energia={energia} />
      </div>
      <div style={{ marginTop: 70, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 104, color: COR.gelo, ...pop(t) }}>
        Oi, eu sou a <Rico texto="*Blue*" /> 👋
      </div>
      <div style={{ marginTop: 6, fontFamily: "Inter", fontWeight: 500, fontSize: 40, color: COR.suave, ...pop(t) }}>assistente de inteligência artificial da Nexor</div>
      <div style={{ marginTop: 30 }}>
        <Onda valores={ondas} largura={760} altura={150} />
      </div>
      <div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", padding: "0 60px" }}>
        {chips.map((c, i) => (
          <Chip key={c} atraso={30 + i * 9}>{c}</Chip>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ atraso: number; children: React.ReactNode }> = ({ atraso, children }) => {
  const p = useMola(atraso);
  return <div style={{ ...VIDRO, borderRadius: 999, padding: "18px 30px", fontFamily: "Inter", fontWeight: 600, fontSize: 36, color: COR.gelo, ...pop(p, 30) }}>{children}</div>;
};

/* 2 · Conversa e escolha do sistema certo */
const SISTEMAS = [
  { n: "Barber", e: "✂️" },
  { n: "Atende IA", e: "💬" },
  { n: "RH + Ponto", e: "🕐" },
  { n: "Contábil", e: "📊" },
  { n: "Agente", e: "🤖" },
  { n: "Elo", e: "🔗" },
  { n: "Service Desk", e: "🖥️" },
  { n: "Sites", e: "🌐" },
];
const CenaEscolha: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const u = useMola(0);
  const r = useMola(26);
  const ESCOLHIDO = 0;
  const varre = Math.floor(interpolate(f, [34, 70], [0, 15], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const escolheu = f >= 72;
  const brilho = useMola(72, { damping: 9, mass: 0.6 });
  return (
    <AbsoluteFill style={{ opacity: saida(f, d) }}>
      <div style={{ position: "absolute", top: 270, left: 60, right: 60, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={pop(u)}>
          <Balao de="voce" estilo={{ marginLeft: "auto" }}>Tenho uma barbearia com 3 cadeiras ✂️</Balao>
        </div>
        {f < 26 ? (
          f > 8 && <Digitando />
        ) : (
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", ...pop(r) }}>
            <Avatar tam={86} energia={0} online={false} />
            <Balao de="blue">
              <Digitado texto="Perfeito! Vou te mostrar o sistema certo 👇" de={26} ate={56} />
            </Balao>
          </div>
        )}
      </div>
      <div style={{ position: "absolute", top: 820, left: 60, right: 60, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {SISTEMAS.map((s, i) => {
          const ativo = !escolheu && f > 30 && varre % SISTEMAS.length === i;
          const certo = escolheu && i === ESCOLHIDO;
          const entra = interpolate(f, [28 + i * 2, 40 + i * 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          return (
            <div key={s.n} style={{ ...VIDRO, borderRadius: 26, padding: "26px 28px", display: "flex", alignItems: "center", gap: 18, fontFamily: "Inter", fontWeight: 600, fontSize: 40, color: COR.gelo, opacity: entra * (escolheu && !certo ? 0.35 : 1), transform: `scale(${certo ? 1 + brilho * 0.08 : ativo ? 1.04 : 1})`, borderColor: certo || ativo ? COR.ciano : "rgba(120,170,255,0.26)", boxShadow: certo ? `0 0 ${60 * brilho}px rgba(0,225,251,0.55)` : VIDRO.boxShadow, background: certo ? "linear-gradient(135deg, rgba(0,88,250,0.85), rgba(0,180,255,0.75))" : VIDRO.background }}>
              <span style={{ fontSize: 46 }}>{s.e}</span>
              {s.n}
              {certo && <span style={{ marginLeft: "auto", fontSize: 44 }}>✓</span>}
            </div>
          );
        })}
      </div>
      {escolheu && (
        <div style={{ position: "absolute", top: 1330, width: "100%", textAlign: "center", fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 62, color: COR.gelo, ...pop(brilho) }}>
          <Rico texto="Nexor Barber: *ideal pra você*" />
        </div>
      )}
    </AbsoluteFill>
  );
};

/* 3 · Teste de 30 dias liberado e conversa agendada */
const CenaTesteAgenda: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const c1 = useMola(0);
  const dias = Math.round(interpolate(f, [8, 46], [0, 30], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const ok1 = useMola(48, { damping: 8, mass: 0.5 });
  const c2 = useMola(58);
  const dias2 = ["Seg", "Ter", "Qua", "Qui", "Sex"];
  const horas = ["09:00", "10:00", "14:00", "16:30"];
  const cursorDia = Math.min(3, Math.floor(interpolate(f, [70, 92], [0, 3.99], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const cursorHora = Math.min(1, Math.floor(interpolate(f, [94, 104], [0, 1.99], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const marcado = f >= 108;
  const ok2 = useMola(108, { damping: 8, mass: 0.5 });
  return (
    <AbsoluteFill style={{ opacity: saida(f, d) }}>
      <div style={{ position: "absolute", top: 270, left: 60, right: 60, ...VIDRO, padding: "40px 46px", ...pop(c1) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: "Inter", fontWeight: 600, fontSize: 38, color: COR.suave }}>
          <Avatar tam={70} energia={0} online={false} /> Blue liberou para você
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 20 }}>
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 170, lineHeight: 1, background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{dias}</span>
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 64, color: COR.gelo }}>dias grátis</span>
          <span style={{ marginLeft: "auto", width: 100, height: 100, borderRadius: 50, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58, color: "#fff", transform: `scale(${ok1})` }}>✓</span>
        </div>
        <div style={{ marginTop: 22, height: 16, borderRadius: 8, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: `${(dias / 30) * 100}%`, height: "100%", background: GRAD }} />
        </div>
      </div>
      <div style={{ position: "absolute", top: 790, left: 60, right: 60, ...VIDRO, padding: "40px 46px", ...pop(c2) }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 52, color: COR.gelo }}>📅 Conversa com o time</div>
        <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
          {dias2.map((x, i) => (
            <div key={x} style={{ flex: 1, padding: "22px 0", textAlign: "center", borderRadius: 20, fontFamily: "Inter", fontWeight: 600, fontSize: 36, color: i === cursorDia ? "#fff" : COR.suave, background: i === cursorDia ? `linear-gradient(135deg, ${COR.azul}, #00b4ff)` : "rgba(255,255,255,0.06)" }}>{x}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 16, opacity: f > 92 ? 1 : 0.35 }}>
          {horas.map((h, i) => {
            const sel = f > 92 && i === cursorHora;
            return <div key={h} style={{ flex: 1, padding: "20px 0", textAlign: "center", borderRadius: 20, fontFamily: "Inter", fontWeight: 600, fontSize: 34, color: sel ? "#fff" : COR.suave, border: `2px solid ${sel ? COR.ciano : "rgba(255,255,255,0.12)"}`, background: sel ? "rgba(0,225,251,0.18)" : "transparent" }}>{h}</div>;
          })}
        </div>
        {marcado && (
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 18, fontFamily: "Inter", fontWeight: 600, fontSize: 42, color: "#4ade80", ...pop(ok2, 20) }}>
            ✓ Agendado: quinta, 10:00
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* 4 · Passa para o time, com o resumo pronto */
const CenaTime: React.FC<{ d: number; energia: number }> = ({ d, energia }) => {
  const f = useCurrentFrame();
  const a = useMola(0);
  const linha = interpolate(f, [8, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const t = useMola(26);
  const card = useMola(34);
  const tags = ["🔥 Lead quente", "✂️ Barbearia · 3 cadeiras", "🎁 Teste de 30 dias", "📅 Quinta, 10:00"];
  return (
    <AbsoluteFill style={{ opacity: saida(f, d) }}>
      <div style={{ position: "absolute", top: 300, left: 90, right: 90, display: "flex", alignItems: "center", justifyContent: "space-between", ...pop(a) }}>
        <div style={{ textAlign: "center" }}>
          <Avatar tam={220} energia={energia} />
          <div style={{ marginTop: 22, fontFamily: "Inter", fontWeight: 600, fontSize: 36, color: COR.gelo }}>Blue</div>
        </div>
        <div style={{ flex: 1, margin: "0 26px 60px", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.1)", position: "relative" }}>
          <div style={{ width: `${linha * 100}%`, height: "100%", borderRadius: 4, background: GRAD }} />
          <div style={{ position: "absolute", top: -22, left: `calc(${linha * 100}% - 26px)`, fontSize: 44, opacity: linha < 1 ? 1 : 0 }}>📨</div>
        </div>
        <div style={{ textAlign: "center", ...pop(t) }}>
          <div style={{ display: "flex" }}>
            {[["AS", "#7c3aed"], ["RC", "#0ea5e9"], ["MV", "#db2777"]].map(([ini, cor], i) => (
              <div key={ini} style={{ width: 120, height: 120, borderRadius: 60, marginLeft: i ? -34 : 0, background: cor, border: `6px solid ${COR.navy}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 40, color: "#fff" }}>{ini}</div>
            ))}
          </div>
          <div style={{ marginTop: 22, fontFamily: "Inter", fontWeight: 600, fontSize: 36, color: COR.gelo }}>Time Nexor</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 720, left: 60, right: 60, ...VIDRO, padding: "40px 46px", ...pop(card) }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 50, color: COR.gelo }}>Resumo pronto para o time</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 28 }}>
          {tags.map((x, i) => (
            <Chip key={x} atraso={40 + i * 6}>{x}</Chip>
          ))}
        </div>
        <div style={{ marginTop: 30, fontFamily: "Inter", fontWeight: 600, fontSize: 40, color: "#4ade80", opacity: f > 66 ? 1 : 0 }}>🙋 Ana assumiu a conversa</div>
      </div>
    </AbsoluteFill>
  );
};

/* 5 · IA que atende. Gente que cuida. */
const CenaManifesto: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const linha1 = ["Inteligência", "artificial", "que", "atende."];
  const l2 = useMola(44, { damping: 10, mass: 0.7 });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 72px", opacity: saida(f, d) }}>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 110, lineHeight: 1.06, letterSpacing: "-0.02em", color: COR.gelo, marginTop: -200 }}>
        {linha1.map((w, i) => (
          <Palavra key={w} atraso={i * 7}>{w}</Palavra>
        ))}
      </div>
      <div style={{ marginTop: 40, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 130, lineHeight: 1.04, letterSpacing: "-0.02em", ...pop(l2, 60) }}>
        <Rico texto="*Gente que cuida.*" /> 💙
      </div>
    </AbsoluteFill>
  );
};
const Palavra: React.FC<{ atraso: number; children: React.ReactNode }> = ({ atraso, children }) => {
  const p = useMola(atraso);
  return <span style={{ display: "inline-block", marginRight: "0.25em", ...pop(p, 50) }}>{children}</span>;
};

/* 6 · Final */
const CenaFinal: React.FC<{ energia: number }> = ({ energia }) => {
  const f = useCurrentFrame();
  const a = useMola(0);
  const b = useMola(10);
  const c = useMola(20);
  const pulsa = 1 + Math.sin(f / 6) * 0.03;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ transform: `scale(${a})` }}>
        <Avatar tam={300} energia={energia} />
      </div>
      <div style={{ marginTop: 60, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 120, color: COR.gelo, ...pop(b) }}>
        <Rico texto="Me *chama.*" />
      </div>
      <div style={{ marginTop: 44, padding: "28px 60px", borderRadius: 999, background: `linear-gradient(135deg, ${COR.azul}, #00b4ff)`, boxShadow: `0 18px ${50 + Math.sin(f / 6) * 20}px rgba(0,88,250,0.6)`, fontFamily: "Inter", fontWeight: 600, fontSize: 50, color: "#fff", transform: `scale(${c * pulsa})` }}>
        Fale com a Blue → link na bio
      </div>
      <Img src={staticFile("logo-lockup.webp")} style={{ width: 460, marginTop: 90, opacity: c }} />
      <div style={{ marginTop: 26, fontFamily: "Inter", fontWeight: 500, fontSize: 34, color: COR.suave, opacity: c }}>nexorconsultingit.com.br · IA com cuidado humano</div>
    </AbsoluteFill>
  );
};

/* Legenda da fala (para quem assiste sem som), dividida na pontuação */
const Legenda: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS - ATRASO;
  const pedacos: { de: number; ate: number; txt: string }[] = [];
  FALAS.forEach((fala, i) => {
    if (i === 5 || i === 6) return; // já estão escritas na tela
    const [de, ate] = T[i];
    const partes = fala.split(/(?<=[,.?!])\s+/).reduce<string[]>((acc, w) => {
      const u = acc[acc.length - 1];
      if (u && (u + " " + w).length <= 44) acc[acc.length - 1] = u + " " + w;
      else acc.push(w);
      return acc;
    }, []);
    const total = partes.reduce((a, s) => a + s.length, 0);
    let x = de;
    partes.forEach((s) => {
      const dd = ((ate - de) * s.length) / total;
      pedacos.push({ de: x, ate: x + dd, txt: s });
      x += dd;
    });
  });
  const atual = pedacos.find((p) => t >= p.de - 0.05 && t < p.ate + 0.2);
  if (!atual) return null;
  const op = interpolate(t, [atual.de - 0.05, atual.de + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", bottom: 210, left: 60, right: 60, display: "flex", justifyContent: "center", opacity: op }}>
      <div style={{ padding: "18px 30px", borderRadius: 22, background: "rgba(1,5,36,0.78)", border: "1px solid rgba(120,170,255,0.22)", fontFamily: "Inter", fontWeight: 600, fontSize: 44, lineHeight: 1.3, color: "#fff", textAlign: "center" }}>{atual.txt}</div>
    </div>
  );
};

const Topo: React.FC = () => (
  <div style={{ position: "absolute", top: 110, left: 72, display: "flex", alignItems: "center", gap: 18, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 38, color: COR.gelo }}>
    <Img src={staticFile("logo-mark.webp")} style={{ width: 58, height: 58, borderRadius: 14 }} />
    Blue · assistente de IA da Nexor
  </div>
);

export const VideoBlue: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = useAudioData(staticFile("blue/locucao.mp3"));
  const fa = f - q(0);
  /* volume real da voz (RMS em janelas de 30 ms), normalizado pelo pico da locução */
  const pico = React.useMemo(() => {
    if (!audio) return 1;
    const w = audio.channelWaveforms[0];
    const n = Math.round(audio.sampleRate * 0.03);
    let m = 0.0001;
    for (let i = 0; i + n < w.length; i += n) {
      let s2 = 0;
      for (let k = i; k < i + n; k++) s2 += w[k] * w[k];
      m = Math.max(m, Math.sqrt(s2 / n));
    }
    return m;
  }, [audio]);
  const volume = (t: number) => {
    if (!audio || t < 0) return 0;
    const w = audio.channelWaveforms[0];
    const n = Math.round(audio.sampleRate * 0.03);
    const i0 = Math.round(t * audio.sampleRate);
    if (i0 + n >= w.length) return 0;
    let s2 = 0;
    for (let k = i0; k < i0 + n; k++) s2 += w[k] * w[k];
    return Math.min(1, Math.sqrt(s2 / n) / pico);
  };
  const ta = fa / fps;
  const ondas = new Array(24).fill(0).map((_, i) => 0.1 + 0.9 * volume(ta - Math.abs(i - 11.5) * 0.03) * (0.75 + 0.25 * Math.sin(i * 1.7 + f / 3)));
  const energia = Math.min(1, (volume(ta) + volume(ta - 0.04) + volume(ta - 0.08)) / 3 * 1.3);
  const ini = T.map((x, i) => (i === 0 ? 0 : q(x[0])));
  const cenas = [
    (d: number) => <CenaNoite d={d} />,
    (d: number) => <CenaBlue d={d} energia={energia} ondas={ondas} />,
    (d: number) => <CenaEscolha d={d} />,
    (d: number) => <CenaTesteAgenda d={d} />,
    (d: number) => <CenaTime d={d} energia={energia} />,
    (d: number) => <CenaManifesto d={d} />,
    () => <CenaFinal energia={energia} />,
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: COR.navy }}>
      <Fundo energia={energia} />
      <Topo />
      {cenas.map((c, i) => {
        const de = ini[i];
        const d = (i + 1 < ini.length ? ini[i + 1] : duracaoBlue) - de;
        return (
          <Sequence key={i} from={de} durationInFrames={d} layout="none">
            {c(d)}
          </Sequence>
        );
      })}
      <Legenda />
      <Sequence from={q(0)} layout="none">
        <Audio src={staticFile("blue/locucao.mp3")} />
      </Sequence>
    </AbsoluteFill>
  );
};
