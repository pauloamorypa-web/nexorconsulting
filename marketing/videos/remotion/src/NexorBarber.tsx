/* Vídeo vertical do Nexor Barber (9:16), com locução humana do ElevenLabs.
   Os tempos das cenas e das legendas vêm das pausas reais da locução
   (ffmpeg silencedetect em public/barber/locucao.mp3), sem acelerar nada. */
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import "./fontes/fontes.css";

export const FPS = 30;
const ATRASO = 0.4; // segundos de respiro antes da primeira palavra
const s = (seg: number) => Math.round((seg + ATRASO) * FPS);
export const DURACAO = Math.round(23 * FPS);

const COR = {
  navy: "#010524",
  azul: "#0058FA",
  azulClaro: "#3B8DFF",
  ciano: "#00E1FB",
  gelo: "#EBF1F9",
  suave: "#B3C1D9",
};

/* Legendas: uma por trecho falado, nos tempos medidos da locução */
const LEGENDAS: { de: number; ate: number; texto: string; oculta?: boolean }[] = [
  { de: 0.1, ate: 1.75, texto: "Parou o corte pra atender o telefone?", oculta: true },
  { de: 2.17, ate: 5.6, texto: "No Nexor Barber, o cliente agenda sozinho, em um toque." },
  { de: 5.92, ate: 7.35, texto: "Recebe o lembrete no WhatsApp," },
  { de: 7.49, ate: 9.48, texto: "entra na lista de espera se alguém cancelar," },
  { de: 9.61, ate: 11.6, texto: "e ainda pode assinar o clube da barbearia." },
  { de: 11.91, ate: 14.98, texto: "No fim do dia, o caixa e as comissões já estão fechados." },
  { de: 15.25, ate: 17.62, texto: "Você corta. O sistema cuida do resto.", oculta: true },
  { de: 17.94, ate: 20.9, texto: "Teste grátis por trinta dias. O link está na bio.", oculta: true },
];

/* Entrada suave: aparece e sobe um pouco, em 0,5 s */
const useEntrada = (atraso = 0) => {
  const f = useCurrentFrame();
  const p = interpolate(f - atraso, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return { opacity: p, transform: `translateY(${(1 - p) * 28}px)` };
};

/* Saída suave nos últimos 8 quadros da cena */
const useSaida = (duracao: number) => {
  const f = useCurrentFrame();
  return interpolate(f, [duracao - 8, duracao], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

const Fundo: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1100px 900px at 85% 0%, #12336e 0%, #07122b 45%, ${COR.navy} 80%)`,
    }}
  >
    <AbsoluteFill
      style={{
        background: "radial-gradient(800px 700px at 0% 100%, rgba(0,225,251,0.14), transparent 65%)",
      }}
    />
  </AbsoluteFill>
);

const Marca: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: 110,
      left: 72,
      display: "flex",
      alignItems: "center",
      gap: 18,
      fontFamily: "Space Grotesk",
      fontWeight: 600,
      fontSize: 38,
      color: COR.gelo,
    }}
  >
    <Img src={staticFile("logo-mark.webp")} style={{ width: 58, height: 58, borderRadius: 14 }} />
    Nexor Barber
  </div>
);

/* Tela do sistema inteira, numa moldura de navegador: nada é cortado.
   Zoom bem lento (1,00 → 1,035) durante a cena, só para dar vida. */
type Foco = { x: number; y: number; escala: number };
const Tela: React.FC<{ src: string; titulo: React.ReactNode; duracao: number; foco: Foco }> = ({ src, titulo, duracao, foco }) => {
  const f = useCurrentFrame();
  const entradaTitulo = useEntrada(0);
  const entradaTela = useEntrada(6);
  const saida = useSaida(duracao);
  /* A tela aparece inteira; depois de 35% da cena aproxima devagar (1,4 s) a parte citada na fala */
  const inicio = Math.round(duracao * 0.35);
  const zoom = interpolate(f, [inicio, inicio + 42], [1, foco.escala], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const LARGURA = 1000; // tela 1600×1000 → 1000×625, mais a barra do navegador
  return (
    <AbsoluteFill style={{ opacity: saida }}>
      <div
        style={{
          position: "absolute",
          top: 300,
          left: 72,
          right: 72,
          fontFamily: "Space Grotesk",
          fontWeight: 600,
          fontSize: 76,
          lineHeight: 1.12,
          letterSpacing: "-0.015em",
          color: COR.gelo,
          ...entradaTitulo,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          position: "absolute",
          top: 600,
          left: (1080 - LARGURA) / 2,
          width: LARGURA,
          borderRadius: 26,
          overflow: "hidden",
          background: "rgba(10,22,48,0.6)",
          border: "1.5px solid rgba(120,170,255,0.28)",
          boxShadow: "0 40px 90px rgba(0,0,0,0.5)",
          ...entradaTela,
        }}
      >
        <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: "rgba(255,255,255,0.06)" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.85 }} />
          ))}
        </div>
        <div style={{ width: LARGURA, height: (LARGURA * 1000) / 1600, overflow: "hidden" }}>
          <Img
            src={staticFile(src)}
            style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${zoom})`, transformOrigin: `${foco.x}% ${foco.y}%` }}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 600 + 44 + (LARGURA * 1000) / 1600 + 22,
          width: "100%",
          textAlign: "center",
          fontFamily: "Inter",
          fontWeight: 500,
          fontSize: 26,
          color: COR.suave,
          ...entradaTela,
        }}
      >
        Tela real do sistema · dados fictícios
      </div>
    </AbsoluteFill>
  );
};

const Destaque: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      background: `linear-gradient(90deg, ${COR.azulClaro}, ${COR.ciano})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    }}
  >
    {children}
  </span>
);

const Gancho: React.FC<{ duracao: number }> = ({ duracao }) => {
  const f = useCurrentFrame();
  const e = useEntrada(0);
  const saida = useSaida(duracao);
  const toque = Math.sin(f / 2.2) * interpolate(f, [0, 40], [6, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 72px", opacity: saida }}>
      <div style={{ fontSize: 150, width: 170, marginBottom: 30, opacity: e.opacity, transform: `${e.transform} rotate(${toque}deg)` }}>📞</div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 104, lineHeight: 1.06, letterSpacing: "-0.02em", color: COR.gelo, ...e }}>
        Parou o corte pra <Destaque>atender o telefone?</Destaque>
      </div>
    </AbsoluteFill>
  );
};

const Frase: React.FC<{ duracao: number; segundaEm: number }> = ({ duracao, segundaEm }) => {
  const a = useEntrada(0);
  const b = useEntrada(segundaEm);
  const saida = useSaida(duracao);
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 72px", opacity: saida }}>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 120, lineHeight: 1.05, letterSpacing: "-0.02em", color: COR.gelo }}>
        <div style={a}>Você corta.</div>
        <div style={b}>
          <Destaque>O sistema cuida do resto.</Destaque>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Final: React.FC = () => {
  const a = useEntrada(0);
  const b = useEntrada(10);
  const c = useEntrada(22);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 72px" }}>
      <Img src={staticFile("logo-lockup.webp")} style={{ width: 640, ...a }} />
      <div style={{ marginTop: 80, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 92, lineHeight: 1.08, color: COR.gelo, ...b }}>
        Teste grátis por <Destaque>30 dias</Destaque>
      </div>
      <div
        style={{
          marginTop: 56,
          padding: "26px 54px",
          borderRadius: 999,
          background: `linear-gradient(135deg, ${COR.azul}, #00b4ff)`,
          boxShadow: "0 18px 50px rgba(0,88,250,0.5)",
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 46,
          color: "#fff",
          ...c,
        }}
      >
        Link na bio →
      </div>
      <div style={{ marginTop: 48, fontFamily: "Inter", fontWeight: 500, fontSize: 34, color: COR.suave, ...c }}>
        nexorconsultingit.com.br · IA com cuidado humano
      </div>
    </AbsoluteFill>
  );
};

/* Legenda queimada, sempre dentro da área segura do 9:16 */
const Legenda: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps - ATRASO;
  const atual = LEGENDAS.find((l) => t >= l.de - 0.05 && t <= l.ate + 0.25);
  if (!atual || atual.oculta) return null;
  const op = interpolate(t, [atual.de - 0.05, atual.de + 0.15, atual.ate + 0.05, atual.ate + 0.25], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", bottom: 300, left: 72, right: 72, display: "flex", justifyContent: "center", opacity: op }}>
      <div
        style={{
          maxWidth: 900,
          padding: "20px 32px",
          borderRadius: 22,
          background: "rgba(1,5,36,0.72)",
          border: "1px solid rgba(120,170,255,0.22)",
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 46,
          lineHeight: 1.3,
          color: "#fff",
          textAlign: "center",
        }}
      >
        {atual.texto}
      </div>
    </div>
  );
};

/* Cenas, nos tempos da locução */
const CENAS = [
  { de: 0, ate: s(2.17), el: (d: number) => <Gancho duracao={d} /> },
  {
    de: s(2.17),
    ate: s(5.92),
    el: (d: number) => (
      <Tela src="barber/app-agendar.webp" foco={{ x: 50, y: 30, escala: 1.55 }} duracao={d} titulo={<>O cliente agenda <Destaque>em um toque.</Destaque></>} />
    ),
  },
  {
    de: s(5.92),
    ate: s(9.61),
    el: (d: number) => (
      <Tela src="barber/agenda.webp" foco={{ x: 40, y: 45, escala: 1.6 }} duracao={d} titulo={<>Lembrete no WhatsApp e <Destaque>lista de espera.</Destaque></>} />
    ),
  },
  {
    de: s(9.61),
    ate: s(11.91),
    el: (d: number) => <Tela src="barber/clube.webp" foco={{ x: 18, y: 32, escala: 1.75 }} duracao={d} titulo={<>Clube de <Destaque>assinatura.</Destaque></>} />,
  },
  {
    de: s(11.91),
    ate: s(15.25),
    el: (d: number) => (
      <Tela src="barber/caixa.webp" foco={{ x: 40, y: 38, escala: 1.6 }} duracao={d} titulo={<>Caixa e comissões <Destaque>já fechados.</Destaque></>} />
    ),
  },
  { de: s(15.25), ate: s(17.94), el: (d: number) => <Frase duracao={d} segundaEm={s(16.4) - s(15.25)} /> },
  { de: s(17.94), ate: DURACAO, el: () => <Final /> },
];

export const NexorBarber: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: COR.navy }}>
    <Fundo />
    <Marca />
    {CENAS.map((c, i) => (
      <Sequence key={i} from={c.de} durationInFrames={c.ate - c.de} layout="none">
        {c.el(c.ate - c.de)}
      </Sequence>
    ))}
    <Legenda />
    <Sequence from={s(0)} layout="none">
      <Audio src={staticFile("barber/locucao.mp3")} />
    </Sequence>
  </AbsoluteFill>
);
