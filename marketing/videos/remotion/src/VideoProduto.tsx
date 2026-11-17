/* Modelo dos vídeos verticais (9:16) dos produtos Nexor, com locução humana do ElevenLabs.
   Cada produto é só uma configuração (src/produtos.tsx). Os tempos das cenas e das legendas
   vêm das pausas reais da locução (scripts/tempos.mjs): o áudio nunca é acelerado. */
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "./fontes/fontes.css";

export const FPS = 30;
export const ATRASO = 0.4; // respiro antes da primeira palavra
const CAUDA = 2.1; // tempo da cartela final depois da última palavra

export const COR = { navy: "#010524", azul: "#0058FA", azulClaro: "#3B8DFF", ciano: "#00E1FB", gelo: "#EBF1F9", suave: "#B3C1D9" };

export type Foco = { x: number; y: number; escala: number };
export type Cena =
  | { tipo: "gancho"; frase: number; emoji: string; texto: string }
  | { tipo: "tela"; frase: number; inicio?: number; src: string; foco: Foco; titulo: string; nota?: string; proporcao?: number; largura?: number }
  | { tipo: "frase"; frase: number; linha1: string; linha2: string }
  | { tipo: "final"; frase: number; chamada: string; botao: string };

export type Produto = {
  id: string;
  nome: string;
  pasta: string;
  frases: string[]; // texto falado, uma entrada por trecho separado por "..."
  tempos: { duracao: number; frases: readonly (readonly [number, number])[] };
  cenas: Cena[];
};

export const duracaoEmQuadros = (p: Produto) => Math.round((ATRASO + p.tempos.frases[p.tempos.frases.length - 1][1] + CAUDA) * FPS);
const q = (seg: number) => Math.round((seg + ATRASO) * FPS);

/* "texto com *destaque*" → destaque em degradê */
const Rico: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split("*").map((parte, i) =>
      i % 2 ? (
        <span key={i} style={{ background: `linear-gradient(90deg, ${COR.azulClaro}, ${COR.ciano})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          {parte}
        </span>
      ) : (
        <React.Fragment key={i}>{parte}</React.Fragment>
      ),
    )}
  </>
);

const useEntrada = (atraso = 0) => {
  const f = useCurrentFrame();
  const p = interpolate(f - atraso, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return { opacity: p, transform: `translateY(${(1 - p) * 28}px)` };
};
const useSaida = (duracao: number) => {
  const f = useCurrentFrame();
  return interpolate(f, [duracao - 8, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

const Fundo: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(1100px 900px at 85% 0%, #12336e 0%, #07122b 45%, ${COR.navy} 80%)` }}>
    <AbsoluteFill style={{ background: "radial-gradient(800px 700px at 0% 100%, rgba(0,225,251,0.14), transparent 65%)" }} />
  </AbsoluteFill>
);

const Marca: React.FC<{ nome: string }> = ({ nome }) => (
  <div style={{ position: "absolute", top: 110, left: 72, display: "flex", alignItems: "center", gap: 18, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 38, color: COR.gelo }}>
    <Img src={staticFile("logo-mark.webp")} style={{ width: 58, height: 58, borderRadius: 14 }} />
    {nome}
  </div>
);

/* Tela inteira numa moldura de navegador; após 35% da cena, aproximação lenta (1,4 s) da área citada */
const Tela: React.FC<{ cena: Extract<Cena, { tipo: "tela" }>; duracao: number }> = ({ cena, duracao }) => {
  const f = useCurrentFrame();
  const et = useEntrada(0);
  const ei = useEntrada(6);
  const saida = useSaida(duracao);
  const inicio = Math.round(duracao * 0.35);
  const zoom = interpolate(f, [inicio, inicio + 42], [1, cena.foco.escala], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  /* largura menor = tela de celular ou peça vertical: sem a barra do navegador e um pouco mais acima */
  const L = cena.largura ?? 1000;
  const A = L / (cena.proporcao ?? 1.6);
  const BARRA = cena.largura ? 0 : 44;
  const TOPO = cena.largura ? 540 : 600;
  return (
    <AbsoluteFill style={{ opacity: saida }}>
      <div style={{ position: "absolute", top: 300, left: 72, right: 72, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 76, lineHeight: 1.12, letterSpacing: "-0.015em", color: COR.gelo, ...et }}>
        <Rico texto={cena.titulo} />
      </div>
      <div style={{ position: "absolute", top: TOPO, left: (1080 - L) / 2, width: L, borderRadius: 26, overflow: "hidden", background: "rgba(10,22,48,0.6)", border: "1.5px solid rgba(120,170,255,0.28)", boxShadow: "0 40px 90px rgba(0,0,0,0.5)", ...ei }}>
        {BARRA > 0 && <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: "rgba(255,255,255,0.06)" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.85 }} />
          ))}
        </div>}
        <div style={{ width: L, height: A, overflow: "hidden" }}>
          <Img src={staticFile(cena.src)} style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${zoom})`, transformOrigin: `${cena.foco.x}% ${cena.foco.y}%` }} />
        </div>
      </div>
      <div style={{ position: "absolute", top: TOPO + BARRA + A + 22, width: "100%", textAlign: "center", fontFamily: "Inter", fontWeight: 500, fontSize: 26, color: COR.suave, ...ei }}>
        {cena.nota ?? "Tela real do sistema · dados fictícios"}
      </div>
    </AbsoluteFill>
  );
};

const Gancho: React.FC<{ cena: Extract<Cena, { tipo: "gancho" }>; duracao: number }> = ({ cena, duracao }) => {
  const f = useCurrentFrame();
  const e = useEntrada(0);
  const saida = useSaida(duracao);
  const balanco = Math.sin(f / 2.2) * interpolate(f, [0, 40], [6, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 72px", opacity: saida }}>
      <div style={{ fontSize: 150, width: 170, marginBottom: 30, opacity: e.opacity, transform: `${e.transform} rotate(${balanco}deg)` }}>{cena.emoji}</div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 100, lineHeight: 1.06, letterSpacing: "-0.02em", color: COR.gelo, ...e }}>
        <Rico texto={cena.texto} />
      </div>
    </AbsoluteFill>
  );
};

const Frase: React.FC<{ cena: Extract<Cena, { tipo: "frase" }>; duracao: number }> = ({ cena, duracao }) => {
  const a = useEntrada(0);
  const b = useEntrada(Math.round(duracao * 0.42));
  const saida = useSaida(duracao);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 72px", opacity: saida }}>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 112, lineHeight: 1.06, letterSpacing: "-0.02em", color: COR.gelo }}>
        <div style={a}>
          <Rico texto={cena.linha1} />
        </div>
        <div style={b}>
          <Rico texto={cena.linha2} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Final: React.FC<{ cena: Extract<Cena, { tipo: "final" }> }> = ({ cena }) => {
  const a = useEntrada(0);
  const b = useEntrada(10);
  const c = useEntrada(22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 72px" }}>
      <Img src={staticFile("logo-lockup.webp")} style={{ width: 640, ...a }} />
      <div style={{ marginTop: 80, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 88, lineHeight: 1.08, color: COR.gelo, ...b }}>
        <Rico texto={cena.chamada} />
      </div>
      <div style={{ marginTop: 56, padding: "26px 54px", borderRadius: 999, background: `linear-gradient(135deg, ${COR.azul}, #00b4ff)`, boxShadow: "0 18px 50px rgba(0,88,250,0.5)", fontFamily: "Inter", fontWeight: 600, fontSize: 46, color: "#fff", ...c }}>
        {cena.botao}
      </div>
      <div style={{ marginTop: 48, fontFamily: "Inter", fontWeight: 500, fontSize: 34, color: COR.suave, ...c }}>nexorconsultingit.com.br · IA com cuidado humano</div>
    </AbsoluteFill>
  );
};

/* Legendas: só nas cenas de tela. Frase longa é dividida nas vírgulas e o tempo é repartido pelo tamanho de cada pedaço */
const montarLegendas = (p: Produto) => {
  const comTela = new Set(p.cenas.filter((c) => c.tipo === "tela").map((c) => c.frase));
  const out: { de: number; ate: number; texto: string }[] = [];
  p.frases.forEach((txt, i) => {
    if (!comTela.has(i)) return;
    const [de, ate] = p.tempos.frases[i];
    const pedacos = txt.length > 62 ? txt.split(/(?<=[,:.?!])\s+/).reduce<string[]>((acc, w) => {
      const ult = acc[acc.length - 1];
      if (ult && (ult + " " + w).length <= 62) acc[acc.length - 1] = ult + " " + w;
      else acc.push(w);
      return acc;
    }, []) : [txt];
    const total = pedacos.reduce((a, s) => a + s.length, 0);
    let t = de;
    pedacos.forEach((s) => {
      const d = ((ate - de) * s.length) / total;
      out.push({ de: t, ate: t + d, texto: s });
      t += d;
    });
  });
  return out;
};

const Legenda: React.FC<{ legendas: { de: number; ate: number; texto: string }[] }> = ({ legendas }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps - ATRASO;
  const atual = legendas.find((l) => t >= l.de - 0.05 && t < l.ate + 0.2);
  if (!atual) return null;
  const op = interpolate(t, [atual.de - 0.05, atual.de + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", bottom: 300, left: 72, right: 72, display: "flex", justifyContent: "center", opacity: op }}>
      <div style={{ maxWidth: 920, padding: "20px 32px", borderRadius: 22, background: "rgba(1,5,36,0.72)", border: "1px solid rgba(120,170,255,0.22)", fontFamily: "Inter", fontWeight: 600, fontSize: 46, lineHeight: 1.3, color: "#fff", textAlign: "center" }}>
        {atual.texto}
      </div>
    </div>
  );
};

export const VideoProduto: React.FC<{ produto: Produto }> = ({ produto }) => {
  const total = duracaoEmQuadros(produto);
  const inicios = produto.cenas.map((c, i) => (i === 0 ? 0 : q(c.tipo === "tela" && c.inicio !== undefined ? c.inicio : produto.tempos.frases[c.frase][0])));
  const legendas = montarLegendas(produto);
  return (
    <AbsoluteFill style={{ backgroundColor: COR.navy }}>
      <Fundo />
      <Marca nome={produto.nome} />
      {produto.cenas.map((c, i) => {
        const de = inicios[i];
        const ate = i + 1 < inicios.length ? inicios[i + 1] : total;
        const d = ate - de;
        return (
          <Sequence key={i} from={de} durationInFrames={d} layout="none">
            {c.tipo === "gancho" ? <Gancho cena={c} duracao={d} /> : c.tipo === "tela" ? <Tela cena={c} duracao={d} /> : c.tipo === "frase" ? <Frase cena={c} duracao={d} /> : <Final cena={c} />}
          </Sequence>
        );
      })}
      <Legenda legendas={legendas} />
      <Sequence from={q(0)} layout="none">
        <Audio src={staticFile(`${produto.pasta}/locucao.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
