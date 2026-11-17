/* Nexor Elo (para o instalador) · vídeo animado (padrão da Blue). Lojas, clientes e valores fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/elo";
import { COR, Cartao, Celular, CenaFinal, CenaGancho, Cena, Check, Chip, Entra, GRAD, GRAD_BOTAO, Rico, TXT, Toque, VideoAnimado, entre, pop, reais, useMola } from "../kit";

const FALAS = [
  "Instalador, você ainda compra o material antes, e fica esperando o cliente pagar?",
  "No Nexor Elo, o orçamento já sai com o estoque da loja.",
  "A calculadora mostra os impostos e o seu lucro antes de enviar.",
  "O cliente aceita e paga no link, no Pix, no boleto ou no cartão.",
  "E o dinheiro já cai dividido: o material para a loja, o serviço para você.",
  "E a loja não vê o seu cliente.",
  "Comece grátis. O link está na bio.",
];

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};

/* 0 · Caixa do instalador escorrendo enquanto espera o cliente */
const CaixaEscorrendo: React.FC = () => {
  const f = useCurrentFrame();
  const v = entre(f, 20, 100, 3200, 412);
  const dias = Math.round(entre(f, 20, 100, 0, 12));
  return (
    <div style={{ marginTop: 60, padding: "34px 40px", borderRadius: 34, background: "rgba(14,30,66,0.62)", border: "1.5px solid rgba(239,68,68,0.5)" }}>
      <div style={{ ...TXT(32, 600, COR.suave) }}>💸 Seu caixa</div>
      <div style={{ ...TXT(100), color: v < 1000 ? "#f87171" : COR.gelo }}>{reais(Math.round(v * 100) / 100)}</div>
      <div style={{ ...TXT(32, 500, COR.suave) }}>⏳ esperando o cliente pagar há <b style={{ color: "#fbbf24" }}>{dias} dias</b></div>
    </div>
  );
};

/* 1 · Orçamento montado com o estoque da loja */
const CenaOrcamento: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const itens: [string, number, string][] = [["Câmera bullet 1080p", 4, "R$ 639,60"], ["DVR 4 canais", 1, "R$ 389,00"], ["Cabo coaxial 100 m", 1, "R$ 219,00"], ["Fonte 12V 10A", 1, "R$ 98,00"]];
  return (
    <Cena d={d}>
      <Titulo texto="Orçamento com *o estoque da loja.*" />
      <Entra atraso={0} y={60} estilo={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Celular largura={660} altura={860}>
          <div style={{ position: "absolute", inset: 0, paddingTop: 80, background: "#f4f7fc" }}>
            <div style={{ padding: "0 30px", fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 44, color: "#0b1733" }}>Nova proposta</div>
            <div style={{ padding: "6px 30px 18px", fontFamily: "Inter", fontWeight: 500, fontSize: 26, color: "#5b6b88" }}>CFTV 4 câmeras · Distribuidora Vigia Forte</div>
            {itens.map(([n, q, v], i) => {
              const p = entre(f, 8 + i * 11, 18 + i * 11);
              return (
                <div key={n} style={{ margin: "0 22px 14px", padding: "20px 22px", borderRadius: 22, background: "#fff", boxShadow: "0 6px 18px rgba(11,23,51,0.07)", opacity: p, transform: `translateX(${(1 - p) * 120}px)` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Inter", fontWeight: 600, fontSize: 29, color: "#0b1733" }}>
                    <span>{q}× {n}</span>
                    <span>{v}</span>
                  </div>
                  <div style={{ marginTop: 8, fontFamily: "Inter", fontWeight: 600, fontSize: 23, color: "#16a34a" }}>✓ em estoque · reservado 5 dias</div>
                </div>
              );
            })}
          </div>
        </Celular>
      </Entra>
    </Cena>
  );
};

/* 2 · Calculadora: impostos e lucro antes de enviar */
const CenaCalculadora: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const linhas: [string, number][] = [["Material", 1345.6], ["Mão de obra", 1500], ["Simples Nacional (6%)", -170.74], ["Taxa do pagamento", -59.2]];
  const lucro = 1270.06;
  return (
    <Cena d={d}>
      <Titulo texto="Impostos e lucro *antes de enviar.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 420, left: 60, right: 60 }}>
        <div style={{ ...TXT(36, 600, COR.suave), marginBottom: 12 }}>🧮 Calculadora</div>
        {linhas.map(([n, v], i) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", ...TXT(36, 500), opacity: entre(f, 4 + i * 6, 12 + i * 6) }}>
            <span>{n}</span>
            <span style={{ color: v < 0 ? "#f87171" : COR.gelo }}>{v < 0 ? "− " : ""}{reais(Math.abs(Math.round(entre(f, 4 + i * 6, 30 + i * 6) * v * 100) / 100))}</span>
          </div>
        ))}
        <div style={{ marginTop: 16, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.15)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ ...TXT(40, 600, COR.suave) }}>Seu lucro</span>
          <span style={{ ...TXT(92), background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{reais(Math.round(entre(f, 30, 70) * lucro * 100) / 100)}</span>
        </div>
      </Cartao>
      <div style={{ position: "absolute", top: 1100, left: 60, right: 60, display: "flex", justifyContent: "center" }}>
        <Chip atraso={64} cor="#4ade80">✓ preço final: R$ 2.845,60</Chip>
      </div>
    </Cena>
  );
};

/* 3 · O cliente aceita e paga no link */
const CenaPagamento: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const formas = ["Pix", "Boleto", "Cartão 10×"];
  const sel = f < 40 ? -1 : 0;
  const pago = f >= 82;
  return (
    <Cena d={d}>
      <Titulo texto="O cliente aceita *e paga no link.*" />
      <Entra atraso={0} y={60} estilo={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Celular largura={660} altura={860}>
          <div style={{ position: "absolute", inset: 0, paddingTop: 80, background: "#f4f7fc", textAlign: "center" }}>
            <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 26, color: "#5b6b88" }}>Proposta #18 · Instala Seg</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 46, color: "#0b1733", marginTop: 8 }}>CFTV 4 câmeras</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 84, color: "#0058FA", marginTop: 14 }}>R$ 2.845,60</div>
            {!pago ? (
              <>
                <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 30 }}>
                  {formas.map((x, i) => (
                    <div key={x} style={{ position: "relative", padding: "20px 26px", borderRadius: 20, fontFamily: "Inter", fontWeight: 600, fontSize: 30, background: i === sel ? GRAD_BOTAO : "#fff", color: i === sel ? "#fff" : "#0b1733", boxShadow: "0 4px 12px rgba(11,23,51,0.08)" }}>
                      {x}
                      {i === 0 && <Toque em={40} />}
                    </div>
                  ))}
                </div>
                <div style={{ position: "relative", margin: "40px 40px 0", padding: "30px 0", borderRadius: 26, background: "#16a34a", fontFamily: "Inter", fontWeight: 600, fontSize: 38, color: "#fff" }}>
                  Aceitar e pagar
                  <Toque em={74} />
                </div>
              </>
            ) : (
              <div style={{ marginTop: 50 }}>
                <div style={{ display: "flex", justifyContent: "center" }}><Check atraso={82} tam={170} /></div>
                <div style={{ marginTop: 26, fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 52, color: "#0b1733" }}>Pago no Pix!</div>
              </div>
            )}
          </div>
        </Celular>
      </Entra>
    </Cena>
  );
};

/* 4 · O dinheiro cai dividido */
const CenaSplit: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(0);
  const div = entre(f, 20, 50);
  return (
    <Cena d={d}>
      <Titulo texto="O dinheiro *já cai dividido.*" />
      <div style={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `scale(${a})` }}>
        <div style={{ padding: "30px 60px", borderRadius: 999, background: GRAD_BOTAO, ...TXT(70, 600, "#fff"), boxShadow: "0 0 70px rgba(0,88,250,0.55)" }}>💰 R$ 2.845,60</div>
      </div>
      <svg width={1080} height={700} style={{ position: "absolute", top: 560, left: 0 }}>
        <path d="M540 0 C 540 180, 280 180, 280 320" stroke={COR.azulClaro} strokeWidth={10} fill="none" strokeDasharray="600" strokeDashoffset={600 - div * 600} />
        <path d="M540 0 C 540 180, 800 180, 800 320" stroke={COR.ciano} strokeWidth={10} fill="none" strokeDasharray="600" strokeDashoffset={600 - div * 600} />
      </svg>
      <div style={{ position: "absolute", top: 900, left: 50, right: 50, display: "flex", gap: 24 }}>
        {([["🏪", "Loja", "material", 1345.6], ["🧰", "Você", "serviço + lucro", 1500]] as [string, string, string, number][]).map(([ic, n, s, v], i) => (
          <Cartao key={n} atraso={44 + i * 6} destaque={i === 1} estilo={{ flex: 1, textAlign: "center", padding: "34px 20px" }}>
            <div style={{ fontSize: 80 }}>{ic}</div>
            <div style={{ ...TXT(44), marginTop: 8 }}>{n}</div>
            <div style={{ ...TXT(28, 500, COR.suave) }}>{s}</div>
            <div style={{ ...TXT(52), marginTop: 14, color: i === 1 ? COR.ciano : COR.gelo }}>{reais(Math.round(entre(f, 50, 90) * v * 100) / 100)}</div>
          </Cartao>
        ))}
      </div>
    </Cena>
  );
};

/* 5 · A loja não vê o seu cliente */
const CenaPrivacidade: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const borra = entre(f, 14, 34) * 14;
  const cad = useMola(30, { damping: 8, mass: 0.6 });
  return (
    <Cena d={d}>
      <Titulo texto="A loja *não vê o seu cliente.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 420, left: 60, right: 60 }}>
        <div style={{ ...TXT(32, 600, COR.suave) }}>🏪 O que a loja vê</div>
        {[["Instalador", "Instala Seg Araguari", false], ["Itens", "CFTV 4 câmeras", false], ["Cliente", "Maria Oliveira · (34) 9····", true], ["Endereço", "Rua das Flores, 120", true], ["Cidade", "Araguari/MG", false]].map(([k, v, oculto]) => (
          <div key={k as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ ...TXT(32, 500, COR.suave) }}>{k}</span>
            <span style={{ position: "relative", ...TXT(32, 600) }}>
              <span style={{ filter: oculto ? `blur(${borra}px)` : undefined }}>{v}</span>
              {oculto && f > 30 && <span style={{ position: "absolute", right: 0, top: -6, fontSize: 40, transform: `scale(${cad})` }}>🔒</span>}
            </span>
          </div>
        ))}
      </Cartao>
    </Cena>
  );
};

export const VideoElo: React.FC = () => (
  <VideoAnimado
    pasta="elo"
    nome="Nexor Elo"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[6]}
    cenas={[
      (d) => <CenaGancho d={d} icone="🧰" texto="Comprando material *antes de receber?*" extra={<CaixaEscorrendo />} />,
      (d) => <CenaOrcamento d={d} />,
      (d) => <CenaCalculadora d={d} />,
      (d) => <CenaPagamento d={d} />,
      (d) => <CenaSplit d={d} />,
      (d) => <CenaPrivacidade d={d} />,
      (_d, voz) => <CenaFinal voz={voz} icone="🔗" chamada="Comece *grátis*" botao="Link na bio →" />,
    ]}
  />
);
export const temposElo = tempos;
