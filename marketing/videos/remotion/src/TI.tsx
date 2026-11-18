/* Vídeo da linha de TI (16:9, 1920×1080): Service Desk, inventário, ações remotas, painel, TV, Cofre e IT Platform.
   Mesmo padrão do institucional: uma cena por frase, troca nas pausas reais da locução, peças em Institucional.tsx.
   Roteiro: marketing/videos/roteiros/15-ti-2026.md */
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ATRASO } from "./VideoProduto";
import { COR, FPS, GRAD, VERDE, VIDRO, TXT, Rico, Check, Contador, entre, pop, quadro, useMola, useVoz, Voz } from "./kit";
import { Cena, Titulo, Fundo, Poeira, Linha, ProdutoVivo, ProdutoTela, C12, C13, Legenda, useMolaFixa } from "./Institucional";
import TEMPOS from "./tempos/ti";
import FALAS from "./tempos/ti.frases.json";

const PASTA = "ti";
const CAUDA = 3.2;
export const duracaoTI = Math.round((ATRASO + TEMPOS.frases[TEMPOS.frases.length - 1][1] + CAUDA) * FPS);
const VERMELHO = "#ef4444";
const LARANJA = "#f59e0b";

// 1 · Oito da manhã e o telefone não para
const AVISOS = [
  { i: "📞", t: "Ramal 214 chamando", c: VERMELHO },
  { i: "💬", t: "“A impressora parou!”", c: VERDE },
  { i: "📧", t: "Senha expirada · Financeiro", c: COR.azulClaro },
  { i: "📞", t: "Ramal 108 chamando", c: VERMELHO },
  { i: "💬", t: "“O sistema caiu?”", c: VERDE },
  { i: "📧", t: "Sem acesso à pasta", c: COR.azulClaro },
];
const T1: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const min = Math.floor(interpolate(f, [0, d], [0, 14]));
  const toca = Math.sin(f * 1.6) * 10 * (Math.floor(f / 18) % 2);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 180, top: 260, textAlign: "center" }}>
        <div style={{ ...TXT(200, 700), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>08:{String(min).padStart(2, "0")}</div>
        <div style={{ fontSize: 190, marginTop: 10, transform: `rotate(${toca}deg)` }}>☎️</div>
        <div style={{ ...TXT(40, 500, COR.suave), marginTop: 10 }}>segunda-feira, na TI</div>
      </div>
      <div style={{ position: "absolute", right: 170, top: 150, width: 720, display: "flex", flexDirection: "column", gap: 18 }}>
        {AVISOS.map((a, k) => {
          const de = Math.round(6 + k * (d * 0.12));
          return (
            <Linha key={k} de={de}>
              <div style={{ fontSize: 46 }}>{a.i}</div>
              <div style={{ flex: 1, ...TXT(36, 600) }}>{a.t}</div>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: a.c, opacity: 0.5 + 0.5 * Math.abs(Math.sin((f + k * 7) / 5)), boxShadow: `0 0 18px ${a.c}` }} />
            </Linha>
          );
        })}
      </div>
    </Cena>
  );
};

// 2 · Pedidos por todo lado, urgente atrás do simples
const FILA = [
  { t: "Trocar mouse", c: "rgba(255,255,255,0.35)" },
  { t: "Papel de parede", c: "rgba(255,255,255,0.35)" },
  { t: "Instalar fonte", c: "rgba(255,255,255,0.35)" },
  { t: "SERVIDOR CAIU", c: VERMELHO },
];
const T2: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const canais = [
    { i: "💬", t: "WhatsApp" },
    { i: "🚶", t: "Corredor" },
    { i: "📧", t: "E-mail" },
  ];
  const meio = Math.round(d * 0.45);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 120, display: "flex", gap: 40 }}>
        {canais.map((c, k) => {
          const p = useMolaFixa(k * 8);
          return (
            <div key={c.t} style={{ ...VIDRO, width: 330, padding: "28px 0", textAlign: "center", ...pop(p, 40), transform: `${pop(p, 40).transform} translateY(${Math.sin((f + k * 15) / 10) * 6}px)` }}>
              <div style={{ fontSize: 70 }}>{c.i}</div>
              <div style={{ ...TXT(40, 700), marginTop: 8 }}>{c.t}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 470, ...TXT(34, 600, COR.suave), opacity: entre(f, meio - 10, meio) }}>A fila de hoje</div>
      <div style={{ position: "absolute", top: 540, display: "flex", gap: 22, alignItems: "center" }}>
        {FILA.map((x, k) => {
          const de = meio + k * 7;
          const p = useMolaFixa(de);
          const urg = x.c === VERMELHO;
          const pisca = urg ? 0.6 + 0.4 * Math.abs(Math.sin(f / 4)) : 1;
          return (
            <div key={x.t} style={{ ...VIDRO, borderRadius: 22, padding: "30px 30px", width: 330, borderColor: urg ? VERMELHO : undefined, boxShadow: urg ? `0 0 ${40 * pisca}px rgba(239,68,68,0.7)` : VIDRO.boxShadow, opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * -300}px)` }}>
              <div style={{ ...TXT(22, 700, urg ? VERMELHO : COR.suave), letterSpacing: "0.15em" }}>{urg ? "URGENTE · 4º NA FILA" : `${k + 1}º NA FILA`}</div>
              <div style={{ ...TXT(urg ? 40 : 36, 700, urg ? "#fecaca" : COR.gelo), marginTop: 10 }}>{x.t}</div>
            </div>
          );
        })}
      </div>
    </Cena>
  );
};

// 3 · Ninguém sabe quantas máquinas existem; reiniciar custa uma caminhada
const T3: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const meio = Math.round(d * 0.5);
  const passos = entre(f, meio, d - 6);
  const mesas = [0, 1, 2, 3, 4];
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center" }}>
        <div style={{ ...TXT(84, 700), letterSpacing: "-0.03em" }}>
          Quantos computadores? <span style={{ color: LARANJA }}>{["37", "52", "??", "41", "60", "??"][Math.floor(f / 7) % 6]}</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 300, display: "grid", gridTemplateColumns: "repeat(8, 120px)", gap: 26, opacity: 1 - entre(f, meio - 6, meio + 6) * 0.6 }}>
        {new Array(16).fill(0).map((_, k) => {
          const on = Math.sin(f / 6 + k * 1.7) > 0;
          return (
            <div key={k} style={{ height: 96, borderRadius: 14, ...VIDRO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, opacity: on ? 1 : 0.35, transform: `scale(${useMolaFixa(k * 1.5)})` }}>
              {k % 5 === 2 ? "❓" : "🖥️"}
            </div>
          );
        })}
      </div>
      {/* caminhada de mesa em mesa */}
      <div style={{ position: "absolute", top: 680, left: 260, width: 1400, height: 160, opacity: entre(f, meio - 4, meio + 6) }}>
        <svg width={1400} height={160} style={{ position: "absolute" }}>
          <path d="M20 120 C 200 20, 330 20, 360 110 S 600 160, 700 60 S 1000 20, 1060 110 S 1300 140, 1380 60" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={4} strokeDasharray="10 16" strokeDashoffset={-f * 2} />
        </svg>
        {mesas.map((k) => (
          <div key={k} style={{ position: "absolute", left: 20 + k * 340 - 40, top: 60, fontSize: 60 }}>🖥️</div>
        ))}
        <div style={{ position: "absolute", left: 20 + passos * 1340 - 30, top: -10 + Math.abs(Math.sin(f / 3)) * -10, fontSize: 70 }}>🚶</div>
        <div style={{ position: "absolute", right: 0, top: -80, ...TXT(40, 700, LARANJA) }}>
          <Contador q0={meio} q1={d} ate={1.8} formato={(n) => `${n.toFixed(1).replace(".", ",")} km hoje`} />
        </div>
      </div>
    </Cena>
  );
};

// 4 · A Nexor criou o Service Desk
const T4: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(4, { damping: 12, mass: 0.9 });
  const b = useMola(22);
  const brilho = interpolate(f, [0, 18, 50], [0, 1, 0.35], { extrapolateRight: "clamp" });
  const itens = ["Chamados", "Inventário", "Ações remotas", "Painel e TV", "Cofre", "IT Platform"];
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", width: 1600, height: 6, background: GRAD, opacity: brilho, filter: "blur(4px)", transform: `scaleX(${entre(f, 0, 22)})` }} />
      <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,225,251,0.35), transparent 65%)", opacity: brilho, transform: `scale(${0.5 + a * 0.7})` }} />
      <Poeira n={50} />
      <div style={{ textAlign: "center" }}>
        <Img src={staticFile("logo-mark.webp")} style={{ width: 190, height: 190, borderRadius: 42, transform: `scale(${a}) rotate(${(1 - a) * -30}deg)`, boxShadow: `0 0 ${60 + brilho * 80}px rgba(0,225,251,0.55)` }} />
        <div style={{ ...TXT(120, 700), marginTop: 40, letterSpacing: "-0.03em", ...pop(b) }}>Nexor <Rico texto="*Service* *Desk*" /></div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 36 }}>
          {itens.map((t, k) => {
            const p = useMolaFixa(30 + k * 5);
            return <div key={t} style={{ ...VIDRO, borderRadius: 999, padding: "14px 26px", ...TXT(30, 600), ...pop(p, 30) }}>{t}</div>;
          })}
        </div>
      </div>
    </Cena>
  );
};

// 5, 6, 7 · telas reais com câmera viva
const SD: Record<string, ProdutoTela> = {
  chamados: { nome: "Chamados", sub: "prioridade e prazo justo", img: "ti/chamados.webp", fx: 0.52, fy: 0.42, cor: COR.azulClaro, destaques: [{ icone: "🔴", txt: "Crítico · resolver em 45 min", lado: "d", y: 0.14 }, { icone: "⏸️", txt: "Prazo pausado: aguardando usuário", lado: "e", y: 0.7 }] },
  inventario: { nome: "Inventário", sub: "cada computador, ao vivo", img: "ti/inventario.webp", fx: 0.72, fy: 0.52, cor: VERDE, destaques: [{ icone: "🔄", txt: "Reiniciar REC-PC01 · feito", lado: "e", y: 0.16 }, { icone: "🔐", txt: "Aprovado pelo gestor", lado: "d", y: 0.74 }] },
  painel: { nome: "Painel", sub: "números para a diretoria", img: "ti/painel.webp", fx: 0.42, fy: 0.42, cor: "#a78bfa", destaques: [{ icone: "📈", txt: "312 chamados no mês", lado: "d", y: 0.14 }, { icone: "⏱️", txt: "Tempo médio: 3 h 40", lado: "e", y: 0.72 }] },
  tv: { nome: "TV da equipe", sub: "a fila ao vivo", img: "ti/tv.webp", fx: 0.5, fy: 0.45, cor: COR.ciano, destaques: [{ icone: "📺", txt: "Atualiza sozinha", lado: "d", y: 0.14 }, { icone: "✅", txt: "9 resolvidos hoje", lado: "e", y: 0.72 }] },
};
const TelaViva: React.FC<{ d: number; p: ProdutoTela }> = ({ d, p }) => <ProdutoVivo p={p} slot={d - 6} />;
/* cena com duas telas: troca na pausa do meio da frase (segundos da locução) */
const DuasTelas: React.FC<{ d: number; inicio: number; troca: number; a: ProdutoTela; b: ProdutoTela }> = ({ d, inicio, troca, a, b }) => {
  const m = quadro(troca) - inicio;
  return (
    <>
      <Sequence from={0} durationInFrames={m + 10} layout="none"><ProdutoVivo p={a} slot={m} /></Sequence>
      <Sequence from={m} durationInFrames={d - m} layout="none"><ProdutoVivo p={b} slot={d - m - 6} /></Sequence>
    </>
  );
};

// 8 · Cofre de senhas
const SENHAS = [
  { n: "Servidor AD", u: "administrador" },
  { n: "Firewall", u: "admin" },
  { n: "Wi-Fi Diretoria", u: "—" },
  { n: "ERP · admin", u: "suporte" },
];
const LOG = ["Ana Souza viu Firewall · 09:12", "Bruno Alves copiou Wi-Fi · 09:40", "Rafael Costa editou ERP · 10:05"];
const T8: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const roxo = "#a78bfa";
  const porta = useMola(4, { damping: 12, mass: 0.8 });
  const abre = entre(f, 8, 26);
  const revela = Math.round(d * 0.35);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 140, top: 330 }}>
        <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: `${roxo}26`, border: `1.5px solid ${roxo}`, ...TXT(24, 700, roxo), letterSpacing: "0.18em" }}>NEXOR</div>
        <div style={{ ...TXT(110, 700), letterSpacing: "-0.03em", marginTop: 14 }}>Cofre</div>
        <div style={{ ...TXT(40, 500, COR.suave), marginTop: 8 }}>senhas protegidas,<br />com histórico</div>
      </div>
      <div style={{ position: "absolute", left: 780, top: 150, width: 1000, ...VIDRO, borderColor: `${roxo}88`, padding: 40, transform: `perspective(1800px) rotateY(${-14 + abre * 8}deg) scale(${0.85 + porta * 0.15})`, opacity: porta }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ fontSize: 54, transform: `rotate(${(1 - abre) * -90}deg)` }}>{abre >= 1 ? "🔓" : "🔒"}</div>
          <div style={{ ...TXT(40, 700) }}>Senhas da TI</div>
          <div style={{ marginLeft: "auto", ...TXT(24, 600, roxo) }}>criptografado</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
          {SENHAS.map((s, k) => {
            const p = useMolaFixa(14 + k * 5);
            const aberto = k === 1 && f > revela && f < revela + 40;
            return (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 22px", borderRadius: 16, background: aberto ? `${roxo}22` : "rgba(255,255,255,0.05)", border: `1.5px solid ${aberto ? roxo : "transparent"}`, opacity: p, transform: `translateX(${(1 - p) * 80}px)` }}>
                <div style={{ fontSize: 30 }}>🔑</div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...TXT(30, 700) }}>{s.n}</div>
                  <div style={{ ...TXT(22, 500, COR.suave) }}>{s.u}</div>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 30, color: aberto ? "#fff" : COR.suave, letterSpacing: aberto ? "0.05em" : "0.2em" }}>{aberto ? "Fw#9q!x2Lp" : "••••••••••"}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ ...TXT(24, 700, roxo), letterSpacing: "0.12em" }}>HISTÓRICO</div>
          {LOG.map((l, k) => {
            const de = revela + 10 + k * 12;
            return <div key={l} style={{ ...TXT(26, 500, COR.gelo), marginTop: 10, opacity: entre(f, de, de + 8), transform: `translateY(${(1 - entre(f, de, de + 8)) * 14}px)` }}>• {l}</div>;
          })}
        </div>
      </div>
    </Cena>
  );
};

// 9 · IT Platform: radar que encontra aparelhos e avisa
const APARELHOS = [
  { a: 20, r: 0.55, t: "Impressora", i: "🖨️" },
  { a: 75, r: 0.8, t: "Switch", i: "🔀" },
  { a: 130, r: 0.45, t: "Câmera", i: "📷" },
  { a: 180, r: 0.75, t: "Notebook", i: "💻" },
  { a: 235, r: 0.6, t: "SRV-ARQ01", i: "🗄️", alerta: true },
  { a: 290, r: 0.85, t: "Roteador", i: "📡" },
  { a: 335, r: 0.4, t: "PC Recepção", i: "🖥️" },
];
const T9: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const ang = (f * 4) % 360;
  const R = 330, cx = 1240, cy = 540;
  const verde = "#22c55e";
  const alertaDe = Math.round(d * 0.55);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 140, top: 300, width: 560 }}>
        <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: `${verde}26`, border: `1.5px solid ${verde}`, ...TXT(24, 700, verde), letterSpacing: "0.18em" }}>NEXOR</div>
        <div style={{ ...TXT(100, 700), letterSpacing: "-0.03em", marginTop: 14 }}>IT Platform</div>
        <div style={{ ...TXT(40, 500, COR.suave), marginTop: 8 }}>cada aparelho da rede,<br />com alerta antes da parada</div>
        <div style={{ ...TXT(56, 700), marginTop: 30 }}><Contador q0={6} q1={alertaDe} ate={58} /> <span style={{ ...TXT(32, 500, COR.suave) }}>online</span></div>
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <defs>
          <radialGradient id="rg"><stop offset="0" stopColor="rgba(34,197,94,0.18)" /><stop offset="1" stopColor="rgba(34,197,94,0.02)" /></radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="url(#rg)" stroke="rgba(34,197,94,0.4)" strokeWidth={2} />
        {[0.33, 0.66].map((k) => <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke="rgba(34,197,94,0.22)" strokeWidth={1.5} />)}
        <path d={`M${cx},${cy} L${cx + R * Math.cos(((ang - 40) * Math.PI) / 180)},${cy + R * Math.sin(((ang - 40) * Math.PI) / 180)} A${R},${R} 0 0,1 ${cx + R * Math.cos((ang * Math.PI) / 180)},${cy + R * Math.sin((ang * Math.PI) / 180)} Z`} fill="rgba(34,197,94,0.28)" />
        <line x1={cx} y1={cy} x2={cx + R * Math.cos((ang * Math.PI) / 180)} y2={cy + R * Math.sin((ang * Math.PI) / 180)} stroke={verde} strokeWidth={3} />
      </svg>
      {APARELHOS.map((x, k) => {
        const de = Math.round(((x.a / 360) * 90) % 90) + 4;
        const p = useMolaFixa(de);
        const alerta = x.alerta && f > alertaDe;
        const px = cx + R * x.r * Math.cos((x.a * Math.PI) / 180);
        const py = cy + R * x.r * Math.sin((x.a * Math.PI) / 180);
        return (
          <div key={x.t} style={{ position: "absolute", left: px - 34, top: py - 34, transform: `scale(${p})`, textAlign: "center" }}>
            <div style={{ width: 68, height: 68, borderRadius: 34, background: alerta ? "rgba(245,158,11,0.25)" : "rgba(34,197,94,0.2)", border: `3px solid ${alerta ? LARANJA : verde}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, boxShadow: alerta ? `0 0 ${30 + Math.sin(f / 3) * 15}px ${LARANJA}` : "none" }}>{x.i}</div>
            <div style={{ ...TXT(20, 600, COR.gelo), marginTop: 6, whiteSpace: "nowrap", transform: "translateX(-25%)" }}>{x.t}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", right: 90, top: 150, ...VIDRO, borderColor: LARANJA, padding: "22px 30px", display: "flex", gap: 18, alignItems: "center", ...pop(useMola(alertaDe + 4, { damping: 10, mass: 0.6 }), 30) }}>
        <div style={{ fontSize: 44 }}>⚠️</div>
        <div>
          <div style={{ ...TXT(30, 700, "#fde68a") }}>SRV-ARQ01 · disco em 91%</div>
          <div style={{ ...TXT(24, 500, COR.suave), marginTop: 4 }}>aviso enviado para a TI</div>
        </div>
      </div>
    </Cena>
  );
};

// 10 · No seu servidor, testado pela banca de teste de intrusão
const T10: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const meio = Math.round(d * 0.45);
  const escudo = useMola(meio, { damping: 10, mass: 0.8 });
  const varre = (f % 60) / 60;
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", left: 230, top: 200, textAlign: "center" }}>
        <div style={{ width: 380, ...VIDRO, padding: 26, display: "flex", flexDirection: "column", gap: 14, ...pop(useMola(2), 40) }}>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ height: 70, borderRadius: 12, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 14, padding: "0 20px" }}>
              {[0, 1, 2].map((j) => <div key={j} style={{ width: 14, height: 14, borderRadius: 7, background: (f + k * 5 + j * 3) % 20 < 12 ? VERDE : "rgba(34,197,94,0.25)", boxShadow: `0 0 10px ${VERDE}` }} />)}
              <div style={{ marginLeft: "auto", width: 120, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.15)" }} />
            </div>
          ))}
        </div>
        <div style={{ ...TXT(48, 700), marginTop: 30 }}>No seu servidor</div>
        <div style={{ ...TXT(30, 500, COR.suave), marginTop: 6 }}>seus dados ficam com você</div>
      </div>
      <div style={{ position: "absolute", right: 200, top: 190, textAlign: "center", opacity: escudo }}>
        <svg width={380} height={440} viewBox="0 0 100 118" style={{ transform: `scale(${escudo})`, filter: "drop-shadow(0 0 40px rgba(0,225,251,0.5))" }}>
          <defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={COR.azul} /><stop offset="1" stopColor={COR.ciano} /></linearGradient></defs>
          <path d="M50 2 L94 18 V56 C94 86 74 106 50 116 C26 106 6 86 6 56 V18 Z" fill="rgba(0,88,250,0.18)" stroke="url(#g2)" strokeWidth={3} />
          <rect x={8} y={8 + varre * 100} width={84} height={2.5} fill={COR.ciano} opacity={0.8} />
          <text x={50} y={70} textAnchor="middle" fontSize={34}>✓</text>
        </svg>
        <div style={{ ...TXT(48, 700), marginTop: 20 }}>Banca de teste de <Rico texto="*intrusão*" /></div>
        <div style={{ ...TXT(30, 500, COR.suave), marginTop: 6 }}>para eliminar qualquer risco</div>
      </div>
    </Cena>
  );
};

// 11 · A gente instala, importa e treina
const PASSOS = [
  { i: "🛠️", t: "Instala", s: "no seu servidor" },
  { i: "📥", t: "Importa", s: "o que você já tem" },
  { i: "🎓", t: "Treina", s: "a sua equipe" },
];
const T11: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center" }}>
        <Titulo texto="Gente que *cuida* junto com você" tam={88} />
      </div>
      <div style={{ display: "flex", gap: 46, marginTop: 120 }}>
        {PASSOS.map((e, i) => {
          const de = Math.round(d * (0.18 + i * 0.2));
          const p = useMolaFixa(de);
          const barra = entre(f, de + 6, de + 36);
          return (
            <div key={e.t} style={{ ...VIDRO, width: 440, padding: "44px 34px", textAlign: "center", ...pop(p, 80), borderColor: barra >= 1 ? "rgba(34,197,94,0.7)" : undefined }}>
              <div style={{ fontSize: 96, transform: `translateY(${Math.sin((f + i * 10) / 12) * 6}px)` }}>{e.i}</div>
              <div style={{ ...TXT(52, 700), marginTop: 16 }}>{e.t}</div>
              <div style={{ ...TXT(30, 500, COR.suave), marginTop: 6 }}>{e.s}</div>
              <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.1)", marginTop: 26, overflow: "hidden" }}>
                <div style={{ width: `${barra * 100}%`, height: "100%", background: barra >= 1 ? VERDE : GRAD }} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 18, height: 60 }}>{barra >= 1 ? <Check atraso={de + 36} tam={60} /> : null}</div>
            </div>
          );
        })}
      </div>
    </Cena>
  );
};

/* ---------- vídeo ---------- */
/* Segundos da locução onde o painel dá lugar à TV (pausa no meio da frase 7) */
const TROCA_TV = 39.55; /* medido com silencedetect na locução atual */

const CENAS: ((d: number, voz: Voz, de: number) => React.ReactNode)[] = [
  (d) => <T1 d={d} />,
  (d) => <T2 d={d} />,
  (d) => <T3 d={d} />,
  (d) => <T4 d={d} />,
  (d) => <TelaViva d={d} p={SD.chamados} />,
  (d) => <TelaViva d={d} p={SD.inventario} />,
  (d, _v, de) => <DuasTelas d={d} inicio={de} troca={TROCA_TV} a={SD.painel} b={SD.tv} />,
  (d) => <T8 d={d} />,
  (d) => <T9 d={d} />,
  (d) => <T10 d={d} />,
  (d) => <T11 d={d} />,
  (d) => <C12 d={d} />,
  (d) => <C13 d={d} />,
];

export const VideoTI: React.FC = () => {
  const voz = useVoz(PASTA);
  const f = useCurrentFrame();
  const total = duracaoTI;
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
        Nexor Consulting · TI
      </div>
      <Legenda esconder={[3, 12]} falas={FALAS as string[]} tempos={TEMPOS} />
      <Audio src={staticFile(`${PASTA}/trilha.wav`)} volume={(q) => interpolate(q, [0, 30, total - 60, total], [0, 0.32, 0.32, 0], { extrapolateRight: "clamp" })} />
      <Sequence from={quadro(0)} layout="none">
        <Audio src={staticFile(`${PASTA}/locucao.mp3`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
