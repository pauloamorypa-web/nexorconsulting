/* Vídeo institucional da Nexor (16:9, 1920×1080). Tudo animado, telas reais dos produtos.
   Uma cena por frase da locução; as cenas trocam nas pausas reais (src/tempos/institucional.ts).
   Roteiro: marketing/videos/roteiros/00-institucional-2026.md */
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ATRASO } from "./VideoProduto";
import { COR, FPS, GRAD, GRAD_BOTAO, VERDE, VIDRO, TXT, Rico, Check, Contador, Orbe, Palavras, entre, pop, quadro, saida, useMola, useVoz, Voz } from "./kit";
import TEMPOS from "./tempos/institucional";
import FALAS from "./tempos/institucional.frases.json";

const PASTA = "institucional";
const CAUDA = 3.2;
export const duracaoInstitucional = Math.round((ATRASO + TEMPOS.frases[TEMPOS.frases.length - 1][1] + CAUDA) * FPS);

/* ---------- peças ---------- */
const Cena: React.FC<{ d: number; children: React.ReactNode }> = ({ d, children }) => {
  const f = useCurrentFrame();
  const op = Math.min(entre(f, 0, 10), saida(f, d));
  return <AbsoluteFill style={{ opacity: op, justifyContent: "center", alignItems: "center" }}>{children}</AbsoluteFill>;
};

const Titulo: React.FC<{ texto: string; tam?: number; atraso?: number; passo?: number; estilo?: React.CSSProperties }> = ({ texto, tam = 96, atraso = 0, passo = 5, estilo }) => (
  <Palavras texto={texto} atraso={atraso} passo={passo} estilo={{ ...TXT(tam), letterSpacing: "-0.025em", lineHeight: 1.06, textAlign: "center", ...estilo }} />
);

/* Fundo cinematográfico: névoa azul que respira com a voz, grade de pontos e luz que varre */
const Fundo: React.FC<{ voz: Voz }> = ({ voz }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: COR.navy }}>
      <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at ${70 + Math.sin(f / 90) * 10}% ${20 + Math.cos(f / 110) * 8}%, #143a7c 0%, #07122b 50%, transparent 85%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(900px 700px at ${15 + Math.cos(f / 80) * 8}% ${85 + Math.sin(f / 70) * 6}%, rgba(0,225,251,${0.1 + voz.energia * 0.1}), transparent 65%)` }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(120,170,255,0.09) 1.5px, transparent 1.5px)", backgroundSize: "48px 48px", backgroundPosition: `${(f * 0.3) % 48}px ${(f * 0.5) % 48}px` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

/* Partículas que sobem devagar (profundidade) */
const Poeira: React.FC<{ n?: number; cor?: string }> = ({ n = 40, cor = COR.ciano }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      {new Array(n).fill(0).map((_, i) => {
        const x = (i * 197) % 1920;
        const vel = 0.4 + ((i * 37) % 10) / 10;
        const y = 1080 - ((f * vel + i * 83) % 1200);
        const t = 2 + ((i * 13) % 5);
        return <div key={i} style={{ position: "absolute", left: x + Math.sin(f / 40 + i) * 20, top: y, width: t, height: t, borderRadius: t, background: cor, opacity: 0.15 + ((i * 7) % 5) / 12, boxShadow: `0 0 ${t * 4}px ${cor}` }} />;
      })}
    </AbsoluteFill>
  );
};

/* Tela de sistema numa janela de navegador, com zoom lento */
const Janela: React.FC<{ src: string; largura?: number; rot?: number; zoom?: [number, number]; d: number; foco?: string }> = ({ src, largura = 1240, rot = 0, zoom = [1, 1.08], d, foco = "50% 40%" }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, d], zoom, { extrapolateRight: "clamp" });
  return (
    <div style={{ width: largura, borderRadius: 22, overflow: "hidden", background: "#0b1430", boxShadow: "0 50px 120px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(120,170,255,0.25)", transform: `perspective(2200px) rotateY(${rot}deg)` }}>
      <div style={{ height: 40, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "#101c3d" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ marginLeft: 18, flex: 1, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.07)" }} />
      </div>
      <div style={{ width: "100%", aspectRatio: "1.6", overflow: "hidden" }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, transformOrigin: foco }} />
      </div>
    </div>
  );
};

/* ---------- cenas ---------- */

// 1 · O sonho e a rotina
const C1: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const luz = entre(f, 0, 60);
  const sombra = entre(f, d * 0.45, d * 0.9);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", width: 900, height: 900, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,200,120,${0.28 * luz * (1 - sombra * 0.7)}), transparent 60%)`, transform: `scale(${0.6 + luz * 0.5})` }} />
      <Poeira n={30} cor="#ffd59a" />
      <div style={{ textAlign: "center" }}>
        <div style={{ ...TXT(44, 500, COR.suave), opacity: luz, letterSpacing: "0.3em", textTransform: "uppercase" }}>toda empresa começa com um</div>
        <div style={{ ...TXT(230, 700), marginTop: 10, letterSpacing: "-0.04em", background: "linear-gradient(90deg,#ffe2b0,#fff,#ffd59a)", WebkitBackgroundClip: "text", color: "transparent", opacity: luz * (1 - sombra * 0.75), filter: `blur(${sombra * 6}px)`, transform: `scale(${1 + f / d / 12})` }}>sonho</div>
        <div style={{ ...TXT(56, 600), marginTop: 30, opacity: sombra }}>…e a rotina toma conta do dia.</div>
      </div>
    </Cena>
  );
};

// 2 · O caos da rotina
const Caos: React.FC<{ x: number; y: number; atraso: number; children: React.ReactNode; giro: number }> = ({ x, y, atraso, children, giro }) => {
  const f = useCurrentFrame();
  const p = useMola(atraso, { damping: 10, mass: 0.6 });
  const tremor = Math.sin(f / 2 + atraso) * 3 * p;
  return <div style={{ position: "absolute", left: x, top: y, transform: `translate(${tremor}px, ${Math.sin(f / 25 + atraso) * 12}px) rotate(${giro + Math.sin(f / 30 + atraso) * 2}deg) scale(${p})`, opacity: p }}>{children}</div>;
};
const C2: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const passo = d / 5;
  const ponteiro = f * 9;
  const card = (titulo: string, corpo: React.ReactNode, cor = "#ef4444") => (
    <div style={{ ...VIDRO, padding: "26px 32px", minWidth: 380, borderColor: `${cor}88` }}>
      <div style={{ ...TXT(26, 600, cor), letterSpacing: "0.12em", textTransform: "uppercase" }}>{titulo}</div>
      <div style={{ marginTop: 12 }}>{corpo}</div>
    </div>
  );
  return (
    <Cena d={d}>
      <Caos x={140} y={170} atraso={0} giro={-4}>
        {card("WhatsApp", <div style={{ display: "flex", alignItems: "center", gap: 18 }}><div style={{ width: 92, height: 92, borderRadius: 46, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50 }}>💬</div><div style={{ ...TXT(84, 700) }}><Contador q0={0} q1={passo} ate={47} /></div><div style={{ ...TXT(30, 500, COR.suave) }}>sem<br />resposta</div></div>)}
      </Caos>
      <Caos x={1180} y={140} atraso={Math.round(passo)} giro={5}>
        {card("Planilha", <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 80px)", gap: 6 }}>{new Array(12).fill(0).map((_, i) => <div key={i} style={{ height: 34, borderRadius: 6, background: i % 5 === 2 ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.1)", ...TXT(20, 600, "#fff"), display: "flex", alignItems: "center", justifyContent: "center" }}>{i % 5 === 2 ? "#ERRO" : ""}</div>)}</div>)}
      </Caos>
      <Caos x={260} y={600} atraso={Math.round(passo * 2)} giro={3}>
        {card("Agenda", <div style={{ ...TXT(34, 500, COR.gelo), lineHeight: 1.5, fontStyle: "italic", textDecoration: "line-through", textDecorationColor: "#ef4444" }}>14h · cliente?<br />15h · ligar…<br />16h · ???</div>, "#f59e0b")}
      </Caos>
      <Caos x={1220} y={600} atraso={Math.round(passo * 3)} giro={-3}>
        {card("O dono", <div style={{ display: "flex", alignItems: "center", gap: 24 }}><div style={{ position: "relative", width: 110, height: 110, borderRadius: 55, border: "5px solid #fff" }}><div style={{ position: "absolute", left: 52, top: 14, width: 5, height: 44, background: "#fff", transformOrigin: "50% 100%", transform: `rotate(${ponteiro}deg)` }} /><div style={{ position: "absolute", left: 52, top: 28, width: 5, height: 30, background: COR.ciano, transformOrigin: "50% 100%", transform: `rotate(${ponteiro / 12}deg)` }} /></div><div style={{ ...TXT(36, 600) }}>não para<br />nunca</div></div>, "#f59e0b")}
      </Caos>
      <div style={{ ...TXT(70, 700), opacity: entre(f, passo * 3.6, passo * 4.2), textAlign: "center" }}>Isso cansa.</div>
    </Cena>
  );
};

// 3 · Nasce a Nexor
const C3: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(4, { damping: 12, mass: 0.9 });
  const b = useMola(26);
  const brilho = interpolate(f, [0, 18, 50], [0, 1, 0.35], { extrapolateRight: "clamp" });
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", width: 1600, height: 6, background: GRAD, opacity: brilho, filter: "blur(4px)", transform: `scaleX(${entre(f, 0, 22)})` }} />
      <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,225,251,0.35), transparent 65%)", opacity: brilho, transform: `scale(${0.5 + a * 0.7})` }} />
      <Poeira n={50} />
      <div style={{ textAlign: "center" }}>
        <Img src={staticFile("logo-mark.webp")} style={{ width: 230, height: 230, borderRadius: 50, transform: `scale(${a}) rotate(${(1 - a) * -30}deg)`, boxShadow: `0 0 ${60 + brilho * 80}px rgba(0,225,251,0.55)` }} />
        <div style={{ ...TXT(118, 700), marginTop: 50, letterSpacing: "-0.03em", ...pop(b) }}>Nexor <Rico texto="*Consulting*" /></div>
        <div style={{ ...TXT(40, 500, COR.suave), marginTop: 18, ...pop(useMola(40)) }}>nasceu pensando em você</div>
      </div>
    </Cena>
  );
};

// 4 · Tecnologia trabalha, pessoas cuidam
const C4: React.FC<{ d: number; voz: Voz }> = ({ d, voz }) => {
  const f = useCurrentFrame();
  const l = useMola(Math.round(d * 0.3));
  const r = useMola(Math.round(d * 0.62));
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 150, ...TXT(46, 500, COR.suave), opacity: entre(f, 0, 15) }}>Uma ideia simples</div>
      <div style={{ display: "flex", gap: 120, alignItems: "center" }}>
        <div style={{ textAlign: "center", ...pop(l, 60) }}>
          <Orbe tam={300} energia={voz.energia} icone="⚙️" />
          <div style={{ ...TXT(66, 700), marginTop: 50 }}>A tecnologia <Rico texto="*trabalha*" /></div>
        </div>
        <div style={{ width: 2, height: 420, background: "linear-gradient(transparent, rgba(120,170,255,0.5), transparent)", opacity: r }} />
        <div style={{ textAlign: "center", ...pop(r, 60) }}>
          <div style={{ width: 300, height: 300, borderRadius: "50%", margin: "0 auto", background: "radial-gradient(circle at 35% 30%, #3a2a5e, #120a2b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 140, boxShadow: `0 0 ${60 + Math.sin(f / 8) * 20}px rgba(255,120,160,0.45)`, transform: `scale(${1 + Math.sin(f / 7) * 0.03})` }}>🤝</div>
          <div style={{ ...TXT(66, 700), marginTop: 50 }}>As pessoas <span style={{ color: "#ff9fbf" }}>cuidam</span></div>
        </div>
      </div>
    </Cena>
  );
};

// 5 · IA com cuidado humano
const C5: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(2, { damping: 14, mass: 1 });
  const linha = entre(f, 20, 50);
  return (
    <Cena d={d}>
      <Poeira n={60} />
      <div style={{ position: "absolute", width: 1300, height: 1300, borderRadius: "50%", border: "2px solid rgba(0,225,251,0.18)", transform: `scale(${0.4 + a * 0.6}) rotate(${f / 4}deg)` }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ ...TXT(40, 500, COR.suave), letterSpacing: "0.3em", textTransform: "uppercase", opacity: entre(f, 0, 14) }}>o nosso fundamento</div>
        <div style={{ ...TXT(150, 700), marginTop: 26, letterSpacing: "-0.035em", transform: `scale(${0.9 + a * 0.1})`, opacity: a }}>
          IA com <Rico texto="*cuidado*" /> <Rico texto="*humano*" />
        </div>
        <div style={{ height: 6, width: 900, margin: "34px auto 0", borderRadius: 3, background: GRAD, transform: `scaleX(${linha})`, boxShadow: "0 0 30px rgba(0,225,251,0.7)" }} />
      </div>
    </Cena>
  );
};

// 6 · A IA faz o trabalho pesado, 24 h
const TAREFAS = [
  { t: "Atende o cliente", i: "💬", n: "128 conversas" },
  { t: "Organiza a equipe", i: "👥", n: "32 pontos batidos" },
  { t: "Lê documentos", i: "📄", n: "54 notas lidas" },
  { t: "Cobra no dia certo", i: "📅", n: "19 lembretes" },
];
const C6: React.FC<{ d: number; voz: Voz }> = ({ d, voz }) => {
  const f = useCurrentFrame();
  const hora = Math.floor(interpolate(f, [0, d], [8, 32])) % 24;
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 160, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Orbe tam={360} energia={voz.energia} icone="🧠" />
        <div style={{ ...TXT(96, 700), marginTop: 46, fontVariantNumeric: "tabular-nums" }}>{String(hora).padStart(2, "0")}:{String(Math.floor((f * 7) % 60)).padStart(2, "0")}</div>
        <div style={{ ...TXT(36, 500, COR.suave) }}>trabalhando 24 horas por dia</div>
      </div>
      <div style={{ position: "absolute", right: 150, display: "flex", flexDirection: "column", gap: 26, width: 860 }}>
        {TAREFAS.map((x, i) => {
          const de = Math.round(d * (0.22 + i * 0.15));
          return (
            <Linha key={x.t} de={de}>
              <div style={{ fontSize: 60, width: 90 }}>{x.i}</div>
              <div style={{ flex: 1 }}>
                <div style={{ ...TXT(46, 700) }}>{x.t}</div>
                <div style={{ ...TXT(28, 500, COR.suave), marginTop: 6 }}>{x.n}</div>
              </div>
              <Check atraso={de + 16} tam={78} />
            </Linha>
          );
        })}
      </div>
    </Cena>
  );
};
const Linha: React.FC<{ de: number; children: React.ReactNode }> = ({ de, children }) => {
  const p = useMola(de);
  return <div style={{ ...VIDRO, borderRadius: 26, padding: "26px 34px", display: "flex", alignItems: "center", gap: 24, opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * 120}px)` }}>{children}</div>;
};

// 7 · Os sistemas, com telas reais
const PRODUTOS = [
  { nome: "Atende IA", sub: "no WhatsApp", img: "institucional/atende.webp", foco: "40% 30%" },
  { nome: "RH e Ponto", sub: "no celular", img: "institucional/rh.webp", foco: "50% 30%" },
  { nome: "Contábil", sub: "para o escritório", img: "institucional/contabil.webp", foco: "60% 30%" },
  { nome: "Barber", sub: "para a barbearia", img: "institucional/barber.webp", foco: "40% 30%" },
  { nome: "Agente", sub: "para o dono", img: "institucional/agente.webp", foco: "50% 35%" },
  { nome: "Elo", sub: "liga a loja ao instalador", img: "institucional/elo.webp", foco: "50% 30%" },
];
/* Segundos da locução em que cada produto é dito (pausas medidas com silencedetect) */
const MARCOS = [42.95, 45.0, 47.15, 48.95, 50.75, 52.35];
const C7: React.FC<{ d: number; inicio: number }> = ({ d, inicio }) => {
  const f = useCurrentFrame();
  const marcos = MARCOS.map((s) => quadro(s) - inicio - 4);
  const intro = marcos[0];
  const atual = Math.max(0, marcos.filter((m) => f >= m).length - 1);
  return (
    <Cena d={d}>
      {f < intro + 8 ? (
        <div style={{ opacity: 1 - entre(f, intro - 2, intro + 8) }}>
          <Titulo texto="Sistemas prontos para *cada* *negócio*" tam={100} />
        </div>
      ) : null}
      {PRODUTOS.map((p, i) => {
        const de = marcos[i];
        const slot = (i + 1 < marcos.length ? marcos[i + 1] : d) - de;
        if (f < de - 2 || f > de + slot + 12) return null;
        const l = f - de;
        const ent = entre(l, 0, 16);
        const sai = 1 - entre(l, slot - 4, slot + 10);
        return (
          <AbsoluteFill key={p.nome} style={{ justifyContent: "center", alignItems: "center", opacity: Math.min(ent, sai) }}>
            <div style={{ transform: `translateX(${(1 - ent) * 220 - (1 - sai) * 220}px) translateX(310px) translateY(30px)` }}>
              <Janela src={p.img} largura={1100} rot={-8} d={slot + 12} foco={p.foco} zoom={[1.02, 1.12]} />
            </div>
            <div style={{ position: "absolute", left: 120, top: 390, transform: `translateY(${(1 - ent) * 40}px)` }}>
              <div style={{ ...TXT(28, 600, COR.ciano), letterSpacing: "0.2em" }}>NEXOR</div>
              <div style={{ ...TXT(92, 700), letterSpacing: "-0.03em", whiteSpace: "nowrap", textShadow: "0 10px 40px rgba(0,0,0,0.6)" }}>{p.nome}</div>
              <div style={{ ...TXT(40, 500, COR.suave), marginTop: 6 }}>{p.sub}</div>
            </div>
          </AbsoluteFill>
        );
      })}
      {f >= intro ? (
        <div style={{ position: "absolute", bottom: 150, display: "flex", gap: 14 }}>
          {PRODUTOS.map((p, i) => <div key={p.nome} style={{ width: i === atual ? 60 : 16, height: 16, borderRadius: 8, background: i === atual ? GRAD : "rgba(255,255,255,0.25)" }} />)}
        </div>
      ) : null}
    </Cena>
  );
};

// 8 · Ecossistema e sob medida
const NOS = ["Atende IA", "RH e Ponto", "Contábil", "Barber", "Agente", "Elo"];
const C8: React.FC<{ d: number; voz: Voz }> = ({ d, voz }) => {
  const f = useCurrentFrame();
  const meio = Math.round(d * 0.55);
  const rede = 1 - entre(f, meio - 6, meio + 10);
  const cx = 960, cy = 520, R = 340;
  const pos = NOS.map((_, i) => {
    const a = (i / NOS.length) * Math.PI * 2 - Math.PI / 2 + f / 400;
    return { x: cx + Math.cos(a) * R * 1.35, y: cy + Math.sin(a) * R };
  });
  const sm = useMola(meio + 4);
  const molasNos = NOS.map((_, i) => useMolaFixa(i * 4));
  const molasBlocos = [0, 1, 2].map((i) => useMolaFixa(meio + 8 + i * 7));
  return (
    <Cena d={d}>
      <AbsoluteFill style={{ opacity: rede }}>
        <svg width={1920} height={1080} style={{ position: "absolute" }}>
          {pos.map((p, i) => pos.slice(i + 1).map((q, j) => {
            const k = entre(f, 6 + (i + j) * 3, 26 + (i + j) * 3);
            return <line key={`${i}-${j}`} x1={p.x} y1={p.y} x2={p.x + (q.x - p.x) * k} y2={p.y + (q.y - p.y) * k} stroke="rgba(0,225,251,0.35)" strokeWidth={2} />;
          }))}
          {pos.map((p, i) => {
            const t = ((f * 1.2 + i * 30) % 100) / 100;
            const q = pos[(i + 2) % pos.length];
            return <circle key={i} cx={p.x + (q.x - p.x) * t} cy={p.y + (q.y - p.y) * t} r={7} fill={COR.ciano} opacity={entre(f, 26, 36)} />;
          })}
        </svg>
        <div style={{ position: "absolute", left: cx - 110, top: cy - 110 }}><Orbe tam={220} energia={voz.energia} icone={<Img src={staticFile("logo-mark.webp")} style={{ width: 120, borderRadius: 26 }} />} /></div>
        {pos.map((p, i) => {
          const m = molasNos[i];
          return <div key={NOS[i]} style={{ position: "absolute", left: p.x, top: p.y, transform: `translate(-50%,-50%) scale(${m})`, ...VIDRO, borderRadius: 999, padding: "16px 30px", ...TXT(34, 600) }}>{NOS[i]}</div>;
        })}
        <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", ...TXT(54, 700), opacity: entre(f, 10, 24) }}>Todos <Rico texto="*conversam*" /> entre si</div>
      </AbsoluteFill>
      {f > meio - 6 ? (
        <div style={{ textAlign: "center", ...pop(sm, 60) }}>
          <div style={{ display: "flex", gap: 18, justifyContent: "center" }}>
            {[0, 1, 2].map((i) => {
              const m = molasBlocos[i];
              return <div key={i} style={{ width: 170, height: 170, borderRadius: 34, ...VIDRO, borderColor: i === 1 ? COR.ciano : undefined, transform: `translateY(${(1 - m) * -200}px) rotate(${(1 - m) * 30}deg)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>{["🧩", "✨", "🛠️"][i]}</div>;
            })}
          </div>
          <div style={{ ...TXT(104, 700), marginTop: 60, letterSpacing: "-0.03em" }}>Não existe pronto?</div>
          <div style={{ ...TXT(104, 700), letterSpacing: "-0.03em" }}>A gente cria <Rico texto="*sob* *medida*" /></div>
        </div>
      ) : null}
    </Cena>
  );
};
/* mola com atraso fixo, segura para usar em listas de tamanho fixo */
const useMolaFixa = (de: number) => useMola(de);

// 9 · Banca de teste de intrusão
const TESTES = ["Tentativas de invasão", "Acesso a dados de terceiros", "Senhas e permissões", "Falhas e travamentos"];
const C9: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const varre = (f % 70) / 70;
  const escudo = useMola(4, { damping: 10, mass: 0.8 });
  const aprovado = useMola(Math.round(d * 0.8), { damping: 9, mass: 0.6 });
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 200, top: 210, width: 560, height: 640, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={460} height={540} viewBox="0 0 100 118" style={{ transform: `scale(${escudo})`, filter: "drop-shadow(0 0 40px rgba(0,225,251,0.5))" }}>
          <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={COR.azul} /><stop offset="1" stopColor={COR.ciano} /></linearGradient></defs>
          <path d="M50 2 L94 18 V56 C94 86 74 106 50 116 C26 106 6 86 6 56 V18 Z" fill="rgba(0,88,250,0.18)" stroke="url(#g)" strokeWidth={3} />
          <rect x={8} y={8 + varre * 100} width={84} height={2.5} fill={COR.ciano} opacity={0.8} />
          <text x={50} y={70} textAnchor="middle" fontSize={34}>🔒</text>
        </svg>
      </div>
      <div style={{ position: "absolute", right: 170, width: 900 }}>
        <div style={{ ...TXT(32, 600, COR.ciano), letterSpacing: "0.2em", opacity: entre(f, 0, 14) }}>ANTES DE CHEGAR ATÉ VOCÊ</div>
        <div style={{ ...TXT(76, 700), letterSpacing: "-0.03em", marginTop: 12, ...pop(useMola(6)) }}>Banca de teste de <Rico texto="*intrusão*" /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 40 }}>
          {TESTES.map((t, i) => {
            const de = Math.round(d * (0.22 + i * 0.12));
            return (
              <Linha key={t} de={de}>
                <div style={{ flex: 1, ...TXT(38, 600) }}>{t}</div>
                <div style={{ ...TXT(26, 600, VERDE), opacity: entre(f, de + 14, de + 22) }}>BLOQUEADO</div>
                <Check atraso={de + 14} tam={60} />
              </Linha>
            );
          })}
        </div>
        <div style={{ marginTop: 36, display: "inline-block", padding: "16px 34px", borderRadius: 999, background: "rgba(34,197,94,0.15)", border: `2px solid ${VERDE}`, ...TXT(36, 700, "#bbf7d0"), transform: `scale(${aprovado})` }}>Risco eliminado antes da entrega</div>
      </div>
    </Cena>
  );
};

// 10 · Time de verdade
const ETAPAS = [
  { t: "Implanta junto", i: "🚀" },
  { t: "Treina a equipe", i: "🎓" },
  { t: "Acompanha de perto", i: "💙" },
];
const C10: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 150, textAlign: "center", width: "100%" }}>
        <Titulo texto="Você *nunca* fica sozinho" tam={96} />
      </div>
      <div style={{ display: "flex", gap: 50, marginTop: 120 }}>
        {ETAPAS.map((e, i) => {
          const de = Math.round(d * (0.25 + i * 0.17));
          const p = useMolaFixa(de);
          return (
            <div key={e.t} style={{ ...VIDRO, width: 440, padding: "50px 30px", textAlign: "center", ...pop(p, 80), borderColor: p > 0.9 ? "rgba(0,225,251,0.6)" : undefined }}>
              <div style={{ fontSize: 100, transform: `translateY(${Math.sin((f + i * 10) / 12) * 6}px)` }}>{e.i}</div>
              <div style={{ ...TXT(46, 700), marginTop: 20 }}>{e.t}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", bottom: 160, display: "flex", alignItems: "center", gap: 16, ...TXT(34, 500, COR.suave), opacity: entre(f, d * 0.75, d * 0.85) }}>
        <div style={{ width: 54, height: 54, borderRadius: 27, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>💬</div>
        Gente de verdade, com nome e WhatsApp
      </div>
    </Cena>
  );
};

// 11 · Araguari para o Brasil
const CONTORNO: [number, number][] = [[-73.9, -7.3], [-72.4, -10], [-70.5, -11], [-69.5, -10.9], [-66.6, -9.8], [-65.3, -10.9], [-64.4, -12.5], [-61, -13.5], [-60, -15.3], [-58.4, -16.3], [-57.6, -18], [-57.8, -20], [-57.9, -22.1], [-55.8, -22.3], [-54.6, -23.9], [-54.6, -25.6], [-53.8, -26.9], [-55.8, -28.1], [-57.6, -30.2], [-56, -30.9], [-53.4, -33.7], [-52.4, -33], [-50.7, -30.9], [-48.6, -28.3], [-48.5, -26], [-47, -24.5], [-44.5, -23.3], [-42, -22.9], [-40.9, -21.8], [-39.7, -19.5], [-39.2, -17.7], [-38.9, -15.7], [-38.9, -13.5], [-37.7, -12], [-36.4, -10.5], [-35.1, -9], [-34.8, -7.2], [-35.2, -5.4], [-37.2, -4.8], [-38.5, -3.7], [-41.4, -2.9], [-44.2, -2.5], [-46.5, -1], [-48.5, -1], [-50, 0.5], [-50.9, 1.9], [-51.6, 4.2], [-52.9, 2.2], [-54.5, 2.3], [-56, 1.9], [-57.9, 1.6], [-59.7, 1.8], [-60.1, 4.5], [-62.8, 3.7], [-64.8, 1.3], [-66.8, 1.2], [-69.4, 1.1], [-69.5, -1.5], [-69.9, -4.2], [-72.9, -5.2]];
const CIDADES: [number, number][] = [[-60.02, -3.12], [-48.49, -1.46], [-38.53, -3.73], [-34.88, -8.05], [-38.5, -12.97], [-47.88, -15.79], [-49.25, -16.68], [-43.94, -19.92], [-43.17, -22.91], [-46.63, -23.55], [-49.27, -25.43], [-48.55, -27.59], [-51.23, -30.03], [-56.1, -15.6], [-54.62, -20.47], [-63.9, -8.76], [-67.81, -9.97], [-60.67, 2.82], [-51.07, 0.03], [-48.33, -10.18], [-44.3, -2.53], [-42.8, -5.09], [-35.21, -5.79], [-34.86, -7.12], [-35.74, -9.67], [-37.07, -10.91], [-40.34, -20.32]];
const ARAGUARI: [number, number] = [-48.19, -18.65];
const K = 19, OX = 980, OY = 140;
const proj = ([lon, lat]: [number, number]) => ({ x: OX + (lon + 75) * K, y: OY + (6 - lat) * K });
const dentro = (lon: number, lat: number) => {
  let c = false;
  for (let i = 0, j = CONTORNO.length - 1; i < CONTORNO.length; j = i++) {
    const [xi, yi] = CONTORNO[i];
    const [xj, yj] = CONTORNO[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const PONTOS: { x: number; y: number; d: number }[] = [];
for (let lon = -74; lon <= -34; lon += 1.1) for (let lat = 5; lat >= -34; lat -= 1.1) if (dentro(lon, lat)) {
  const p = proj([lon, lat]);
  PONTOS.push({ ...p, d: Math.hypot(lon - ARAGUARI[0], lat - ARAGUARI[1]) });
}
const C11: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = proj(ARAGUARI);
  const onda = interpolate(f, [8, d * 0.7], [0, 40], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <Cena d={d}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {PONTOS.map((p, i) => {
          const aceso = p.d < onda;
          return <circle key={i} cx={p.x} cy={p.y} r={aceso ? 4.2 : 3} fill={aceso ? COR.azulClaro : "rgba(120,170,255,0.18)"} opacity={aceso ? 0.85 : 1} />;
        })}
        {CIDADES.map((c, i) => {
          const p = proj(c);
          const dist = Math.hypot(c[0] - ARAGUARI[0], c[1] - ARAGUARI[1]);
          const k = entre(f, 10 + dist * 1.6, 30 + dist * 1.6);
          if (k <= 0) return null;
          const mx = (a.x + p.x) / 2, my = Math.min(a.y, p.y) - 60 - dist * 3;
          const t = k;
          const bx = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * p.x;
          const by = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * p.y;
          return (
            <g key={i}>
              <path d={`M${a.x},${a.y} Q${mx},${my} ${p.x},${p.y}`} fill="none" stroke="rgba(0,225,251,0.4)" strokeWidth={1.6} strokeDasharray={2000} strokeDashoffset={2000 * (1 - k)} />
              <circle cx={bx} cy={by} r={k < 1 ? 5 : 7} fill={COR.ciano} />
              {k >= 1 ? <circle cx={p.x} cy={p.y} r={7 + ((f + i * 7) % 40) / 3} fill="none" stroke={COR.ciano} opacity={1 - ((f + i * 7) % 40) / 40} /> : null}
            </g>
          );
        })}
        <circle cx={a.x} cy={a.y} r={14} fill="#fff" />
        <circle cx={a.x} cy={a.y} r={14 + (f % 30)} fill="none" stroke="#fff" strokeWidth={3} opacity={1 - (f % 30) / 30} />
      </svg>
      <div style={{ position: "absolute", left: a.x + 26, top: a.y - 20, ...TXT(30, 700), opacity: entre(f, 6, 16) }}>Araguari (MG)</div>
      <div style={{ position: "absolute", left: 140, top: 340, width: 760 }}>
        <div style={{ ...TXT(34, 600, COR.ciano), letterSpacing: "0.2em", opacity: entre(f, 0, 12) }}>FEITA EM ARAGUARI</div>
        <Palavras texto="Para empresas do *Brasil* *inteiro*" atraso={Math.round(d * 0.35)} passo={5} estilo={{ ...TXT(100, 700), letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 16 }} />
      </div>
    </Cena>
  );
};

// 12 · Chamada
const C12: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const b = useMola(8);
  const w = useMola(Math.round(d * 0.55));
  return (
    <Cena d={d}>
      <div style={{ textAlign: "center" }}>
        <Titulo texto="Experimente *grátis* por *30* *dias*" tam={110} />
        <div style={{ ...TXT(42, 500, COR.suave), marginTop: 20, opacity: entre(f, 20, 34) }}>sem cartão de crédito</div>
        <div style={{ display: "flex", gap: 30, justifyContent: "center", marginTop: 60 }}>
          <div style={{ padding: "30px 64px", borderRadius: 999, background: GRAD_BOTAO, boxShadow: `0 20px ${50 + Math.sin(f / 6) * 20}px rgba(0,88,250,0.6)`, ...TXT(48, 700, "#fff"), transform: `scale(${b * (1 + Math.sin(f / 6) * 0.025)})` }}>Começar o teste</div>
          <div style={{ padding: "30px 54px", borderRadius: 999, background: "rgba(34,197,94,0.16)", border: `2px solid ${VERDE}`, ...TXT(46, 700, "#dcfce7"), transform: `scale(${w})`, display: "flex", gap: 16, alignItems: "center" }}>💬 (34) 99733-7499</div>
        </div>
      </div>
    </Cena>
  );
};

// 13 · Assinatura
const C13: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(2, { damping: 16, mass: 1 });
  const s = useMola(20);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: entre(f, 0, 10) }}>
      <Poeira n={40} />
      <div style={{ position: "absolute", width: 900, height: 900, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,88,250,0.3), transparent 65%)", transform: `scale(${a})` }} />
      <Img src={staticFile("logo-lockup.webp")} style={{ width: 760, transform: `scale(${0.9 + a * 0.1})`, opacity: a }} />
      <div style={{ ...TXT(56, 600), marginTop: 50, letterSpacing: "0.02em", ...pop(s) }}>IA com <Rico texto="*cuidado* *humano*" /></div>
      <div style={{ ...TXT(32, 500, COR.suave), marginTop: 28, opacity: entre(f, 34, 50) }}>nexorconsultingit.com.br · (34) 99733-7499</div>
      <div style={{ position: "absolute", inset: 0, background: "#000", opacity: entre(f, d - 18, d) }} />
    </AbsoluteFill>
  );
};

/* ---------- legenda ---------- */
const Legenda: React.FC<{ esconder: number[] }> = ({ esconder }) => {
  const f = useCurrentFrame();
  const t = f / FPS - ATRASO;
  const pedacos: { de: number; ate: number; txt: string }[] = [];
  (FALAS as string[]).forEach((fala, i) => {
    if (esconder.includes(i)) return;
    const [de, ate] = TEMPOS.frases[i];
    const partes = fala.replace(/\.\.\./g, "…").split(/(?<=[,.?!:…])\s+/).reduce<string[]>((acc, w) => {
      const u = acc[acc.length - 1];
      if (u && !/[.?!]$/.test(u) && (u + " " + w).length <= 58) acc[acc.length - 1] = u + " " + w;
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
  const atual = pedacos.find((p) => t >= p.de - 0.05 && t < p.ate + 0.25);
  if (!atual) return null;
  const op = interpolate(t, [atual.de - 0.05, atual.de + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", bottom: 54, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: op }}>
      <div style={{ padding: "12px 26px", borderRadius: 16, background: "rgba(1,5,36,0.72)", border: "1px solid rgba(120,170,255,0.2)", fontFamily: "Inter", fontWeight: 600, fontSize: 34, lineHeight: 1.3, color: "#fff", textAlign: "center" }}>{atual.txt}</div>
    </div>
  );
};

/* ---------- vídeo ---------- */
const CENAS: ((d: number, voz: Voz, de: number) => React.ReactNode)[] = [
  (d) => <C1 d={d} />,
  (d) => <C2 d={d} />,
  (d) => <C3 d={d} />,
  (d, v) => <C4 d={d} voz={v} />,
  (d) => <C5 d={d} />,
  (d, v) => <C6 d={d} voz={v} />,
  (d, _v, de) => <C7 d={d} inicio={de} />,
  (d, v) => <C8 d={d} voz={v} />,
  (d) => <C9 d={d} />,
  (d) => <C10 d={d} />,
  (d) => <C11 d={d} />,
  (d) => <C12 d={d} />,
  (d) => <C13 d={d} />,
];

export const Institucional: React.FC = () => {
  const voz = useVoz(PASTA);
  const f = useCurrentFrame();
  const total = duracaoInstitucional;
  /* cada cena começa no meio da pausa antes da sua frase */
  const ini = TEMPOS.frases.map((x, i) => (i === 0 ? 0 : quadro((TEMPOS.frases[i - 1][1] + x[0]) / 2)));
  const marca = 1 - entre(f, ini[ini.length - 1] - 10, ini[ini.length - 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: COR.navy }}>
      <Fundo voz={voz} />
      {CENAS.map((c, i) => {
        const de = ini[i];
        const d = (i + 1 < ini.length ? ini[i + 1] : total) - de;
        return (
          <Sequence key={i} from={de} durationInFrames={d} layout="none">
            {c(d, voz, de)}
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", top: 50, left: 64, display: "flex", alignItems: "center", gap: 14, ...TXT(28, 600), opacity: marca * entre(f, 20, 40) }}>
        <Img src={staticFile("logo-mark.webp")} style={{ width: 44, height: 44, borderRadius: 11 }} />
        Nexor Consulting
      </div>
      <Legenda esconder={[2, 4, 12]} />
      <Audio src={staticFile(`${PASTA}/trilha.wav`)} volume={(q) => interpolate(q, [0, 30, total - 60, total], [0, 0.32, 0.32, 0], { extrapolateRight: "clamp" })} />
      <Sequence from={quadro(0)} layout="none">
        <Audio src={staticFile(`${PASTA}/locucao.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
