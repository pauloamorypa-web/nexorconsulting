/* Nexor Agente · vídeo animado (padrão da Blue). Empresa, pessoas e valores fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/agente";
import { COR, Cartao, Celular, CenaFinal, CenaGancho, CenaManifesto, Cena, Check, Chip, DigitandoWhats, Entra, GRAD_BOTAO, MsgWhats, Orbe, Rico, TXT, TelaWhats, Toque, VERDE, VideoAnimado, entre, pop, useMola } from "../kit";

const FALAS = [
  "E se você pudesse perguntar para a sua empresa: quanto vendemos ontem?",
  "O Nexor Agente é a sua inteligência artificial no WhatsApp, ligada aos sistemas da empresa.",
  "Ele responde na hora, com as vendas e a meta de cada vendedor.",
  "Avisa o estoque que vai faltar, e quem parou de comprar.",
  "E quando é para agir, ele prepara e espera. Nada é feito sem o seu aprovar.",
  "Sua empresa no seu bolso. Você no comando.",
  "São só dez vagas de fundador. O link está na bio.",
];

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};

/* 0 · campo de mensagem com a pergunta sendo digitada */
const Pergunta: React.FC = () => {
  const f = useCurrentFrame();
  const t = "Quanto vendemos ontem?";
  const n = Math.round(entre(f, 20, 70) * t.length);
  return (
    <div style={{ marginTop: 70, display: "flex", gap: 18, alignItems: "center" }}>
      <div style={{ flex: 1, padding: "30px 40px", borderRadius: 999, background: "rgba(14,30,66,0.7)", border: "1.5px solid rgba(120,170,255,0.3)", ...TXT(42, 500) }}>
        {t.slice(0, n)}{f % 16 < 9 && <span style={{ color: COR.ciano }}>|</span>}
      </div>
      <div style={{ width: 104, height: 104, borderRadius: 52, background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, color: "#fff" }}>➤</div>
    </div>
  );
};

/* 1 · O Agente no centro, ligado aos sistemas da empresa */
const CenaConexoes: React.FC<{ d: number; energia: number }> = ({ d, energia }) => {
  const f = useCurrentFrame();
  const a = useMola(0, { damping: 11, mass: 0.8 });
  const nos: [string, string, number][] = [["💬", "WhatsApp", -90], ["🧾", "Vendas", -30], ["📦", "Estoque", 30], ["💰", "Financeiro", 90], ["👥", "Clientes", 150], ["📊", "Metas", 210]];
  const cx = 540;
  const cy = 860;
  const R = 340;
  return (
    <Cena d={d}>
      <Titulo texto="A IA da empresa *no WhatsApp.*" />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {nos.map(([, , ang], i) => {
          const x = cx + R * Math.cos((ang * Math.PI) / 180);
          const y = cy + R * Math.sin((ang * Math.PI) / 180);
          const p = entre(f, 10 + i * 5, 26 + i * 5);
          const t = ((f + i * 9) % 40) / 40;
          return (
            <g key={i} opacity={p}>
              <line x1={cx} y1={cy} x2={cx + (x - cx) * p} y2={cy + (y - cy) * p} stroke="rgba(0,225,251,0.45)" strokeWidth={4} strokeDasharray="10 10" />
              {p > 0.99 && <circle cx={cx + (x - cx) * t} cy={cy + (y - cy) * t} r={9} fill={COR.ciano} />}
            </g>
          );
        })}
      </svg>
      {nos.map(([ic, n, ang], i) => {
        const x = cx + R * Math.cos((ang * Math.PI) / 180);
        const y = cy + R * Math.sin((ang * Math.PI) / 180);
        const p = useMolaNo(16 + i * 5);
        return (
          <div key={n} style={{ position: "absolute", left: x - 95, top: y - 95, width: 190, height: 190, borderRadius: 40, background: "rgba(14,30,66,0.85)", border: "1.5px solid rgba(120,170,255,0.35)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, transform: `scale(${p})` }}>
            <div style={{ fontSize: 70 }}>{ic}</div>
            <div style={{ ...TXT(28, 600) }}>{n}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: cx - 130, top: cy - 130, transform: `scale(${a})` }}>
        <Orbe tam={260} energia={energia} icone="🤖" />
      </div>
    </Cena>
  );
};
const useMolaNo = (de: number) => useMola(de, { damping: 10, mass: 0.6 });

/* 2 · Responde vendas e metas */
const CenaVendas: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const vend: [string, number][] = [["Júlio", 92], ["Camila", 78], ["Rogério", 64]];
  return (
    <Cena d={d}>
      <Titulo texto="Vendas e meta *na hora.*" />
      <Entra atraso={0} y={60} estilo={{ position: "absolute", top: 380, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Celular largura={660} altura={900}>
          <TelaWhats nome="Nexor Agente" sub="ligado aos sistemas" cor="#0058FA">
            <MsgWhats de="eu" hora="07:58" lido>Quanto vendemos ontem?</MsgWhats>
            {f < 18 ? (
              f > 4 && <DigitandoWhats />
            ) : (
              <MsgWhats de="outro" hora="07:58" atraso={18}>
                <div>Ontem: <b>R$ 17.399,90</b> em 18 pedidos 📈</div>
                <div style={{ marginTop: 14 }}>
                  {vend.map(([n, p], i) => (
                    <div key={n} style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 25 }}>
                        <span>{n}</span>
                        <span><b>{Math.round(entre(f, 26 + i * 6, 56 + i * 6) * p)}%</b> da meta</span>
                      </div>
                      <div style={{ marginTop: 6, height: 12, width: 400, borderRadius: 6, background: "#e2e8f0", overflow: "hidden" }}>
                        <div style={{ width: `${entre(f, 26 + i * 6, 56 + i * 6) * p}%`, height: "100%", background: p > 80 ? "#16a34a" : "#0058FA" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </MsgWhats>
            )}
          </TelaWhats>
        </Celular>
      </Entra>
    </Cena>
  );
};

/* 3 · Alertas: estoque que vai faltar e cliente que parou de comprar */
const CenaAlertas: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  return (
    <Cena d={d}>
      <Titulo texto="Avisa *antes do problema.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 390, left: 60, right: 60, borderColor: "#f59e0b" }}>
        <div style={{ ...TXT(34, 600, "#fbbf24") }}>⚠️ Estoque vai faltar</div>
        <div style={{ ...TXT(48), marginTop: 12 }}>Água mineral 500 ml</div>
        <div style={{ display: "flex", justifyContent: "space-between", ...TXT(32, 500, COR.suave), marginTop: 14 }}>
          <span>{Math.round(entre(f, 6, 40, 120, 38))} caixas</span>
          <span>acaba em <b style={{ color: "#fbbf24" }}>3 dias</b></span>
        </div>
        <div style={{ marginTop: 14, height: 18, borderRadius: 9, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: `${entre(f, 6, 40, 100, 24)}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #ef4444)" }} />
        </div>
      </Cartao>
      <Cartao atraso={30} estilo={{ position: "absolute", top: 790, left: 60, right: 60 }}>
        <div style={{ ...TXT(34, 600, "#f87171") }}>📉 Parou de comprar</div>
        <div style={{ ...TXT(48), marginTop: 12 }}>Mercado Central</div>
        <div style={{ ...TXT(32, 500, COR.suave), marginTop: 12 }}>Comprava toda semana · último pedido há <b style={{ color: COR.gelo }}>{Math.round(entre(f, 34, 60, 0, 45))} dias</b></div>
      </Cartao>
    </Cena>
  );
};

/* 4 · Prepara a ação e espera o seu aprovar */
const CenaAprovar: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const ok = f >= 92;
  const c = useMola(92, { damping: 9, mass: 0.6 });
  return (
    <Cena d={d}>
      <Titulo texto="Nada sem *o seu aprovar.*" />
      <Cartao atraso={0} destaque={ok} estilo={{ position: "absolute", top: 380, left: 60, right: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...TXT(36, 600, COR.suave) }}>🤖 Preparado pelo Agente</div>
          <div style={{ padding: "10px 22px", borderRadius: 999, background: ok ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)", ...TXT(28, 600, ok ? "#4ade80" : "#fbbf24") }}>{ok ? "aprovado" : "esperando você"}</div>
        </div>
        <div style={{ ...TXT(52), marginTop: 18 }}>Pedido de compra</div>
        {[["Fornecedor", "Fonte Serra Azul"], ["Itens", "200 caixas de água 500 ml"], ["Total", "R$ 2.980,00"]].map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", opacity: entre(f, 8 + i * 6, 16 + i * 6) }}>
            <span style={{ ...TXT(34, 500, COR.suave) }}>{k}</span>
            <span style={{ ...TXT(34, 600) }}>{v}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
          <div style={{ flex: 1, padding: "24px 0", textAlign: "center", borderRadius: 22, border: "2px solid rgba(255,255,255,0.2)", ...TXT(34, 600, COR.suave) }}>Recusar</div>
          <div style={{ position: "relative", flex: 1.4, padding: "24px 0", textAlign: "center", borderRadius: 22, background: ok ? VERDE : GRAD_BOTAO, ...TXT(36, 600, "#fff") }}>
            {ok ? "✓ Aprovado" : "Aprovar"}
            <Toque em={88} />
          </div>
        </div>
      </Cartao>
      <div style={{ position: "absolute", top: 1040, left: 60, right: 60, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        <Chip atraso={40}>🔒 só age com a sua aprovação</Chip>
        {ok && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, transform: `scale(${c})`, ...TXT(40, 600, VERDE), marginTop: 20 }}>
            <Check atraso={92} tam={64} /> Pedido enviado ao fornecedor
          </div>
        )}
      </div>
    </Cena>
  );
};

export const VideoAgente: React.FC = () => (
  <VideoAnimado
    pasta="agente"
    nome="Nexor Agente"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[5, 6]}
    cenas={[
      (d) => <CenaGancho d={d} icone="💬" texto="E se a empresa *te respondesse?*" extra={<Pergunta />} />,
      (d, voz) => <CenaConexoes d={d} energia={voz.energia} />,
      (d) => <CenaVendas d={d} />,
      (d) => <CenaAlertas d={d} />,
      (d) => <CenaAprovar d={d} />,
      (d) => <CenaManifesto d={d} linha1="Sua empresa no seu bolso." linha2="Você no comando." emoji="📱" />,
      (_d, voz) => <CenaFinal voz={voz} icone="🤖" chamada="Só *10 vagas* de fundador" botao="Link na bio →" />,
    ]}
  />
);
export const temposAgente = tempos;
