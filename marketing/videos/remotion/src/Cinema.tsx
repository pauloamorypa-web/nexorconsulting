/* Piloto cinematográfico: Restaurantes (Nexor Atende + Cardápio 3D). 16:9.
   Linguagem nova: cenas reais geradas por IA em tela cheia, cor de cinema, grão, vazamento de luz,
   interface de realidade aumentada sobre o mundo real, tipografia que bate na palavra e efeitos sonoros.
   Voz: Juliana (ElevenLabs v3). Tempos em src/tempos/cinema.ts. */
import React from "react";
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { FPS, TXT, Rico, entre, quadro, useMola } from "./kit";
import TEMPOS from "./tempos/cinema";
import FALAS from "./tempos/cinema.frases.json";

const CIANO = "#22e5ff", MAGENTA = "#ff3ea5", LARANJA = "#ff9a3c", VERDE = "#2dff9a";
export const duracaoCinema = quadro(TEMPOS.frases[TEMPOS.frases.length - 1][1] + 2.6);
const MONO: React.CSSProperties = { fontFamily: "DejaVu Sans Mono, monospace", letterSpacing: "0.08em" };
type P = { d: number; de: number };
const em = (de: number, seg: number) => quadro(seg) - de;

/* ---------- linguagem visual ---------- */
/* Filmagem em tela cheia com cor de cinema e movimento de câmera */
const Filme: React.FC<{ src: string; d: number; zoom?: [number, number]; x?: [number, number]; vel?: number; desde?: number; grade?: string; desfoque?: number }> = ({ src, d, zoom = [1.04, 1.14], x = [0, 0], vel = 1, desde = 0, grade = "saturate(1.4) contrast(1.15) brightness(1.03)", desfoque = 0 }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, d], zoom, { extrapolateRight: "clamp" });
  const tx = interpolate(f, [0, d], x, { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Loop durationInFrames={Math.floor(148 / vel)} layout="none">
        <OffthreadVideo src={staticFile(src)} muted playbackRate={vel} startFrom={desde} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z}) translateX(${tx}px)`, filter: `${grade}${desfoque ? ` blur(${desfoque}px)` : ""}` }} />
      </Loop>
      {/* teal nas sombras, laranja nas luzes */}
      <AbsoluteFill style={{ background: "linear-gradient(120deg, rgba(0,140,170,0.28), transparent 45%, rgba(255,120,40,0.22))", mixBlendMode: "soft-light" }} />
    </AbsoluteFill>
  );
};

/* Grão de filme, vinheta, vazamento de luz e faixas de cinema */
const Pelicula: React.FC = () => {
  const f = useCurrentFrame();
  const lx = 50 + Math.sin(f / 70) * 40, ly = 30 + Math.cos(f / 90) * 25;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 600px at ${lx}% ${ly}%, rgba(255,110,60,0.16), transparent 70%)`, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: `radial-gradient(700px 500px at ${100 - lx}% ${100 - ly}%, rgba(255,62,165,0.1), transparent 70%)`, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.62) 100%)" }} />
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: 0.13, mixBlendMode: "overlay" }}>
        <filter id="grao"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 60} /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="1920" height="1080" filter="url(#grao)" />
      </svg>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 64, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, background: "#000" }} />
    </AbsoluteFill>
  );
};

/* Corte com soco: zoom, desfoque, flash e fatias deslocadas (glitch) */
const Corte: React.FC<{ children: React.ReactNode; d: number }> = ({ children, d }) => {
  const f = useCurrentFrame();
  const k = 1 - entre(f, 0, 9);
  const sai = entre(f, d - 6, d);
  return (
    <AbsoluteFill style={{ opacity: 1 - sai * 0.4 }}>
      <AbsoluteFill style={{ transform: `scale(${1 + k * 0.09})`, filter: k > 0.02 ? `blur(${k * 10}px)` : undefined }}>{children}</AbsoluteFill>
      {k > 0.05 ? [0, 1, 2].map((i) => {
        const y = random(`g${i}${Math.floor(f / 2)}`) * 900 + 60;
        return <div key={i} style={{ position: "absolute", left: 0, right: 0, top: y, height: 40 + i * 20, background: i % 2 ? `${CIANO}55` : `${MAGENTA}55`, transform: `translateX(${(random(`h${i}${f}`) - 0.5) * 160 * k}px)`, mixBlendMode: "screen" }} />;
      }) : null}
      <AbsoluteFill style={{ background: "#fff", opacity: k * 0.55, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

/* Cantoneiras de interface (HUD) */
const Cantos: React.FC<{ x: number; y: number; w: number; h: number; cor?: string; p?: number }> = ({ x, y, w, h, cor = CIANO, p = 1 }) => {
  const s = 46, e = 4;
  const c = (l: number, t: number, rx: number, ry: number) => (
    <div style={{ position: "absolute", left: l, top: t, width: s, height: s, borderLeft: rx < 0 ? `${e}px solid ${cor}` : undefined, borderRight: rx > 0 ? `${e}px solid ${cor}` : undefined, borderTop: ry < 0 ? `${e}px solid ${cor}` : undefined, borderBottom: ry > 0 ? `${e}px solid ${cor}` : undefined, boxShadow: `0 0 18px ${cor}`, opacity: p }} />
  );
  return <>{c(x, y, -1, -1)}{c(x + w - s, y, 1, -1)}{c(x, y + h - s, -1, 1)}{c(x + w - s, y + h - s, 1, 1)}</>;
};

/* Palavra que bate com tremor e brilho */
const Soco: React.FC<{ de: number; texto: string; tam?: number; cor?: string; top: number; left?: number }> = ({ de, texto, tam = 150, cor = "#fff", top, left }) => {
  const f = useCurrentFrame();
  const p = useMola(de, { damping: 9, mass: 0.6 });
  const tremor = f >= de && f < de + 8 ? (random(`t${f}`) - 0.5) * 18 : 0;
  return (
    <div style={{ position: "absolute", top, left: left ?? 0, right: left === undefined ? 0 : undefined, textAlign: left === undefined ? "center" : "left", opacity: Math.min(1, p * 1.6), transform: `translate(${tremor}px, ${tremor * 0.5}px) scale(${1.6 - 0.6 * Math.min(p, 1)})` }}>
      <span style={{ ...TXT(tam, 800, cor), letterSpacing: "-0.03em", textShadow: `0 0 40px ${cor === "#fff" ? CIANO : cor}aa, 0 10px 40px rgba(0,0,0,0.6)` }}>{texto}</span>
    </div>
  );
};

/* Legenda discreta, em caixa baixa, para quem assiste sem som */
const Legenda: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS - 0.4;
  const i = TEMPOS.frases.findIndex(([a, b]) => t >= a - 0.05 && t < b + 0.3);
  if (i < 0 || i === TEMPOS.frases.length - 1) return null;
  return (
    <div style={{ position: "absolute", bottom: 84, left: 0, right: 0, textAlign: "center" }}>
      <span style={{ ...TXT(30, 500, "rgba(255,255,255,0.92)"), textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>{(FALAS as string[])[i]}</span>
    </div>
  );
};

const Sfx: React.FC<{ de: number; som: string; vol?: number }> = ({ de, som, vol = 0.5 }) => (de >= 0 ? <Sequence from={de} layout="none"><Audio src={staticFile(`cinema/sfx-${som}.wav`)} volume={vol} /></Sequence> : null);

/* ---------- cenas ---------- */

// 0 · Sexta, oito da noite.
const K0: React.FC<P> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(4, { damping: 16, mass: 0.9 });
  const b = useMola(24, { damping: 10, mass: 0.5 });
  return (
    <Corte d={d}>
      <Filme src="cinema/macro.mp4" d={d} zoom={[1.02, 1.12]} vel={0.8} />
      <div style={{ position: "absolute", left: 120, top: 380, opacity: a }}>
        <div style={{ ...TXT(210, 800, "transparent"), WebkitTextStroke: "3px rgba(255,255,255,0.9)", letterSpacing: "0.06em", transform: `translateX(${(1 - a) * -120}px)` }}>SEXTA</div>
        <div style={{ ...MONO, ...TXT(120, 700, LARANJA), textShadow: `0 0 50px ${LARANJA}`, marginTop: -20, opacity: b, transform: `scale(${0.7 + 0.3 * b})`, transformOrigin: "left" }}>20:00</div>
      </div>
      <div style={{ position: "absolute", top: 96, right: 110, display: "flex", alignItems: "center", gap: 12, ...MONO, ...TXT(24, 700, "#fff"), opacity: 0.85 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#ff3b3b", opacity: Math.floor(f / 15) % 2 ? 1 : 0.2 }} />REC · 20:00:{String(Math.floor(f / FPS)).padStart(2, "0")}
      </div>
    </Corte>
  );
};

// 1 · A casa cheia... e o WhatsApp não para.
const NOTIFS = ["Quero uma calabresa grande", "Vocês entregam?", "Tem mesa para 4?", "Qual o cardápio?", "Demora quanto?", "Ainda tá aberto?", "Manda o cardápio 🙏", "Quero 2 pizzas"];
const K1: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qp = em(de, 4.4);
  const n = Math.min(47, Math.floor(interpolate(f, [6, d], [1, 47], { extrapolateRight: "clamp" })));
  return (
    <Corte d={d}>
      <Filme src="cinema/salao.mp4" d={d} zoom={[1.08, 1.16]} x={[0, -40]} />
      <AbsoluteFill style={{ background: "linear-gradient(90deg, transparent 45%, rgba(0,0,0,0.55))" }} />
      <div style={{ position: "absolute", right: 110, top: 130, width: 560, display: "flex", flexDirection: "column", gap: 14 }}>
        {NOTIFS.map((m, i) => {
          const p = useMola(4 + i * 6, { damping: 12, mass: 0.5 });
          return (
            <div key={m} style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 20px", borderRadius: 20, background: "rgba(255,255,255,0.14)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.25)", ...TXT(26, 600, "#fff"), opacity: Math.min(1, p * 1.5) * (i < NOTIFS.length - 6 ? 1 - entre(f, 40 + i * 6, 50 + i * 6) : 1), transform: `translateX(${(1 - p) * 300}px)` }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>💬</div>{m}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 120, top: 150, ...pop2(useMola(8)) }}>
        <div style={{ ...MONO, ...TXT(26, 700, "#ff6b6b") }}>MENSAGENS SEM RESPOSTA</div>
        <div style={{ ...TXT(180, 800, "#fff"), textShadow: "0 0 60px #ff3b3b" }}>{n}</div>
      </div>
      {f > qp ? <Soco de={qp} texto="não para." tam={130} top={760} left={120} cor="#fff" /> : null}
    </Corte>
  );
};
const pop2 = (p: number): React.CSSProperties => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 40}px)` });

// 2 · Aponta pro QR da mesa... e o prato ganha vida
const K2: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qLock = em(de, 10.2), qVida = em(de, 11.2);
  const trava = entre(f, qLock - 30, qLock);
  const cx = 905, cy = 610, W = interpolate(trava, [0, 1], [1300, 300]), H = interpolate(trava, [0, 1], [760, 300]);
  const holo = f >= qVida;
  const hp = entre(f, qVida, qVida + 20);
  const rotulo = useMola(qVida + 16);
  return (
    <AbsoluteFill>
      {!holo ? (
        <Corte d={qVida + 4}>
          <Filme src="cinema/qr.mp4" d={qVida} zoom={[1.02, 1.12]} vel={0.9} />
          <Cantos x={cx - W / 2} y={cy - H / 2} w={W} h={H} cor={trava >= 1 ? VERDE : CIANO} />
          <div style={{ position: "absolute", left: cx - W / 2, width: W, top: cy - H / 2 + ((f * 9) % H), height: 3, background: CIANO, boxShadow: `0 0 20px ${CIANO}`, opacity: trava < 1 ? 0.9 : 0 }} />
          <div style={{ position: "absolute", left: cx - W / 2, top: cy + H / 2 + 20, ...MONO, ...TXT(24, 700, trava >= 1 ? VERDE : CIANO) }}>{trava >= 1 ? "✓ QR DETECTADO · MESA 4 · CARDÁPIO 3D" : `ESCANEANDO… ${Math.round(trava * 100)}%`}</div>
        </Corte>
      ) : (
        <Sequence from={qVida} layout="none">
          <Corte d={d - qVida}>
            <Filme src="cinema/holo.mp4" d={d - qVida} zoom={[1.0, 1.1]} vel={0.85} grade="saturate(1.5) contrast(1.15)" />
            {new Array(24).fill(0).map((_, i) => {
              const a = (i / 24) * Math.PI * 2 + f / 40;
              const r = 260 + Math.sin(f / 10 + i) * 30;
              return <div key={i} style={{ position: "absolute", left: 960 + Math.cos(a) * r * 1.4, top: 430 + Math.sin(a) * r * 0.5, width: 6, height: 6, borderRadius: 3, background: i % 2 ? CIANO : MAGENTA, boxShadow: `0 0 12px ${i % 2 ? CIANO : MAGENTA}`, opacity: hp }} />;
            })}
            <div style={{ position: "absolute", left: 1360, top: 250, ...pop2(rotulo) }}>
              <div style={{ ...MONO, ...TXT(22, 700, CIANO) }}>CARDÁPIO 3D</div>
              <div style={{ ...TXT(52, 700, "#fff") }}>Pizza calabresa</div>
              <div style={{ height: 3, width: 260, background: `linear-gradient(90deg, ${CIANO}, ${MAGENTA})`, marginTop: 10 }} />
            </div>
          </Corte>
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

// 3 · Toca em pedir. A IA anota tudo no WhatsApp, na hora.
const K3: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qt = em(de, 15.7), qi = em(de, 17.4), qh = em(de, 20.3);
  const toque = entre(f, qt, qt + 14);
  const chat = useMola(qi + 10, { damping: 14, mass: 0.7 });
  const ok = useMola(qh, { damping: 9, mass: 0.5 });
  return (
    <Corte d={d}>
      <Filme src="cinema/salao.mp4" d={d} desfoque={14} grade="saturate(1.2) brightness(0.55)" zoom={[1.2, 1.25]} />
      {/* celular de vidro com o prato real */}
      <div style={{ position: "absolute", left: 300, top: 120, width: 400, height: 820, borderRadius: 56, background: "rgba(10,14,30,0.75)", border: "2px solid rgba(255,255,255,0.25)", boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 80px ${CIANO}33`, overflow: "hidden", transform: `rotate(-4deg) translateY(${(1 - entre(f, 0, 14)) * 200}px)` }}>
        <div style={{ position: "absolute", top: 60, width: "100%", textAlign: "center", ...MONO, ...TXT(20, 700, MAGENTA) }}>MESA 4 · CARDÁPIO 3D</div>
        <div style={{ position: "absolute", top: 120, left: 0, width: 400, height: 300, WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 55%, transparent 100%)", maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 55%, transparent 100%)" }}>
          <Loop durationInFrames={190} layout="none"><OffthreadVideo src={staticFile("vendas/reais/pizza.mp4")} muted playbackRate={0.8} style={{ width: 400, height: 300, objectFit: "cover" }} /></Loop>
        </div>
        <div style={{ position: "absolute", top: 450, width: "100%", textAlign: "center", ...TXT(34, 700, "#fff") }}>Pizza calabresa</div>
        <div style={{ position: "absolute", bottom: 60, left: 36, right: 36, padding: "22px 0", borderRadius: 22, background: "#25d366", textAlign: "center", ...TXT(28, 700, "#fff"), transform: `scale(${toque > 0 && toque < 0.5 ? 0.92 : 1})`, boxShadow: `0 0 ${30 + toque * 40}px #25d366` }}>Pedir pelo WhatsApp</div>
        <div style={{ position: "absolute", left: 200 - 90, bottom: 40, width: 180, height: 180, borderRadius: 90, border: "4px solid #fff", opacity: toque > 0 ? 1 - toque : 0, transform: `scale(${0.3 + toque * 1.6})` }} />
      </div>
      {/* mensagens voando com rastro de luz */}
      {[0, 1, 2].map((k) => {
        const p = entre(f, qi + k * 5, qi + k * 5 + 22);
        const x = interpolate(p, [0, 1], [640, 1180]), y = interpolate(p, [0, 1], [560 - k * 40, 300 + k * 120]);
        return (
          <React.Fragment key={k}>
            <div style={{ position: "absolute", left: 640, top: 560 - k * 40, width: Math.max(0, x - 640), height: 3, background: `linear-gradient(90deg, transparent, ${k % 2 ? MAGENTA : CIANO})`, transformOrigin: "left", transform: `rotate(${Math.atan2(y - (560 - k * 40), x - 640) * 57.3}deg)`, opacity: p > 0 && p < 1 ? 1 : 0, boxShadow: `0 0 16px ${CIANO}` }} />
            <div style={{ position: "absolute", left: x, top: y, width: 26, height: 26, borderRadius: 13, background: k % 2 ? MAGENTA : CIANO, boxShadow: `0 0 30px ${k % 2 ? MAGENTA : CIANO}`, opacity: p > 0 && p < 1 ? 1 : 0 }} />
          </React.Fragment>
        );
      })}
      {/* conversa com a IA */}
      <div style={{ position: "absolute", left: 1080, top: 170, width: 700, padding: 34, borderRadius: 34, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", border: "1.5px solid rgba(255,255,255,0.28)", opacity: Math.min(1, chat * 1.4), transform: `translateX(${(1 - chat) * 200}px)` }}>
        <div style={{ ...MONO, ...TXT(22, 700, VERDE) }}>● IA DA NEXOR · WHATSAPP</div>
        <div style={{ marginTop: 22, padding: "18px 22px", borderRadius: 20, borderBottomRightRadius: 4, background: "#d9fdd3", ...TXT(26, 500, "#0b1733"), marginLeft: 80 }}>1 pizza calabresa grande e 1 suco, mesa 4 🍕</div>
        <div style={{ marginTop: 16, padding: "18px 22px", borderRadius: 20, borderBottomLeftRadius: 4, background: "#fff", ...TXT(26, 500, "#0b1733"), marginRight: 60, opacity: entre(f, qi + 40, qi + 50) }}>Anotado! Pedido #127 já está na cozinha 😊</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 26, ...pop2(ok) }}>
          <div style={{ width: 60, height: 60, borderRadius: 30, background: VERDE, display: "flex", alignItems: "center", justifyContent: "center", ...TXT(34, 800, "#00281a"), boxShadow: `0 0 40px ${VERDE}` }}>✓</div>
          <div style={TXT(34, 700, "#fff")}>Anotado na hora</div>
        </div>
      </div>
    </Corte>
  );
};

// 4 · Na cozinha, o pedido chega pronto. Sem erro. Sem espera.
const K4: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qc = em(de, 22.2), qe = em(de, 24.5), qs = em(de, 25.6);
  const tk = entre(f, qc, qc + 40);
  return (
    <Corte d={d}>
      <Filme src="cinema/macro.mp4" d={d} zoom={[1.18, 1.3]} x={[30, -30]} vel={0.6} desde={40} grade="saturate(1.6) contrast(1.2) sepia(0.25) brightness(0.9)" />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 70% 100%, rgba(255,120,30,0.45), transparent 60%)", mixBlendMode: "screen" }} />
      {/* comanda impressa */}
      <div style={{ position: "absolute", left: 160, top: 64 }}>
        <div style={{ width: 420, height: 46, borderRadius: "0 0 12px 12px", background: "#111827", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }} />
        <div style={{ margin: "0 26px", height: interpolate(tk, [0, 1], [0, 470]), overflow: "hidden", background: "#fbfbf6", padding: "0 26px", boxShadow: "0 30px 60px rgba(0,0,0,0.5)", transform: `rotate(${Math.sin(f / 20) * 1.2}deg)` }}>
          <div style={{ ...MONO, ...TXT(32, 800, "#111"), textAlign: "center", marginTop: 26 }}>PEDIDO #127</div>
          <div style={{ ...MONO, ...TXT(20, 600, "#555"), textAlign: "center", marginTop: 6 }}>MESA 4 · VIA WHATSAPP</div>
          <div style={{ borderTop: "3px dashed #bbb", margin: "20px 0" }} />
          {["1x PIZZA CALABRESA G", "1x SUCO DE LARANJA"].map((x) => <div key={x} style={{ ...MONO, ...TXT(24, 700, "#111"), marginTop: 12 }}>{x}</div>)}
          <div style={{ borderTop: "3px dashed #bbb", margin: "20px 0" }} />
          <div style={{ ...MONO, ...TXT(22, 800, "#0a8a4a"), textAlign: "center" }}>ANOTADO PELA IA ✓</div>
        </div>
      </div>
      {f >= qe ? <Soco de={qe} texto="Sem erro." tam={150} top={330} left={760} /> : null}
      {f >= qs ? <Soco de={qs} texto="Sem espera." tam={150} top={520} left={760} cor={LARANJA} /> : null}
    </Corte>
  );
};

// 5 · E você? Só acompanha a casa cheia.
const K5: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qg = em(de, 28.5);
  const linha = entre(f, qg, qg + 40);
  const pts = [0, 18, 12, 34, 30, 52, 48, 70, 66, 92];
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${i * 60} ${200 - v * 2}`).join(" ");
  const painel = useMola(6, { damping: 14, mass: 0.7 });
  const n = Math.round(interpolate(f, [qg, qg + 40], [96, 148], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <Corte d={d}>
      <Filme src="cinema/salao.mp4" d={d} zoom={[1.0, 1.08]} x={[-30, 20]} vel={0.8} desde={60} />
      <div style={{ position: "absolute", right: 120, top: 150, width: 640, padding: 36, borderRadius: 34, background: "rgba(8,14,30,0.55)", backdropFilter: "blur(18px)", border: `1.5px solid ${CIANO}66`, boxShadow: `0 0 60px ${CIANO}33`, opacity: Math.min(1, painel * 1.4), transform: `translateY(${(1 - painel) * 60}px)` }}>
        <div style={{ ...MONO, ...TXT(22, 700, CIANO) }}>HOJE · AO VIVO</div>
        <div style={{ display: "flex", gap: 40, marginTop: 14 }}>
          <div><div style={TXT(84, 800, "#fff")}>{n}</div><div style={TXT(24, 500, "#a5b4cc")}>pedidos</div></div>
          <div><div style={TXT(84, 800, VERDE)}>3s</div><div style={TXT(24, 500, "#a5b4cc")}>para responder</div></div>
        </div>
        <svg width="560" height="210" style={{ marginTop: 18, overflow: "visible" }}>
          <path d={path} fill="none" stroke={CIANO} strokeWidth={5} strokeDasharray={1000} strokeDashoffset={1000 * (1 - linha)} style={{ filter: `drop-shadow(0 0 10px ${CIANO})` }} />
        </svg>
      </div>
      <div style={{ position: "absolute", left: 120, top: 720, ...pop2(useMola(qg + 6)) }}>
        <div style={{ ...TXT(96, 800, "#fff"), textShadow: "0 8px 40px rgba(0,0,0,0.7)" }}><Rico texto="Casa *cheia*." /></div>
      </div>
    </Corte>
  );
};

// 6 · Nexor Atende e Cardápio 3D. Teste grátis por trinta dias.
const PRATOS = ["pizza", "burger", "suco", "bolo"];
const K6: React.FC<P> = ({ d, de }) => {
  const f = useCurrentFrame();
  const qt = em(de, 33.0);
  const t = useMola(4, { damping: 13, mass: 0.7 });
  const cta = useMola(qt, { damping: 11, mass: 0.6 });
  return (
    <Corte d={d}>
      <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 50% 40%, #13265a, #04060f 70%)` }} />
      <AbsoluteFill style={{ background: `conic-gradient(from ${f * 1.5}deg at 50% 45%, ${CIANO}22, transparent 25%, ${MAGENTA}22, transparent 60%, ${CIANO}22)`, mixBlendMode: "screen" }} />
      {PRATOS.map((p, i) => {
        const a = (i / PRATOS.length) * Math.PI * 2 + f / 60;
        const x = 960 + Math.cos(a) * 560, y = 470 + Math.sin(a) * 150, z = (Math.sin(a) + 1) / 2;
        return (
          <div key={p} style={{ position: "absolute", left: x - 170, top: y - 120, width: 340, height: 240, borderRadius: 30, overflow: "hidden", border: "1.5px solid rgba(255,255,255,0.25)", boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 40px ${i % 2 ? MAGENTA : CIANO}44`, transform: `scale(${0.7 + z * 0.45})`, zIndex: Math.round(z * 10), opacity: 0.55 + z * 0.45 }}>
            <Loop durationInFrames={190} layout="none"><OffthreadVideo src={staticFile(`vendas/reais/${p}.mp4`)} muted playbackRate={0.8} style={{ width: 340, height: 240, objectFit: "cover" }} /></Loop>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", zIndex: 20, ...pop2(t) }}>
        <div style={{ ...TXT(90, 800, "#fff"), letterSpacing: "-0.02em" }}><Rico texto="Nexor *Atende* + *Cardápio* *3D*" /></div>
      </div>
      <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 26, zIndex: 20, opacity: Math.min(1, cta * 1.4), transform: `scale(${0.8 + 0.2 * cta})` }}>
        <div style={{ padding: "26px 56px", borderRadius: 999, background: `linear-gradient(135deg, ${CIANO}, #3b82f6)`, ...TXT(44, 800, "#001018"), boxShadow: `0 0 ${50 + Math.sin(f / 5) * 20}px ${CIANO}` }}>Teste grátis por 30 dias</div>
        <div style={{ padding: "26px 44px", borderRadius: 999, border: "2px solid #25d366", background: "rgba(37,211,102,0.15)", ...TXT(40, 700, "#dcfce7") }}>💬 (34) 99733-7499</div>
      </div>
    </Corte>
  );
};

// 7 · Nexor. IA com cuidado humano.
const K7: React.FC<P> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(6, { damping: 16, mass: 1 });
  const riscos = entre(f, 0, 26);
  return (
    <AbsoluteFill style={{ background: "#02040b", justifyContent: "center", alignItems: "center" }}>
      {new Array(9).fill(0).map((_, i) => <div key={i} style={{ position: "absolute", top: 300 + i * 55, left: interpolate(riscos, [0, 1], [-1400, 2200]) - i * 140, width: 900, height: 2, background: `linear-gradient(90deg, transparent, ${i % 2 ? MAGENTA : CIANO}, transparent)`, boxShadow: `0 0 20px ${CIANO}` }} />)}
      <div style={{ position: "absolute", width: 1000, height: 1000, borderRadius: "50%", background: `radial-gradient(circle, ${CIANO}33, transparent 60%)`, transform: `scale(${a})` }} />
      <Img src={staticFile("logo-lockup.webp")} style={{ width: 720, opacity: a, transform: `scale(${0.92 + a * 0.08})`, filter: `drop-shadow(0 0 ${30 * a}px ${CIANO}88)` }} />
      <div style={{ ...TXT(54, 600, "#fff"), marginTop: 46, ...pop2(useMola(22)) }}>IA com <Rico texto="*cuidado* *humano*" /></div>
      <AbsoluteFill style={{ background: "#000", opacity: entre(f, d - 16, d) }} />
    </AbsoluteFill>
  );
};

/* ---------- vídeo ---------- */
const CENAS = [K0, K1, K2, K3, K4, K5, K6, K7];
export const VideoCinema: React.FC = () => {
  const total = duracaoCinema;
  const fr = TEMPOS.frases;
  const ini = fr.map((x, i) => (i === 0 ? 0 : quadro((fr[i - 1][1] + x[0]) / 2)));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {CENAS.map((C, i) => {
        const de = ini[i];
        const d = (i + 1 < ini.length ? ini[i + 1] : total) - de;
        return <Sequence key={i} from={de} durationInFrames={d} layout="none"><C d={d} de={de} /></Sequence>;
      })}
      <Pelicula />
      <Legenda />
      {/* som: trilha, voz e efeitos nas palavras */}
      <Audio src={staticFile("cinema/trilha.wav")} volume={(q) => interpolate(q, [0, 20, total - 50, total], [0, 0.3, 0.3, 0], { extrapolateRight: "clamp" })} />
      <Sequence from={quadro(0)} layout="none"><Audio src={staticFile("cinema/locucao.mp3")} /></Sequence>
      {ini.slice(1, 7).map((q, i) => <Sfx key={i} de={q - 4} som="whoosh" vol={0.35} />)}
      {[0, 1, 2, 3, 4].map((k) => <Sfx key={`n${k}`} de={ini[1] + 6 + k * 9} som="notifica" vol={0.22} />)}
      <Sfx de={quadro(8.6)} som="scan" vol={0.35} />
      <Sfx de={quadro(11.2)} som="impacto" vol={0.5} />
      <Sfx de={quadro(15.7)} som="toque" vol={0.6} />
      <Sfx de={quadro(20.3)} som="notifica" vol={0.4} />
      <Sfx de={quadro(22.2)} som="impressora" vol={0.3} />
      <Sfx de={quadro(24.5)} som="impacto" vol={0.32} />
      <Sfx de={quadro(25.6)} som="impacto" vol={0.32} />
      <Sfx de={ini[7] - 60} som="subida" vol={0.35} />
      <Sfx de={ini[7]} som="impacto" vol={0.55} />
    </AbsoluteFill>
  );
};
