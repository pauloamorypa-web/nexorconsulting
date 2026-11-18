/* Kit dos vídeos animados (padrão da Blue): nada de tela parada.
   Cada produto monta as suas cenas com estas peças; o VideoAnimado cuida do fundo vivo,
   da marca no topo, da legenda, do áudio e da troca de cenas nas pausas reais da locução. */
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData } from "@remotion/media-utils";
import "./fontes/fontes.css";
import { ATRASO, COR, FPS } from "./VideoProduto";

export { COR, FPS };
export const CAUDA = 2.1;
export const GRAD = `linear-gradient(90deg, ${COR.azulClaro}, ${COR.ciano})`;
export const GRAD_BOTAO = `linear-gradient(135deg, ${COR.azul}, #00b4ff)`;
export const VERDE = "#22c55e";
export const VIDRO: React.CSSProperties = { background: "rgba(14,30,66,0.62)", border: "1.5px solid rgba(120,170,255,0.26)", borderRadius: 34, boxShadow: "0 30px 80px rgba(0,0,0,0.45)" };
export const TXT = (tam: number, peso = 600, cor: string = COR.gelo): React.CSSProperties => ({ fontFamily: peso >= 600 && tam >= 50 ? "Space Grotesk" : "Inter", fontWeight: peso, fontSize: tam, color: cor, lineHeight: 1.15 });

export type Tempos = { duracao: number; frases: readonly (readonly [number, number])[] };
export type Voz = { energia: number; ondas: number[] };
export const quadro = (seg: number) => Math.round((seg + ATRASO) * FPS);
export const duracaoAnimado = (t: Tempos) => Math.round((ATRASO + t.frases[t.frases.length - 1][1] + CAUDA) * FPS);

export const Rico: React.FC<{ texto: string }> = ({ texto }) => (
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

export const useMola = (de: number, cfg = { damping: 14, mass: 0.7 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - de, fps, config: cfg });
};
export const pop = (p: number, y = 40): React.CSSProperties => ({ opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * y}px) scale(${0.85 + 0.15 * p})` });
export const saida = (f: number, d: number) => interpolate(f, [d - 8, d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
export const entre = (f: number, de: number, ate: number, a = 0, b = 1) => interpolate(f, [de, ate], [a, b], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/* Base de cena: some no fim e centraliza o conteúdo na coluna */
export const Cena: React.FC<{ d: number; children: React.ReactNode; centro?: boolean }> = ({ d, children, centro }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: saida(f, d), ...(centro ? { justifyContent: "center", alignItems: "center" } : {}) }}>{children}</AbsoluteFill>;
};

export const Digitado: React.FC<{ texto: string; de: number; ate: number; cursor?: boolean }> = ({ texto, de, ate, cursor }) => {
  const f = useCurrentFrame();
  const n = Math.round(interpolate(f, [de, ate], [0, texto.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <>
      {texto.slice(0, n)}
      {cursor && f % 16 < 9 && <span style={{ color: COR.ciano }}>|</span>}
    </>
  );
};

/* Número que conta de "de" até "ate" (valores), entre os quadros q0 e q1 */
export const Contador: React.FC<{ q0: number; q1: number; ate: number; de?: number; formato?: (n: number) => string }> = ({ q0, q1, ate, de = 0, formato }) => {
  const f = useCurrentFrame();
  const n = interpolate(f, [q0, q1], [de, ate], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <>{formato ? formato(n) : Math.round(n).toLocaleString("pt-BR")}</>;
};
export const reais = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/* Orbe do produto: ícone no centro, anéis que pulsam com a voz */
export const Orbe: React.FC<{ tam: number; energia: number; icone: React.ReactNode }> = ({ tam, energia, icone }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "relative", width: tam, height: tam }}>
      {[0, 1, 2].map((i) => {
        const ciclo = ((f + i * 20) % 60) / 60;
        return <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${3 + energia * 4}px solid ${COR.ciano}`, opacity: (1 - ciclo) * (0.25 + energia * 0.6), transform: `scale(${1 + ciclo * (0.35 + energia * 0.35)})` }} />;
      })}
      <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: `conic-gradient(from ${f * 3}deg, ${COR.azul}, ${COR.ciano}, ${COR.azulClaro}, ${COR.azul})`, boxShadow: `0 0 ${40 + energia * 80}px rgba(0,225,251,${0.35 + energia * 0.4})` }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #16336f, #050d2b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: tam * 0.46 }}>{icone}</div>
    </div>
  );
};

export const Onda: React.FC<{ valores: number[]; largura?: number; altura?: number }> = ({ valores, largura = 760, altura = 140 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, height: altura, width: largura, justifyContent: "center" }}>
    {valores.map((v, i) => (
      <div key={i} style={{ width: 10, height: Math.max(8, v * altura), borderRadius: 6, background: GRAD, opacity: 0.9 }} />
    ))}
  </div>
);

/* Balões de conversa: "eu" (azul, à direita) e "outro" (claro, à esquerda) */
export const Balao: React.FC<{ de: "eu" | "outro"; children: React.ReactNode; estilo?: React.CSSProperties }> = ({ de, children, estilo }) => (
  <div style={{ alignSelf: de === "eu" ? "flex-end" : "flex-start", maxWidth: 780, padding: "26px 34px", borderRadius: 34, borderBottomRightRadius: de === "eu" ? 10 : 34, borderBottomLeftRadius: de === "outro" ? 10 : 34, background: de === "eu" ? `linear-gradient(135deg, ${COR.azul}, #2f7bff)` : "rgba(235,241,249,0.96)", color: de === "eu" ? "#fff" : "#0b1733", fontFamily: "Inter", fontWeight: 500, fontSize: 42, lineHeight: 1.3, boxShadow: "0 14px 40px rgba(0,0,0,0.3)", ...estilo }}>
    {children}
  </div>
);
export const Digitando: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", gap: 12, padding: "30px 36px", borderRadius: 34, borderBottomLeftRadius: 10, background: "rgba(235,241,249,0.96)" }}>
      {[0, 1, 2].map((i) => <div key={i} style={{ width: 16, height: 16, borderRadius: 8, background: "#5b6b88", transform: `translateY(${Math.sin((f + i * 5) / 3.2) * -7}px)` }} />)}
    </div>
  );
};

/* Peças que entram com mola */
export const Entra: React.FC<{ atraso?: number; y?: number; children: React.ReactNode; estilo?: React.CSSProperties }> = ({ atraso = 0, y = 40, children, estilo }) => {
  const p = useMola(atraso);
  return <div style={{ ...estilo, ...pop(p, y) }}>{children}</div>;
};
export const Chip: React.FC<{ atraso: number; children: React.ReactNode; cor?: string }> = ({ atraso, children, cor }) => {
  const p = useMola(atraso);
  return <div style={{ ...VIDRO, borderRadius: 999, padding: "18px 30px", fontFamily: "Inter", fontWeight: 600, fontSize: 36, color: cor ?? COR.gelo, ...pop(p, 30) }}>{children}</div>;
};
export const Cartao: React.FC<{ atraso?: number; children: React.ReactNode; estilo?: React.CSSProperties; destaque?: boolean }> = ({ atraso = 0, children, estilo, destaque }) => {
  const p = useMola(atraso);
  return <div style={{ ...VIDRO, padding: "36px 42px", ...(destaque ? { borderColor: COR.ciano, boxShadow: "0 0 60px rgba(0,225,251,0.35)" } : {}), ...estilo, ...pop(p) }}>{children}</div>;
};
export const Check: React.FC<{ atraso: number; tam?: number }> = ({ atraso, tam = 96 }) => {
  const p = useMola(atraso, { damping: 8, mass: 0.5 });
  return <div style={{ width: tam, height: tam, borderRadius: tam / 2, background: VERDE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: tam * 0.58, color: "#fff", transform: `scale(${p})`, flexShrink: 0 }}>✓</div>;
};
export const Barra: React.FC<{ q0: number; q1: number; ate: number; altura?: number }> = ({ q0, q1, ate, altura = 16 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ height: altura, borderRadius: altura / 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
      <div style={{ width: `${entre(f, q0, q1) * ate * 100}%`, height: "100%", background: GRAD }} />
    </div>
  );
};
export const Palavras: React.FC<{ texto: string; atraso?: number; passo?: number; estilo?: React.CSSProperties }> = ({ texto, atraso = 0, passo = 7, estilo }) => (
  <div style={estilo}>
    {texto.split(" ").map((w, i) => <Palavra key={i} atraso={atraso + i * passo} texto={w} />)}
  </div>
);
const Palavra: React.FC<{ atraso: number; texto: string }> = ({ atraso, texto }) => {
  const p = useMola(atraso);
  return <span style={{ display: "inline-block", marginRight: "0.25em", ...pop(p, 50) }}><Rico texto={texto} /></span>;
};

/* Gancho: ícone grande que balança + frase em palavras */
export const CenaGancho: React.FC<{ d: number; icone: string; texto: string; extra?: React.ReactNode }> = ({ d, icone, texto, extra }) => {
  const f = useCurrentFrame();
  const a = useMola(0, { damping: 9, mass: 0.6 });
  const bal = Math.sin(f / 2.4) * interpolate(f, [0, 40], [10, 0], { extrapolateRight: "clamp" });
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 360, left: 72, right: 72 }}>
        <div style={{ fontSize: 170, transform: `scale(${a}) rotate(${bal}deg)`, transformOrigin: "left bottom", display: "inline-block" }}>{icone}</div>
        <Palavras texto={texto} atraso={6} passo={5} estilo={{ ...TXT(104), lineHeight: 1.08, letterSpacing: "-0.02em", marginTop: 30 }} />
        {extra}
      </div>
    </Cena>
  );
};

/* Manifesto: duas linhas com palavras saltando */
export const CenaManifesto: React.FC<{ d: number; linha1: string; linha2: string; emoji?: string }> = ({ d, linha1, linha2, emoji }) => {
  const n = linha1.split(" ").length;
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 560, left: 72, right: 72 }}>
        <Palavras texto={linha1} passo={5} estilo={{ ...TXT(108), lineHeight: 1.06, letterSpacing: "-0.02em" }} />
        <Palavras texto={linha2.split(" ").map((w) => `*${w}*`).join(" ") + (emoji ? ` ${emoji}` : "")} atraso={n * 5 + 6} passo={4} estilo={{ ...TXT(124), lineHeight: 1.04, letterSpacing: "-0.02em", marginTop: 36 }} />
      </div>
    </Cena>
  );
};

/* Final: orbe pulsando, chamada, botão que pulsa, marca */
export const CenaFinal: React.FC<{ voz: Voz; icone: React.ReactNode; chamada: string; botao: string }> = ({ voz, icone, chamada, botao }) => {
  const f = useCurrentFrame();
  const a = useMola(0);
  const b = useMola(10);
  const c = useMola(20);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 60px" }}>
      <div style={{ transform: `scale(${a})` }}>
        <Orbe tam={260} energia={voz.energia} icone={icone} />
      </div>
      <div style={{ marginTop: 64, ...TXT(100), lineHeight: 1.08, ...pop(b) }}>
        <Rico texto={chamada} />
      </div>
      <div style={{ marginTop: 44, padding: "28px 60px", borderRadius: 999, background: GRAD_BOTAO, boxShadow: `0 18px ${50 + Math.sin(f / 6) * 20}px rgba(0,88,250,0.6)`, fontFamily: "Inter", fontWeight: 600, fontSize: 50, color: "#fff", transform: `scale(${c * (1 + Math.sin(f / 6) * 0.03)})` }}>{botao}</div>
      <Img src={staticFile("logo-lockup.webp")} style={{ width: 460, marginTop: 90, opacity: c }} />
      <div style={{ marginTop: 26, ...TXT(34, 500, COR.suave), opacity: c }}>nexorconsultingit.com.br · IA com cuidado humano</div>
    </AbsoluteFill>
  );
};

/* Volume real da voz (RMS de 30 ms), normalizado pelo pico da locução */
export const useVoz = (pasta: string): Voz => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = useAudioData(staticFile(`${pasta}/locucao.mp3`));
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
  const ta = (f - quadro(0)) / fps;
  const ondas = new Array(24).fill(0).map((_, i) => 0.1 + 0.9 * volume(ta - Math.abs(i - 11.5) * 0.03) * (0.75 + 0.25 * Math.sin(i * 1.7 + f / 3)));
  const energia = Math.min(1, ((volume(ta) + volume(ta - 0.04) + volume(ta - 0.08)) / 3) * 1.3);
  return { energia, ondas };
};

/* Legenda da fala, dividida na pontuação (frases em "pular" já estão escritas na tela) */
const Legenda: React.FC<{ falas: string[]; tempos: Tempos; pular: number[] }> = ({ falas, tempos, pular }) => {
  const f = useCurrentFrame();
  const t = f / FPS - ATRASO;
  const pedacos: { de: number; ate: number; txt: string }[] = [];
  falas.forEach((fala, i) => {
    if (pular.includes(i)) return;
    const [de, ate] = tempos.frases[i];
    const partes = fala.split(/(?<=[,.?!:])\s+/).reduce<string[]>((acc, w) => {
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
    <div style={{ position: "absolute", bottom: 200, left: 60, right: 60, display: "flex", justifyContent: "center", opacity: op }}>
      <div style={{ padding: "18px 30px", borderRadius: 22, background: "rgba(1,5,36,0.8)", border: "1px solid rgba(120,170,255,0.22)", fontFamily: "Inter", fontWeight: 600, fontSize: 44, lineHeight: 1.3, color: "#fff", textAlign: "center" }}>{atual.txt}</div>
    </div>
  );
};

export type VideoAnimadoProps = {
  pasta: string;
  nome: string;
  falas: string[];
  tempos: Tempos;
  /* uma cena por fala; recebe a duração (quadros) e a voz ao vivo */
  cenas: ((d: number, voz: Voz) => React.ReactNode)[];
  /* início extra de cena (segundos do áudio), quando uma fala tem duas cenas */
  inicios?: number[];
  semLegenda?: number[];
};

export const VideoAnimado: React.FC<VideoAnimadoProps> = ({ pasta, nome, falas, tempos, cenas, inicios, semLegenda = [] }) => {
  const voz = useVoz(pasta);
  const total = duracaoAnimado(tempos);
  const ini = (inicios ?? tempos.frases.map((x) => x[0])).map((s, i) => (i === 0 ? 0 : quadro(s)));
  return (
    <AbsoluteFill style={{ backgroundColor: COR.navy }}>
      <Fundo energia={voz.energia} />
      <div style={{ position: "absolute", top: 110, left: 72, display: "flex", alignItems: "center", gap: 18, ...TXT(38) }}>
        <Img src={staticFile("logo-mark.webp")} style={{ width: 58, height: 58, borderRadius: 14 }} />
        {nome}
      </div>
      {cenas.map((c, i) => {
        const de = ini[i];
        const d = (i + 1 < ini.length ? ini[i + 1] : total) - de;
        return (
          <Sequence key={i} from={de} durationInFrames={d} layout="none">
            {c(d, voz)}
          </Sequence>
        );
      })}
      <Legenda falas={falas} tempos={tempos} pular={semLegenda} />
      <Sequence from={quadro(0)} layout="none">
        <Audio src={staticFile(`${pasta}/locucao.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};

/* Celular estilizado (moldura e entalhe) para mostrar app em movimento */
export const Celular: React.FC<{ largura?: number; altura?: number; children: React.ReactNode; estilo?: React.CSSProperties }> = ({ largura = 600, altura = 1060, children, estilo }) => (
  <div style={{ width: largura, height: altura, borderRadius: 70, padding: 16, background: "linear-gradient(160deg, #2a3a5e, #0b1430)", boxShadow: "0 40px 100px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.08)", ...estilo }}>
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 56, overflow: "hidden", background: "#f4f7fc" }}>
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: 150, height: 36, borderRadius: 18, background: "#0b1430", zIndex: 5 }} />
      {children}
    </div>
  </div>
);

/* Toque na tela: círculo que aparece e se expande no quadro "em" */
/* sem x/y: fica no centro do elemento pai (que precisa de position: relative) */
export const Toque: React.FC<{ em: number; x?: number; y?: number }> = ({ em, x, y }) => {
  const f = useCurrentFrame();
  const p = entre(f, em, em + 14);
  if (f < em - 6 || f > em + 16) return null;
  return <div style={{ position: "absolute", left: x === undefined ? "calc(50% - 45px)" : x - 45, top: y === undefined ? "calc(50% - 45px)" : y - 45, width: 90, height: 90, borderRadius: 45, background: "rgba(0,88,250,0.35)", border: "4px solid rgba(0,88,250,0.8)", transform: `scale(${0.6 + p * 0.8})`, opacity: 1 - p * 0.7, zIndex: 9 }} />;
};

/* Tela de conversa estilo WhatsApp dentro do Celular */
export const TelaWhats: React.FC<{ nome: string; sub?: string; cor?: string; children: React.ReactNode }> = ({ nome, sub = "online", cor = "#0ea5e9", children }) => (
  <div style={{ position: "absolute", inset: 0, background: "#efeae2", display: "flex", flexDirection: "column" }}>
    <div style={{ paddingTop: 66, padding: "66px 26px 20px", background: "#075e54", display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 70, height: 70, borderRadius: 35, background: cor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#fff" }}>{nome.slice(0, 1)}</div>
      <div>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 32, color: "#fff" }}>{nome}</div>
        <div style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 24, color: "rgba(255,255,255,0.75)" }}>{sub}</div>
      </div>
    </div>
    <div style={{ flex: 1, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 14, justifyContent: "flex-end" }}>{children}</div>
  </div>
);
export const MsgWhats: React.FC<{ de: "eu" | "outro"; hora: string; children: React.ReactNode; atraso?: number; lido?: boolean }> = ({ de, hora, children, atraso = 0, lido }) => {
  const p = useMola(atraso);
  return (
    <div style={{ alignSelf: de === "eu" ? "flex-end" : "flex-start", maxWidth: 470, padding: "16px 20px 10px", borderRadius: 18, background: de === "eu" ? "#d9fdd3" : "#fff", boxShadow: "0 2px 4px rgba(0,0,0,0.08)", fontFamily: "Inter", fontWeight: 500, fontSize: 29, lineHeight: 1.32, color: "#111b21", ...pop(p, 24) }}>
      {children}
      <div style={{ textAlign: "right", fontSize: 20, color: "#667781", marginTop: 4 }}>{hora}{de === "eu" && <span style={{ color: lido ? "#53bdeb" : "#667781" }}> ✓✓</span>}</div>
    </div>
  );
};
export const DigitandoWhats: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ alignSelf: "flex-start", display: "flex", gap: 9, padding: "22px 24px", borderRadius: 18, background: "#fff" }}>
      {[0, 1, 2].map((i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: "#8696a0", transform: `translateY(${Math.sin((f + i * 5) / 3.2) * -5}px)` }} />)}
    </div>
  );
};
