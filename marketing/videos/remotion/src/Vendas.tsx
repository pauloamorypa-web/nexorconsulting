/* Vídeo de vendas B2B da Nexor (16:9, 1920×1080): Barber → Cardápio 3D → CRM → Restaurantes (Atende IA + Cardápio 3D).
   Tudo animado. Cada efeito acontece na palavra dita (tempos da transcrição em src/tempos/vendas.ts).
   Roteiro: marketing/videos/roteiros/16-vendas-b2b-2026.md */
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Loop, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ATRASO } from "./VideoProduto";
import { COR, FPS, GRAD, GRAD_BOTAO, VERDE, VIDRO, TXT, Rico, entre, pop, quadro, useMola, useVoz, Voz } from "./kit";
import { Cena, Titulo, Fundo, Poeira, Legenda, C12, C13, LJ, AJ, Pop, Destaque } from "./Institucional";
import TEMPOS from "./tempos/vendas";
import FALAS from "./tempos/vendas.frases.json";

const PASTA = "vendas";
const CAUDA = 3.2;
export const duracaoVendas = Math.round((ATRASO + TEMPOS.frases[TEMPOS.frases.length - 1][1] + CAUDA) * FPS);
const LARANJA = "#f59e0b", ROSA = "#f472b6", ZAP = "#25d366";
const CAPITULOS = [
  { n: 1, nome: "Barber", cor: LARANJA, de: 2 },
  { n: 2, nome: "Cardápio 3D", cor: ROSA, de: 4 },
  { n: 3, nome: "CRM", cor: COR.ciano, de: 6 },
  { n: 4, nome: "Restaurantes", cor: VERDE, de: 9 },
];

/* frame da cena em que uma palavra (segundos do áudio) é dita */
type P = { d: number; de: number };
const em = (de: number, seg: number) => quadro(seg) - de;

/* ---------- peças ---------- */
/* Prato real: vídeo gerado a partir de foto realista (public/vendas/reais), câmera girando em volta, bordas fundidas no fundo */
const REAL: Record<string, string> = { "pizza-calabresa": "pizza", "x-burger": "burger", "suco-laranja": "suco", "bolo-chocolate": "bolo" };
const Giro: React.FC<{ nome: string; tam: number; vel?: number; desde?: number; borda?: boolean }> = ({ nome, tam, vel = 0.75, borda = true }) => (
  <div style={{ width: tam, height: tam, overflow: "hidden", borderRadius: borda ? "50%" : 0, WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 52%, transparent 71%)", maskImage: "radial-gradient(circle at 50% 50%, #000 52%, transparent 71%)" }}>
    <Loop durationInFrames={Math.floor(150 / vel)} layout="none">
      <OffthreadVideo src={staticFile(`vendas/reais/${REAL[nome]}.mp4`)} muted playbackRate={vel} style={{ width: tam * 1.78, height: tam, marginLeft: -tam * 0.39, objectFit: "cover" }} />
    </Loop>
  </div>
);

const Celular: React.FC<{ w?: number; children: React.ReactNode; estilo?: React.CSSProperties }> = ({ w = 420, children, estilo }) => (
  <div style={{ width: w, height: w * 2.05, borderRadius: w * 0.13, background: "#0a0f1f", padding: w * 0.035, boxShadow: "0 50px 120px rgba(0,0,0,0.6), 0 0 0 3px rgba(150,190,255,0.25)", ...estilo }}>
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: w * 0.1, overflow: "hidden", background: "#0b1430" }}>
      <div style={{ position: "absolute", top: 12, left: "50%", width: w * 0.28, height: 22, marginLeft: -w * 0.14, borderRadius: 11, background: "#000", zIndex: 5 }} />
      {children}
    </div>
  </div>
);

const Balao: React.FC<{ de: number; lado: "e" | "d"; children: React.ReactNode; cor?: string }> = ({ de, lado, children, cor }) => {
  const p = useMola(de, { damping: 12, mass: 0.5 });
  return (
    <div style={{ alignSelf: lado === "d" ? "flex-end" : "flex-start", maxWidth: "82%", padding: "14px 18px", borderRadius: 18, borderBottomRightRadius: lado === "d" ? 4 : 18, borderBottomLeftRadius: lado === "e" ? 4 : 18, background: cor ?? (lado === "d" ? "#d9fdd3" : "#fff"), ...TXT(24, 500, "#0b1733"), lineHeight: 1.3, whiteSpace: "pre-line", boxShadow: "0 6px 16px rgba(0,0,0,0.18)", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 30}px) scale(${0.8 + 0.2 * p})`, transformOrigin: lado === "d" ? "right bottom" : "left bottom" }}>
      {children}
    </div>
  );
};

const Digitando: React.FC<{ de: number; ate: number }> = ({ de, ate }) => {
  const f = useCurrentFrame();
  if (f < de || f > ate) return null;
  return (
    <div style={{ alignSelf: "flex-start", padding: "14px 18px", borderRadius: 18, background: "#fff", display: "flex", gap: 6 }}>
      {[0, 1, 2].map((k) => <div key={k} style={{ width: 10, height: 10, borderRadius: 5, background: "#94a3b8", transform: `translateY(${Math.sin((f - k * 4) / 3) * 4}px)` }} />)}
    </div>
  );
};

/* Janela com tela real, câmera viva e notificações em tempos escolhidos */
const TelaViva: React.FC<{ d: number; img: string; fx: number; fy: number; cor: string; nome: string; sub: string; clique: number; pops: { de: number; x: Destaque }[]; selo: string }> = ({ d, img, fx, fy, cor, nome, sub, clique, pops, selo }) => {
  const f = useCurrentFrame();
  const ent = interpolate(f, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sai = interpolate(f, [d - 8, d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const zoom = interpolate(f, [6, d], [1, 1.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const cx = fx * LJ, cy = 40 + fy * AJ;
  const cur = entre(f, 6, clique);
  const onda = entre(f, clique, clique + 14);
  const brilho = ((f * 2.4) % 140) - 20;
  const t = useMola(2, { damping: 13, mass: 0.6 });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", right: 100, top: 100, width: 1100, height: 850, borderRadius: "50%", background: `radial-gradient(circle, ${cor}40, transparent 65%)`, opacity: ent }} />
      <div style={{ position: "absolute", left: 760, top: 180, perspective: 1800 }}>
        <div style={{ position: "relative", transformStyle: "preserve-3d", transform: `translateX(${(1 - ent) * 520 - sai * 620}px) translateY(${Math.sin(f / 18) * 8}px) rotateY(${interpolate(f, [0, d], [-24, -6])}deg) rotateX(${interpolate(f, [0, d], [8, 2])}deg)`, filter: (1 - ent) * 14 + sai * 16 > 0.3 ? `blur(${(1 - ent) * 14 + sai * 16}px)` : undefined, opacity: 1 - sai }}>
          <div style={{ width: LJ, borderRadius: 22, overflow: "hidden", background: "#0b1430", boxShadow: `0 60px 140px rgba(0,0,0,0.65), 0 0 0 2px ${cor}66, 0 0 80px ${cor}33` }}>
            <div style={{ height: 40, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "#101c3d" }}>
              {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
              <div style={{ marginLeft: 18, flex: 1, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.07)" }} />
            </div>
            <div style={{ position: "relative", width: LJ, height: AJ, overflow: "hidden" }}>
              <Img src={staticFile(img)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transformOrigin: `${fx * 100}% ${fy * 100}%` }} />
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${brilho}%`, width: "18%", background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.2), transparent)", transform: "skewX(-18deg)" }} />
              <div style={{ position: "absolute", left: cx - 70, top: cy - 110, width: 140, height: 140, borderRadius: 70, border: `4px solid ${cor}`, opacity: onda > 0 ? 1 - onda : 0, transform: `scale(${0.4 + onda * 1.4})` }} />
            </div>
          </div>
          <div style={{ position: "absolute", left: interpolate(cur, [0, 1], [LJ + 80, cx]), top: interpolate(cur, [0, 1], [AJ + 60, cy]), transform: `scale(${f >= clique && f < clique + 5 ? 0.82 : 1})`, filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))", opacity: cur > 0 ? 1 : 0 }}>
            <svg width={40} height={52} viewBox="0 0 20 26"><path d="M1 1 L1 21 L6 16 L10 25 L13 24 L9 15 L16 15 Z" fill="#fff" stroke="#0b1733" strokeWidth={1.6} strokeLinejoin="round" /></svg>
          </div>
          {pops.map((p) => <Pop key={p.x.txt} de={p.de} d={p.x} cor={cor} />)}
        </div>
      </div>
      <div style={{ position: "absolute", left: 110, top: 360, width: 600, opacity: 1 - sai }}>
        <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: `${cor}26`, border: `1.5px solid ${cor}`, ...TXT(24, 700, cor), letterSpacing: "0.18em", ...pop(t, 20) }}>{selo}</div>
        <div style={{ overflow: "hidden", marginTop: 14 }}>
          <div style={{ ...TXT(92, 700), letterSpacing: "-0.03em", whiteSpace: "nowrap", transform: `translateY(${(1 - t) * 110}%)` }}>{nome}</div>
        </div>
        <div style={{ height: 6, width: 220, borderRadius: 3, background: cor, transform: `scaleX(${entre(f, 6, 20)})`, transformOrigin: "left", boxShadow: `0 0 24px ${cor}` }} />
        <div style={{ ...TXT(38, 500, COR.suave), marginTop: 18, opacity: entre(f, 8, 18), lineHeight: 1.3 }}>{sub}</div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- cenas ---------- */

// 0 · Gancho: mensagens chegando, quem atende primeiro?
const MSGS = [
  { t: "Tem horário hoje às 18h?", x: 230, y: 210, r: -6 },
  { t: "Quero uma pizza grande 🍕", x: 1250, y: 170, r: 5 },
  { t: "Vocês entregam no Centro?", x: 160, y: 690, r: 4 },
  { t: "Ainda dá para marcar?", x: 1330, y: 720, r: -5 },
  { t: "Qual o cardápio de hoje?", x: 760, y: 770, r: 3 },
];
const S0: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const q = em(de, 2.24);
  return (
    <Cena d={d}>
      {MSGS.map((m, i) => {
        const p = useMola(4 + i * 7, { damping: 11, mass: 0.5 });
        return (
          <div key={i} style={{ position: "absolute", left: m.x, top: m.y, display: "flex", gap: 14, alignItems: "center", padding: "18px 24px", borderRadius: 22, background: "rgba(255,255,255,0.96)", ...TXT(30, 600, "#0b1733"), boxShadow: "0 24px 60px rgba(0,0,0,0.4)", opacity: Math.min(1, p * 1.5) * (1 - entre(f, q - 4, q + 10) * 0.55), transform: `translateY(${(1 - p) * 60 + Math.sin((f + i * 20) / 16) * 8}px) rotate(${m.r}deg) scale(${0.7 + 0.3 * p})` }}>
            <div style={{ width: 46, height: 46, borderRadius: 23, background: ZAP, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>💬</div>
            {m.t}
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 420, opacity: 1 - entre(f, q - 4, q + 4) }}>
        <Titulo texto="Seu cliente *já* *decidiu* comprar." tam={92} atraso={2} />
      </div>
      <div style={{ position: "absolute", top: 400, opacity: entre(f, q, q + 6) }}>
        {f >= q ? <Titulo texto="Quem atende *primeiro?*" tam={124} atraso={q} passo={6} /> : null}
      </div>
    </Cena>
  );
};

// 1 · A Nexor junta 4 ferramentas numa máquina de vendas
const FERR = [
  { n: "Barber", i: "✂️", c: LARANJA, a: -140 },
  { n: "Cardápio 3D", i: "🍕", c: ROSA, a: -40 },
  { n: "CRM", i: "📊", c: COR.ciano, a: 40 },
  { n: "Atende IA", i: "💬", c: VERDE, a: 140 },
];
const S1: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const q4 = em(de, 6.83), qm = em(de, 8.56);
  const logo = useMola(2, { damping: 15, mass: 0.9 });
  const motor = useMola(qm);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", width: 820, height: 820, borderRadius: "50%", border: "2px dashed rgba(120,170,255,0.25)", transform: `rotate(${f * 0.4}deg) scale(${logo})` }} />
      <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, rgba(0,88,250,${0.35 + motor * 0.3}), transparent 70%)`, transform: `scale(${1 + Math.sin(f / 5) * 0.04 * motor})` }} />
      <Img src={staticFile("logo-mark.webp")} style={{ width: 170, height: 170, borderRadius: 40, transform: `scale(${logo}) rotate(${(1 - logo) * -90}deg)`, boxShadow: "0 0 80px rgba(0,225,251,0.5)" }} />
      {FERR.map((x, i) => {
        const p = useMola(q4 + i * 5, { damping: 12, mass: 0.6 });
        const ang = (x.a * Math.PI) / 180;
        const r = 400 * p;
        const px = Math.sin(ang) * r * 1.25, py = -Math.cos(ang) * r * 0.62 + 40;
        return (
          <React.Fragment key={x.n}>
            <svg style={{ position: "absolute", left: 960, top: 540, overflow: "visible" }} width={1} height={1}>
              <line x1={0} y1={0} x2={px} y2={py} stroke={x.c} strokeWidth={3} strokeDasharray="10 10" strokeDashoffset={-f * 2} opacity={p * 0.7} />
            </svg>
            <div style={{ position: "absolute", left: 960 + px - 170, top: 540 + py - 60, width: 340, display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderRadius: 26, ...VIDRO, border: `2px solid ${x.c}`, opacity: Math.min(1, p * 1.4), transform: `scale(${0.6 + 0.4 * p}) translateY(${Math.sin((f + i * 15) / 14) * 6}px)` }}>
              <div style={{ fontSize: 44 }}>{x.i}</div>
              <div style={TXT(34, 700)}>{x.n}</div>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ position: "absolute", bottom: 150, ...pop(motor) }}>
        <div style={{ ...TXT(64, 700), letterSpacing: "-0.02em" }}><Rico texto="Uma só *máquina* *de* *vendas*" /></div>
      </div>
    </Cena>
  );
};

// 2 · Barber: o cliente agenda sozinho pelo app
const S2: React.FC<P> = ({ d, de }) => (
  <TelaViva d={d} img="vendas/barber-app.webp" fx={0.18} fy={0.37} cor={LARANJA} selo="1 · NEXOR BARBER" nome="Barbearia" sub="O cliente agenda sozinho, pelo app com a marca da casa."
    clique={em(de, 12.63)} pops={[{ de: em(de, 12.63) + 6, x: { icone: "📲", txt: "Agendado pelo app", lado: "d", y: 0.12 } }, { de: em(de, 14.52), x: { icone: "🌙", txt: "Horário marcado · 23:14", lado: "e", y: 0.7 } }]} />
);

// 3 · Lembrete, cadeira cheia, clube de assinatura
const S3: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const ql = em(de, 15.75), qc = em(de, 17.57), qb = em(de, 19.47), qm = em(de, 20.76);
  const n = useMola(ql, { damping: 11, mass: 0.6 });
  const c = useMola(qb);
  const ok = useMola(qm, { damping: 9, mass: 0.5 });
  const cad = [0, 1, 2, 3, 4, 5];
  return (
    <Cena d={d}>
      {/* celular com o lembrete */}
      <div style={{ position: "absolute", left: 170, top: 120, transform: `translateY(${(1 - entre(f, 0, 14)) * 200}px) rotate(-4deg)` }}>
        <Celular w={360}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#1e3a8a,#0b1430)" }} />
          <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center", ...TXT(86, 600) }}>08:40</div>
          <div style={{ position: "absolute", top: 220, left: 16, right: 16, padding: 18, borderRadius: 20, background: "rgba(255,255,255,0.95)", ...pop(n, 60) }}>
            <div style={{ ...TXT(18, 700, "#64748b") }}>BARBEARIA NAVALHA · agora</div>
            <div style={{ ...TXT(24, 700, "#0b1733"), marginTop: 6 }}>⏰ Lembrete do seu horário</div>
            <div style={{ ...TXT(21, 500, "#334155"), marginTop: 4 }}>Hoje às 09:00 com Bruno. Confirmar?</div>
            <div style={{ marginTop: 12, padding: "10px 0", borderRadius: 12, background: VERDE, textAlign: "center", ...TXT(20, 700, "#fff"), transform: `scale(${f > ql + 22 && f < ql + 28 ? 0.92 : 1})` }}>Confirmar ✓</div>
          </div>
        </Celular>
      </div>
      {/* cadeiras enchendo */}
      <div style={{ position: "absolute", left: 700, top: 170, width: 560, ...VIDRO, padding: 34 }}>
        <div style={{ ...TXT(30, 700) }}>Agenda de hoje</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 24 }}>
          {cad.map((i) => {
            const p = useMola(qc + i * 4, { damping: 12, mass: 0.5 });
            return (
              <div key={i} style={{ height: 110, borderRadius: 20, background: p > 0.5 ? `${LARANJA}33` : "rgba(255,255,255,0.06)", border: `2px solid ${p > 0.5 ? LARANJA : "rgba(255,255,255,0.12)"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <div style={{ fontSize: 40, transform: `scale(${0.4 + 0.6 * p})`, opacity: p }}>💈</div>
                <div style={{ ...TXT(18, 600, COR.suave) }}>{["09:00", "09:40", "10:20", "11:00", "14:00", "15:30"][i]}</div>
              </div>
            );
          })}
        </div>
        <div style={{ ...TXT(26, 600, LARANJA), marginTop: 22, opacity: entre(f, qc + 26, qc + 36) }}>Cadeira cheia o dia todo</div>
      </div>
      {/* clube de assinatura */}
      <div style={{ position: "absolute", left: 1330, top: 230, width: 460, padding: 34, borderRadius: 30, background: "linear-gradient(150deg,#2a1a05,#0d1530)", border: `2px solid ${LARANJA}`, boxShadow: `0 30px 90px rgba(0,0,0,0.5), 0 0 60px ${LARANJA}33`, opacity: Math.min(1, c * 1.4), transform: `translateX(${(1 - c) * 200}px) rotate(${(1 - c) * 8}deg)` }}>
        <div style={{ ...TXT(22, 700, LARANJA), letterSpacing: "0.16em" }}>👑 CLUBE NAVALHA</div>
        <div style={{ ...TXT(40, 700), marginTop: 14 }}>Assinatura ativa</div>
        <div style={{ ...TXT(24, 500, COR.suave), marginTop: 8 }}>Corte ilimitado · barba 2× no mês</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 24, ...pop(ok) }}>
          <div style={{ width: 54, height: 54, borderRadius: 27, background: VERDE, display: "flex", alignItems: "center", justifyContent: "center", ...TXT(32, 700, "#fff") }}>✓</div>
          <div style={TXT(28, 700, "#dcfce7")}>Mês garantido</div>
        </div>
      </div>
    </Cena>
  );
};

// 4 · O cardápio ganha vida
const S4: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qv = em(de, 24.35);
  const sobe = useMola(qv - 4, { damping: 12, mass: 0.8 });
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 120 }}><Titulo texto="O cardápio *ganha* *vida*" tam={104} atraso={2} /></div>
      {/* cardápio de papel deitado */}
      <div style={{ position: "absolute", top: 560, perspective: 1400 }}>
        <div style={{ width: 760, height: 420, borderRadius: 26, background: "linear-gradient(160deg,#fdf6e3,#f1e3c2)", transform: `rotateX(62deg)`, boxShadow: "0 40px 90px rgba(0,0,0,0.55)", padding: 40 }}>
          <div style={{ ...TXT(44, 700, "#7c2d12"), textAlign: "center" }}>CARDÁPIO</div>
          {["Pizza calabresa", "X-burger da casa", "Suco de laranja", "Bolo de chocolate"].map((x, i) => <div key={x} style={{ ...TXT(28, 500, "#44403c"), marginTop: 16, borderBottom: "2px dotted #a8a29e", opacity: 1 - sobe * 0.5 }}>{x}</div>)}
        </div>
      </div>
      {/* o prato sobe em 3D */}
      <div style={{ position: "absolute", top: 230, transform: `translateY(${(1 - sobe) * 260}px) scale(${0.3 + 0.7 * sobe})`, opacity: Math.min(1, sobe * 1.5), filter: `drop-shadow(0 0 ${40 + Math.sin(f / 6) * 15}px rgba(244,114,182,0.55))` }}>
        <Giro nome="pizza-calabresa" tam={560} desde={qv - 4} />
      </div>
      {new Array(14).fill(0).map((_, i) => {
        const p = entre(f, qv + i, qv + i + 22);
        const a = (i / 14) * Math.PI * 2;
        return <div key={i} style={{ position: "absolute", left: 960 + Math.cos(a) * 330 * p, top: 560 + Math.sin(a) * 200 * p - 60, width: 10, height: 10, borderRadius: 5, background: i % 2 ? ROSA : COR.ciano, opacity: p > 0 && p < 1 ? 1 - p : 0 }} />;
      })}
      <div style={{ position: "absolute", left: 110, top: 380, ...pop(useMola(4), 20) }}>
        <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: `${ROSA}26`, border: `1.5px solid ${ROSA}`, ...TXT(24, 700, ROSA), letterSpacing: "0.18em" }}>2 · CARDÁPIO 3D</div>
      </div>
    </Cena>
  );
};

// 5 · QR da mesa, prato girando em 3D
const S5: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qa = em(de, 26.05), qr = em(de, 27.23), qg = em(de, 29.34), q3 = em(de, 30.4);
  const cel = useMola(qa - 6, { damping: 15, mass: 0.9 });
  const scan = entre(f, qr, qr + 18);
  const tela = entre(f, qr + 16, qr + 26);
  const tres = useMola(q3, { damping: 9, mass: 0.5 });
  const lado = useMola(qg + 10);
  return (
    <Cena d={d}>
      {/* mesa com QR */}
      <div style={{ position: "absolute", left: 140, top: 640, width: 640, height: 300, borderRadius: 40, background: "linear-gradient(160deg,#6b3f1d,#3b220f)", boxShadow: "0 40px 80px rgba(0,0,0,0.5)", transform: "perspective(1200px) rotateX(48deg)" }}>
        <div style={{ position: "absolute", left: 230, top: 50, width: 180, height: 200, borderRadius: 14, background: "#fff", padding: 14 }}>
          <div style={{ width: "100%", height: 150, backgroundImage: "linear-gradient(90deg,#000 50%,transparent 0),linear-gradient(#000 50%,transparent 0)", backgroundSize: "18px 18px", opacity: 0.85 }} />
          <div style={{ ...TXT(16, 700, "#0b1733"), textAlign: "center", marginTop: 4 }}>MESA 4</div>
        </div>
      </div>
      {/* celular que aponta e mostra o prato */}
      <div style={{ position: "absolute", left: 300, top: 70, transform: `translateY(${(1 - cel) * 500}px) rotate(${interpolate(cel, [0, 1], [20, -6])}deg)` }}>
        <Celular w={330}>
          <div style={{ position: "absolute", inset: 0, background: "#111827" }} />
          <div style={{ position: "absolute", left: 40, right: 40, top: 230, height: 4, background: ROSA, boxShadow: `0 0 20px ${ROSA}`, transform: `translateY(${Math.sin(scan * Math.PI * 2) * 120}px)`, opacity: scan > 0 && scan < 1 ? 1 : 0 }} />
          <div style={{ position: "absolute", inset: 0, opacity: tela, background: "radial-gradient(circle at 50% 40%, #3b0f2c, #0b1430 70%)" }}>
            <div style={{ position: "absolute", top: 60, width: "100%", textAlign: "center", ...TXT(22, 700, ROSA), letterSpacing: "0.12em" }}>CANTINA EXEMPLO</div>
            <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Giro nome="pizza-calabresa" tam={300} vel={1} desde={qr} /></div>
            <div style={{ position: "absolute", top: 450, width: "100%", textAlign: "center", ...TXT(26, 700) }}>Pizza calabresa</div>
            <div style={{ position: "absolute", top: 500, left: 30, right: 30, padding: "12px 0", borderRadius: 14, background: GRAD_BOTAO, textAlign: "center", ...TXT(20, 700, "#fff") }}>Ver na minha mesa</div>
          </div>
        </Celular>
      </div>
      {/* prato grande girando */}
      <div style={{ position: "absolute", left: 860, top: 120, opacity: entre(f, qg - 6, qg + 6), transform: `scale(${0.8 + 0.2 * entre(f, qg - 6, qg + 10)})`, filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.5))" }}>
        <Giro nome="pizza-calabresa" tam={620} vel={0.9} desde={qg - 6} />
      </div>
      <div style={{ position: "absolute", left: 1360, top: 140, padding: "16px 30px", borderRadius: 999, background: ROSA, ...TXT(54, 800, "#fff"), transform: `scale(${tres}) rotate(${(1 - tres) * -30}deg)`, boxShadow: `0 0 50px ${ROSA}` }}>3D</div>
      <div style={{ position: "absolute", left: 900, top: 760, display: "flex", gap: 30, opacity: lado, transform: `translateY(${(1 - lado) * 80}px)` }}>
        {["x-burger", "suco-laranja", "bolo-chocolate"].map((n) => <div key={n} style={{ ...VIDRO, borderRadius: 28, padding: 6 }}><Giro nome={n} tam={210} vel={0.8} desde={qg} /></div>)}
      </div>
    </Cena>
  );
};

// 6 · Cada conversa vira cliente no CRM
const S6: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qv = em(de, 32.86), qc = em(de, 34.56);
  const voa = entre(f, qv, qv + 24);
  const card = useMola(qv + 18, { damping: 12, mass: 0.6 });
  const crm = useMola(qc - 4);
  const msgs = ["Oi! Vocês fazem entrega?", "Quero 2 pizzas para sábado", "Qual o horário de vocês?"];
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 110, top: 160, ...pop(useMola(2), 20) }}>
        <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: `${COR.ciano}26`, border: `1.5px solid ${COR.ciano}`, ...TXT(24, 700, COR.ciano), letterSpacing: "0.18em" }}>3 · CRM DO NEXOR ATENDE</div>
      </div>
      {msgs.map((m, i) => {
        const p = useMola(4 + i * 6, { damping: 12, mass: 0.5 });
        const x0 = 180, y0 = 330 + i * 130;
        return (
          <div key={m} style={{ position: "absolute", left: interpolate(voa, [0, 1], [x0, 1180]), top: interpolate(voa, [0, 1], [y0, 470]), padding: "18px 26px", borderRadius: 22, borderBottomLeftRadius: 4, background: "#fff", ...TXT(30, 500, "#0b1733"), boxShadow: "0 18px 40px rgba(0,0,0,0.35)", opacity: Math.min(1, p * 1.4) * (1 - voa), transform: `scale(${(0.7 + 0.3 * p) * (1 - voa * 0.7)})` }}>{m}</div>
        );
      })}
      <div style={{ position: "absolute", left: 1060, top: 300, width: 600, ...VIDRO, padding: 36, borderColor: COR.ciano, opacity: Math.min(1, card * 1.4), transform: `scale(${0.6 + 0.4 * card}) rotate(${(1 - card) * 6}deg)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 90, height: 90, borderRadius: 45, background: "linear-gradient(135deg,#0ea5e9,#22c55e)", display: "flex", alignItems: "center", justifyContent: "center", ...TXT(36, 700, "#fff") }}>MA</div>
          <div>
            <div style={TXT(40, 700)}>Mariana Alves</div>
            <div style={TXT(24, 500, COR.suave)}>Novo cliente · WhatsApp</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
          {["entrega", "sábado", "2 pizzas"].map((x, i) => <div key={x} style={{ padding: "8px 16px", borderRadius: 999, background: "rgba(0,225,251,0.15)", ...TXT(22, 600, COR.ciano), ...pop(useMola(qv + 30 + i * 5), 14) }}>{x}</div>)}
        </div>
      </div>
      <div style={{ position: "absolute", left: 1160, top: 680, ...pop(crm) }}>
        <div style={{ ...TXT(64, 700), letterSpacing: "-0.02em" }}><Rico texto="Virou *cliente* no *CRM*" /></div>
      </div>
    </Cena>
  );
};

// 7 · A IA preenche, dá nota e move o funil
const COLS = ["Novo", "Qualificado", "Proposta", "Fechado"];
const S7: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qp = em(de, 36.68), qn = em(de, 38.57), qf = em(de, 40.0);
  const campos = [["Nome", "Mariana Alves"], ["Interesse", "2 pizzas · sábado"], ["Canal", "WhatsApp"]];
  const nota = Math.round(interpolate(f, [qn, qn + 24], [0, 88], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const etapa = interpolate(f, [qf, qf + 14, qf + 22, qf + 36], [0, 1, 1, 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const largura = 300, gap = 30, x0 = 960 - (COLS.length * largura + (COLS.length - 1) * gap) / 2;
  return (
    <Cena d={d}>
      {/* ficha preenchida pela IA */}
      <div style={{ position: "absolute", left: 110, top: 110, width: 700, ...VIDRO, padding: 34 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={TXT(32, 700)}>Ficha do contato</div>
          <div style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(167,139,250,0.2)", ...TXT(20, 700, "#c4b5fd") }}>✨ IA preenchendo</div>
        </div>
        {campos.map(([k, v], i) => {
          const de2 = qp + i * 10;
          const n = Math.floor(interpolate(f, [de2, de2 + 14], [0, v.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
          return (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginTop: 18, padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.05)" }}>
              <div style={TXT(24, 500, COR.suave)}>{k}</div>
              <div style={TXT(26, 600)}>{v.slice(0, n)}{n > 0 && n < v.length ? "▍" : ""}</div>
            </div>
          );
        })}
      </div>
      {/* nota de interesse */}
      <div style={{ position: "absolute", left: 900, top: 110, width: 460, ...VIDRO, padding: 34, opacity: entre(f, qn - 6, qn + 4) }}>
        <div style={TXT(28, 700)}>Nota de interesse</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 10 }}>
          <div style={{ ...TXT(110, 800), background: "linear-gradient(90deg,#f59e0b,#ef4444)", WebkitBackgroundClip: "text", color: "transparent" }}>{nota}</div>
          <div style={{ fontSize: 64, transform: `scale(${1 + Math.sin(f / 4) * 0.08 * (nota / 88)})` }}>🔥</div>
        </div>
        <div style={{ height: 14, borderRadius: 7, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: `${nota}%`, height: "100%", background: "linear-gradient(90deg,#f59e0b,#ef4444)" }} />
        </div>
        <div style={{ ...TXT(24, 600, "#fca5a5"), marginTop: 14, opacity: entre(f, qn + 20, qn + 30) }}>Pronta para comprar</div>
      </div>
      {/* funil que anda sozinho */}
      <div style={{ position: "absolute", left: 0, top: 560, width: 1920, opacity: entre(f, qf - 16, qf - 4) }}>
        {COLS.map((c, i) => (
          <div key={c} style={{ position: "absolute", left: x0 + i * (largura + gap), width: largura, height: 330, borderRadius: 24, background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(120,170,255,0.18)", padding: 20 }}>
            <div style={{ ...TXT(26, 700, i === Math.round(etapa) ? COR.ciano : COR.suave) }}>{c}</div>
            {[0, 1].map((k) => <div key={k} style={{ height: 66, borderRadius: 14, background: "rgba(255,255,255,0.06)", marginTop: 14 + (k === 0 ? 96 : 0) }} />)}
          </div>
        ))}
        <div style={{ position: "absolute", left: x0 + 20 + etapa * (largura + gap), top: 92, width: largura - 40, padding: "14px 18px", borderRadius: 16, background: "linear-gradient(135deg,#0b3b6f,#0a2a52)", border: `2px solid ${COR.ciano}`, boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 40px ${COR.ciano}55`, transform: `rotate(${Math.sin(etapa * Math.PI) * 5}deg) scale(${1 + Math.sin(etapa * Math.PI) * 0.08})` }}>
          <div style={TXT(24, 700)}>Mariana Alves</div>
          <div style={{ ...TXT(20, 600, "#fdba74"), marginTop: 4 }}>🔥 {nota} · 2 pizzas</div>
        </div>
      </div>
    </Cena>
  );
};

// 8 · A equipe liga primeiro para quem está pronto
const LEADS = [["Mariana Alves", 88], ["Carlos Eduardo", 79], ["Juliana Costa", 64], ["Roberto Santos", 41]] as const;
const S8: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const ql = em(de, 43.0), qp = em(de, 44.36);
  const liga = useMola(ql);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 160, top: 170, width: 820, ...VIDRO, padding: 36 }}>
        <div style={{ ...TXT(34, 700) }}>🔥 Leads quentes</div>
        {LEADS.map(([n, s], i) => {
          const p = useMola(4 + i * 5);
          const top = i === 0;
          return (
            <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, padding: "18px 22px", borderRadius: 18, background: top ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)", border: top ? `2px solid rgba(248,113,113,${0.5 + Math.sin(f / 5) * 0.4})` : "2px solid transparent", ...pop(p, 30) }}>
              <div style={TXT(30, 600)}>{n}</div>
              <div style={{ ...TXT(30, 700, s > 70 ? "#fdba74" : COR.suave) }}>{s}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 1120, top: 250, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {[0, 1, 2].map((k) => {
          const o = ((f - ql) / 30 + k / 3) % 1;
          return <div key={k} style={{ position: "absolute", top: 110 - 130 * 0 + 0, width: 260, height: 260, borderRadius: 130, border: `3px solid ${VERDE}`, opacity: f > ql ? (1 - o) * 0.8 : 0, transform: `scale(${0.6 + o * 1.2})` }} />;
        })}
        <div style={{ width: 260, height: 260, borderRadius: 130, background: VERDE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 120, transform: `scale(${liga}) rotate(${Math.sin(f / 2) * 8 * liga}deg)`, boxShadow: `0 0 80px ${VERDE}88` }}>📞</div>
        <div style={{ ...TXT(44, 700), marginTop: 50, ...pop(liga) }}>Ligar para Mariana</div>
        <div style={{ ...TXT(30, 600, "#bbf7d0"), marginTop: 14, ...pop(useMola(qp)) }}>Pronta para fechar</div>
      </div>
    </Cena>
  );
};

// 9 · Junte tudo no seu restaurante
const S9: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qj = em(de, 47.62);
  const junta = entre(f, qj - 6, qj + 16);
  const loja = useMola(qj + 10, { damping: 12, mass: 0.7 });
  const itens = [{ i: "🍕", t: "Cardápio 3D", c: ROSA, x: -560 }, { i: "💬", t: "Atende IA", c: VERDE, x: 0 }, { i: "📊", t: "CRM", c: COR.ciano, x: 560 }];
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 110, top: 160, ...pop(useMola(2), 20) }}>
        <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: `${VERDE}26`, border: `1.5px solid ${VERDE}`, ...TXT(24, 700, VERDE), letterSpacing: "0.18em" }}>4 · RESTAURANTES</div>
      </div>
      {itens.map((x, k) => {
        const p = useMola(2 + k * 5);
        return (
          <div key={x.t} style={{ position: "absolute", left: 960 + x.x * (1 - junta) - 150, top: 420 - junta * 40, width: 300, padding: 30, borderRadius: 30, ...VIDRO, border: `2px solid ${x.c}`, textAlign: "center", opacity: Math.min(1, p * 1.4) * (1 - junta * 0.9), transform: `scale(${(0.6 + 0.4 * p) * (1 - junta * 0.4)})` }}>
            <div style={{ fontSize: 80 }}>{x.i}</div>
            <div style={{ ...TXT(34, 700), marginTop: 10 }}>{x.t}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 300, display: "flex", flexDirection: "column", alignItems: "center", opacity: Math.min(1, loja * 1.4), transform: `scale(${0.5 + 0.5 * loja})` }}>
        <div style={{ width: 520, height: 70, borderRadius: "26px 26px 0 0", background: `repeating-linear-gradient(90deg, ${VERDE} 0 52px, #f8fafc 52px 104px)` }} />
        <div style={{ width: 480, height: 240, background: "linear-gradient(180deg,#1e293b,#0f172a)", borderRadius: "0 0 20px 20px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 70px ${VERDE}44` }}>
          <Giro nome="pizza-calabresa" tam={230} vel={0.8} desde={qj} />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 150, ...pop(loja) }}>
        <div style={{ ...TXT(70, 700), letterSpacing: "-0.02em" }}><Rico texto="Tudo junto no *seu* *restaurante*" /></div>
      </div>
    </Cena>
  );
};

// 10 · Escolhe no 3D, toca em pedir, a IA anota no WhatsApp
const S10: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qe = em(de, 50.69), qt = em(de, 52.95), qi = em(de, 54.53), qa = em(de, 56.17);
  const toque = entre(f, qt, qt + 10);
  const zap = useMola(qt + 6, { damping: 14, mass: 0.7 });
  return (
    <Cena d={d}>
      {/* celular com o cardápio 3D */}
      <div style={{ position: "absolute", left: 250, top: 150, transform: `translateY(${(1 - entre(f, 0, 14)) * 300}px) rotate(-3deg)` }}>
        <Celular w={370}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 35%, #3b0f2c, #0b1430 70%)" }} />
          <div style={{ position: "absolute", top: 64, width: "100%", textAlign: "center", ...TXT(24, 700, ROSA), letterSpacing: "0.12em" }}>CANTINA EXEMPLO · MESA 4</div>
          <div style={{ position: "absolute", top: 120, width: "100%", display: "flex", justifyContent: "center" }}><Giro nome="pizza-calabresa" tam={320} vel={0.9} /></div>
          <div style={{ position: "absolute", top: 450, width: "100%", textAlign: "center", ...TXT(32, 700) }}>Pizza calabresa</div>
          <div style={{ position: "absolute", top: 496, width: "100%", textAlign: "center", ...TXT(22, 500, COR.suave) }}>Grande · 8 fatias</div>
          <div style={{ position: "absolute", top: 540, left: 30, right: 30, display: "flex", gap: 12, opacity: entre(f, qe, qe + 10) }}>
            {["x-burger", "suco-laranja"].map((n) => <div key={n} style={{ flex: 1, borderRadius: 18, background: "rgba(255,255,255,0.06)", display: "flex", justifyContent: "center" }}><Giro nome={n} tam={100} vel={0.8} /></div>)}
          </div>
          <div style={{ position: "absolute", bottom: 46, left: 30, right: 30, padding: "18px 0", borderRadius: 18, background: ZAP, textAlign: "center", ...TXT(26, 700, "#fff"), transform: `scale(${toque > 0 && toque < 1 ? 0.92 : 1})`, boxShadow: `0 0 ${20 + Math.sin(f / 5) * 12}px ${ZAP}` }}>Pedir pelo WhatsApp</div>
          {/* dedo que toca */}
          <div style={{ position: "absolute", left: 240, bottom: 20, fontSize: 70, opacity: entre(f, qt - 14, qt - 4) * (1 - entre(f, qt + 12, qt + 20)), transform: `translateY(${(1 - entre(f, qt - 14, qt)) * 120}px)` }}>👆</div>
          <div style={{ position: "absolute", left: 160, bottom: 30, width: 120, height: 120, borderRadius: 60, border: `4px solid #fff`, opacity: toque > 0 ? 1 - toque : 0, transform: `scale(${0.3 + toque * 1.4})` }} />
        </Celular>
      </div>
      {/* WhatsApp com a IA anotando */}
      <div style={{ position: "absolute", left: 960, top: 150, width: 720, height: 760, borderRadius: 36, overflow: "hidden", background: "#efe7dd", boxShadow: "0 50px 120px rgba(0,0,0,0.55)", opacity: Math.min(1, zap * 1.4), transform: `translateX(${(1 - zap) * 260}px) rotate(${(1 - zap) * 6}deg)` }}>
        <div style={{ height: 96, background: "#075e54", display: "flex", alignItems: "center", gap: 18, padding: "0 26px" }}>
          <div style={{ width: 58, height: 58, borderRadius: 29, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🍕</div>
          <div>
            <div style={TXT(28, 700, "#fff")}>Cantina Exemplo</div>
            <div style={TXT(20, 500, "#b2f5ea")}>{f > qi && f < qa ? "digitando…" : "online"}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 26 }}>
          <Balao de={qt + 14} lado="d">Olá! Quero pedir pela mesa 4: 1 pizza calabresa grande e 1 suco de laranja 🍕🥤</Balao>
          <Digitando de={qi - 4} ate={qa} />
          <Balao de={qa} lado="e">Anotado! ✅ Pedido #127, mesa 4:{"\n"}• 1 pizza calabresa grande{"\n"}• 1 suco de laranja{"\n"}Já foi para a cozinha. Fica pronto em 25 min 😊</Balao>
          <Balao de={qa + 26} lado="e" cor="#e0f2fe">🤖 Nexor Atende IA · pedido enviado para a cozinha</Balao>
        </div>
      </div>
    </Cena>
  );
};

// 11 · Sem parar a cozinha, sem perder pedido, direto com você
const S11: React.FC<P> = ({ d, de }) => {

  const qs = [em(de, 58.26), em(de, 59.68), em(de, 61.32)];
  const itens = [{ i: "👨‍🍳", t: "Sem parar a cozinha", c: LARANJA }, { i: "✅", t: "Sem perder pedido", c: VERDE }, { i: "🤝", t: "Direto com você", c: COR.ciano }];
  const tk = useMola(4, { damping: 13, mass: 0.7 });
  return (
    <Cena d={d}>
      {/* comanda que sai da impressora */}
      <div style={{ position: "absolute", left: 220, top: 200, width: 420 }}>
        <div style={{ height: 70, borderRadius: 16, background: "#1f2937", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }} />
        <div style={{ margin: "0 30px", height: interpolate(tk, [0, 1], [0, 560]), overflow: "hidden", background: "#fff", borderRadius: "0 0 10px 10px", padding: "0 28px", boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}>
          <div style={{ ...TXT(34, 800, "#0b1733"), marginTop: 28, textAlign: "center" }}>PEDIDO #127</div>
          <div style={{ ...TXT(24, 600, "#475569"), textAlign: "center", marginTop: 6 }}>Mesa 4 · via WhatsApp</div>
          <div style={{ borderTop: "3px dashed #cbd5e1", margin: "22px 0" }} />
          {["1× Pizza calabresa G", "1× Suco de laranja"].map((x) => <div key={x} style={{ ...TXT(28, 600, "#0b1733"), marginTop: 14 }}>{x}</div>)}
          <div style={{ borderTop: "3px dashed #cbd5e1", margin: "22px 0" }} />
          <div style={{ ...TXT(24, 700, VERDE), textAlign: "center" }}>Anotado pela IA ✓</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 880, top: 230, display: "flex", flexDirection: "column", gap: 34 }}>
        {itens.map((x, k) => {
          const p = useMola(qs[k], { damping: 12, mass: 0.6 });
          return (
            <div key={x.t} style={{ display: "flex", alignItems: "center", gap: 28, padding: "30px 40px", borderRadius: 30, ...VIDRO, border: `2px solid ${x.c}`, opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * 200}px) scale(${0.8 + 0.2 * p})` }}>
              <div style={{ fontSize: 70 }}>{x.i}</div>
              <div style={TXT(56, 700)}>{x.t}</div>
            </div>
          );
        })}
      </div>
    </Cena>
  );
};

// 12 · A gente instala, configura e treina, aqui de Araguari
const S12: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qs = [em(de, 63.89), em(de, 64.67), em(de, 65.86)];
  const qa = em(de, 67.59);
  const pin = useMola(qa, { damping: 9, mass: 0.6 });
  const passos = [{ i: "🛠️", t: "Instala" }, { i: "⚙️", t: "Configura" }, { i: "🎓", t: "Treina a equipe" }];
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 150 }}><Titulo texto="A gente *cuida* *de* *tudo*" tam={96} atraso={2} /></div>
      <div style={{ position: "absolute", top: 380, display: "flex", gap: 40 }}>
        {passos.map((x, k) => {
          const p = useMola(qs[k] - 4);
          const barra = entre(f, qs[k], qs[k] + 20);
          return (
            <div key={x.t} style={{ width: 420, padding: 36, ...VIDRO, ...pop(p, 60) }}>
              <div style={{ fontSize: 76 }}>{x.i}</div>
              <div style={{ ...TXT(44, 700), marginTop: 14 }}>{x.t}</div>
              <div style={{ height: 14, borderRadius: 7, background: "rgba(255,255,255,0.1)", marginTop: 24, overflow: "hidden" }}><div style={{ width: `${barra * 100}%`, height: "100%", background: GRAD }} /></div>
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, opacity: barra >= 1 ? 1 : 0 }}><div style={{ width: 36, height: 36, borderRadius: 18, background: VERDE, display: "flex", alignItems: "center", justifyContent: "center", ...TXT(22, 700, "#fff") }}>✓</div><div style={TXT(26, 600, "#bbf7d0")}>Pronto</div></div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", bottom: 150, display: "flex", alignItems: "center", gap: 18, padding: "20px 36px", borderRadius: 999, background: "rgba(0,88,250,0.2)", border: `2px solid ${COR.azulClaro}`, ...pop(pin) }}>
        <div style={{ fontSize: 50, transform: `translateY(${Math.abs(Math.sin(f / 6)) * -10}px)` }}>📍</div>
        <div style={TXT(44, 700)}>Time aqui de Araguari (MG)</div>
      </div>
    </Cena>
  );
};

/* Capítulos no topo: mostra em que parte do vídeo estamos */
const Capitulos: React.FC<{ ini: number[] }> = ({ ini }) => {
  const f = useCurrentFrame();
  const comeco = ini[2], fim = ini[13];
  if (f < comeco - 10 || f > fim + 10) return null;
  const op = entre(f, comeco - 10, comeco) * (1 - entre(f, fim, fim + 10));
  const atual = CAPITULOS.filter((c) => f >= ini[c.de]).length - 1;
  return (
    <div style={{ position: "absolute", top: 50, right: 64, display: "flex", gap: 14, opacity: op }}>
      {CAPITULOS.map((c, i) => (
        <div key={c.n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 999, background: i === atual ? `${c.cor}33` : "rgba(255,255,255,0.05)", border: `1.5px solid ${i === atual ? c.cor : "rgba(255,255,255,0.12)"}`, ...TXT(22, 700, i === atual ? "#fff" : COR.suave), transform: `scale(${i === atual ? 1.06 : 1})` }}>
          <span style={{ color: c.cor }}>{c.n}</span>{c.nome}
        </div>
      ))}
    </div>
  );
};

/* ---------- vídeo ---------- */
const CENAS: ((d: number, de: number) => React.ReactNode)[] = [
  (d, de) => <S0 d={d} de={de} />,
  (d, de) => <S1 d={d} de={de} />,
  (d, de) => <S2 d={d} de={de} />,
  (d, de) => <S3 d={d} de={de} />,
  (d, de) => <S4 d={d} de={de} />,
  (d, de) => <S5 d={d} de={de} />,
  (d, de) => <S6 d={d} de={de} />,
  (d, de) => <S7 d={d} de={de} />,
  (d, de) => <S8 d={d} de={de} />,
  (d, de) => <S9 d={d} de={de} />,
  (d, de) => <S10 d={d} de={de} />,
  (d, de) => <S11 d={d} de={de} />,
  (d, de) => <S12 d={d} de={de} />,
  (d) => <C12 d={d} />,
  (d) => <C13 d={d} />,
];

export const VideoVendas: React.FC = () => {
  const voz: Voz = useVoz(PASTA);
  const f = useCurrentFrame();
  const total = duracaoVendas;
  const ini = TEMPOS.frases.map((x, i) => (i === 0 ? 0 : quadro((TEMPOS.frases[i - 1][1] + x[0]) / 2)));
  const marca = 1 - entre(f, ini[ini.length - 1] - 10, ini[ini.length - 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: COR.navy }}>
      <Fundo voz={voz} />
      <Poeira n={28} />
      {CENAS.map((c, i) => {
        const de = ini[i];
        const d = (i + 1 < ini.length ? ini[i + 1] : total) - de;
        return (
          <Sequence key={i} from={de} durationInFrames={d} layout="none">
            {c(d, de)}
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", top: 50, left: 64, display: "flex", alignItems: "center", gap: 14, ...TXT(28, 600), opacity: marca * entre(f, 20, 40) }}>
        <Img src={staticFile("logo-mark.webp")} style={{ width: 44, height: 44, borderRadius: 11 }} />
        Nexor Consulting
      </div>
      <Capitulos ini={ini} />
      <Legenda esconder={[14]} falas={FALAS as string[]} tempos={TEMPOS} />
      <Audio src={staticFile(`${PASTA}/trilha.wav`)} volume={(q) => interpolate(q, [0, 30, total - 60, total], [0, 0.26, 0.26, 0], { extrapolateRight: "clamp" })} />
      <Sequence from={quadro(0)} layout="none">
        <Audio src={staticFile(`${PASTA}/locucao.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
