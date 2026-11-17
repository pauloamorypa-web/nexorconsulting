/* Nexor Elo para o fornecedor · vídeo animado (padrão da Blue). Lojas, instaladores e valores fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/elo-fornecedor";
import { COR, Cartao, CenaFinal, CenaGancho, CenaManifesto, Cena, Check, Chip, Entra, GRAD, Rico, TXT, VERDE, VideoAnimado, entre, pop, reais, useMola } from "../kit";

const FALAS = [
  "Fornecedor, o orçamento sai do seu balcão. E você nunca sabe se ele volta.",
  "No Nexor Elo, os seus instaladores montam a proposta com o seu catálogo, o seu preço e o seu estoque.",
  "Ao enviar, os itens ficam reservados, com prazo. E você acompanha cada proposta até o pagamento.",
  "Quando o cliente paga, a sua parte cai direto na sua conta. Sem correr atrás.",
  "Você vê o score de cada instalador e define o crédito dele. Atrasou um título? As novas reservas são bloqueadas sozinhas.",
  "E o cliente do instalador fica com ele. Por isso ele confia em você.",
  "Mais venda. Menos risco.",
  "São só dez vagas de fundador para fornecedores. O link está na bio.",
];

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};

/* 0 · Orçamento em papel indo embora */
const PapelVoando: React.FC = () => {
  const f = useCurrentFrame();
  const v = entre(f, 50, 120);
  return (
    <div style={{ position: "relative", height: 420, marginTop: 40 }}>
      <div style={{ position: "absolute", left: 40 + v * 700, top: 40 - v * 260, width: 380, padding: "30px 32px", borderRadius: 14, background: "#fdf8e7", transform: `rotate(${-4 + v * 40}deg) scale(${1 - v * 0.5})`, opacity: 1 - v * 0.9, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#222" }}>ORÇAMENTO</div>
        {["4 câmeras 1080p", "1 DVR 4 canais", "1 cabo 100 m"].map((l) => (
          <div key={l} style={{ fontFamily: "Inter", fontSize: 26, color: "#444", marginTop: 16, borderBottom: "1px dashed #bbb", paddingBottom: 6 }}>{l}</div>
        ))}
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#222", marginTop: 22 }}>R$ 1.345,60</div>
      </div>
      {f > 90 && <div style={{ position: "absolute", left: 120, top: 120, fontSize: 200, color: COR.ciano, opacity: entre(f, 90, 110) }}>?</div>}
    </div>
  );
};

/* 1 · Instaladores usando o seu catálogo e o seu estoque */
const CenaCatalogo: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const prod: [string, string, number, number][] = [["Câmera bullet 1080p", "R$ 159,90", 68, 12], ["DVR 4 canais", "R$ 389,00", 21, 3], ["Cabo coaxial 100 m", "R$ 219,00", 22, 2], ["Fonte 12V 10A", "R$ 98,00", 32, 4], ["Sensor infravermelho", "R$ 49,90", 104, 8]];
  const inst: [string, string][] = [["IS", "#7c3aed"], ["CR", "#0ea5e9"], ["ER", "#db2777"]];
  return (
    <Cena d={d}>
      <Titulo texto="Seu catálogo, *seu preço, seu estoque.*" />
      <div style={{ position: "absolute", top: 420, left: 60, right: 60, display: "flex", gap: 16, justifyContent: "center" }}>
        {inst.map(([ini, c], i) => (
          <Entra key={ini} atraso={i * 5}>
            <div style={{ width: 110, height: 110, borderRadius: 55, background: c, display: "flex", alignItems: "center", justifyContent: "center", ...TXT(38, 600, "#fff"), boxShadow: `0 0 ${20 + Math.sin(f / 5 + i) * 14}px ${c}` }}>{ini}</div>
          </Entra>
        ))}
        <Entra atraso={16} estilo={{ alignSelf: "center", ...TXT(34, 600, COR.suave), marginLeft: 10 }}>instaladores montando propostas</Entra>
      </div>
      <Cartao atraso={10} estilo={{ position: "absolute", top: 600, left: 60, right: 60, padding: "28px 34px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr", ...TXT(26, 600, COR.suave), paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <span>Produto</span><span>Seu preço</span><span style={{ textAlign: "right" }}>Disponível</span>
        </div>
        {prod.map(([n, p, est, res], i) => {
          const q0 = 30 + i * 14;
          const disp = Math.round(est - entre(f, q0, q0 + 20) * res);
          const pisca = f > q0 && f < q0 + 30;
          return (
            <div key={n} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr", alignItems: "center", padding: "18px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", ...TXT(32, 500) }}>
              <span>
                {n}
                {pisca && <span style={{ marginLeft: 12, padding: "4px 14px", borderRadius: 999, background: "rgba(0,225,251,0.2)", ...TXT(22, 600, COR.ciano), opacity: 1 - entre(f, q0 + 18, q0 + 30) }}>−{res} reservado</span>}
              </span>
              <span>{p}</span>
              <span style={{ textAlign: "right", color: pisca ? COR.ciano : COR.gelo }}>{disp}</span>
            </div>
          );
        })}
      </Cartao>
    </Cena>
  );
};

/* 2 · Reservas com prazo e funil até o pagamento */
const CenaFunil: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const etapas: [string, number][] = [["Enviadas", 17], ["Vistas pelo cliente", 14], ["Aceitas", 13], ["Pagas", 12]];
  return (
    <Cena d={d}>
      <Titulo texto="Reservado *com prazo.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 400, left: 60, right: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...TXT(36, 600, COR.suave) }}>⏳ Reserva #17 · Instala Seg</div>
          <div style={{ padding: "10px 22px", borderRadius: 999, background: "rgba(245,158,11,0.2)", ...TXT(28, 600, "#fbbf24") }}>vence em 4 dias</div>
        </div>
        <div style={{ marginTop: 18, height: 16, borderRadius: 8, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div style={{ width: `${100 - entre(f, 6, 60) * 20}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #fbbf24)" }} />
        </div>
      </Cartao>
      <Cartao atraso={20} estilo={{ position: "absolute", top: 690, left: 60, right: 60 }}>
        <div style={{ ...TXT(36, 600, COR.suave), marginBottom: 14 }}>📊 Funil das propostas</div>
        {etapas.map(([n, v], i) => (
          <div key={n} style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", ...TXT(34, 600) }}>
              <span>{n}</span>
              <span style={{ color: i === 3 ? "#4ade80" : COR.gelo }}>{Math.round(entre(f, 30 + i * 12, 60 + i * 12) * v)}</span>
            </div>
            <div style={{ marginTop: 10, height: 18, borderRadius: 9, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${entre(f, 30 + i * 12, 60 + i * 12) * (v / 17) * 100}%`, height: "100%", background: i === 3 ? VERDE : GRAD }} />
            </div>
          </div>
        ))}
      </Cartao>
    </Cena>
  );
};

/* 3 · A sua parte cai direto na sua conta */
const CenaRecebe: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const n = useMola(4, { damping: 12, mass: 0.7 });
  return (
    <Cena d={d}>
      <Titulo texto="Sua parte *direto na sua conta.*" />
      <div style={{ position: "absolute", top: 420, left: 70, right: 70, padding: "30px 32px", borderRadius: 34, background: "rgba(235,241,249,0.97)", display: "flex", alignItems: "center", gap: 22, boxShadow: "0 24px 70px rgba(0,0,0,0.5)", transform: `translateY(${(1 - n) * -140}px)`, opacity: n }}>
        <div style={{ width: 96, height: 96, borderRadius: 24, background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50 }}>💸</div>
        <div>
          <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 34, color: "#0b1733" }}>Pix recebido · R$ 1.345,60</div>
          <div style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 28, color: "#334155" }}>parte da loja · proposta #18 · split</div>
        </div>
      </div>
      <Cartao atraso={24} destaque estilo={{ position: "absolute", top: 720, left: 60, right: 60, textAlign: "center" }}>
        <div style={{ ...TXT(34, 600, COR.suave) }}>Recebido via split · 30 dias</div>
        <div style={{ ...TXT(110), marginTop: 10, background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{reais(Math.round(entre(f, 26, 80, 5761.04, 7106.64) * 100) / 100)}</div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <Chip atraso={60} cor="#4ade80">✓ sem cobrar ninguém</Chip>
        </div>
      </Cartao>
    </Cena>
  );
};

/* 4 · Score, crédito e bloqueio automático */
const CenaCredito: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const score = Math.round(entre(f, 8, 50) * 73);
  const bloqueia = f >= 140;
  const b = useMola(140, { damping: 9, mass: 0.6 });
  return (
    <Cena d={d}>
      <Titulo texto="Score, crédito *e bloqueio automático.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 420, left: 60, right: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ position: "relative", width: 170, height: 170, borderRadius: 85, background: `conic-gradient(${VERDE} ${score * 3.6}deg, rgba(255,255,255,0.1) 0deg)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 136, height: 136, borderRadius: 68, background: "#0b1733", display: "flex", alignItems: "center", justifyContent: "center", ...TXT(60) }}>{score}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...TXT(44) }}>Instala Seg</div>
            <div style={{ ...TXT(28, 500, COR.suave), marginTop: 6 }}>score · conversão e pontualidade</div>
            <div style={{ ...TXT(34, 600, "#4ade80"), marginTop: 14 }}>Crédito: {reais(Math.round(entre(f, 20, 60) * 15000))} disponível</div>
          </div>
        </div>
      </Cartao>
      <Cartao atraso={50} estilo={{ position: "absolute", top: 760, left: 60, right: 60, borderColor: bloqueia ? "#ef4444" : "rgba(120,170,255,0.26)", boxShadow: bloqueia ? "0 0 60px rgba(239,68,68,0.35)" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...TXT(44) }}>Eletro Rocha</div>
          <div style={{ padding: "10px 24px", borderRadius: 999, background: bloqueia ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.2)", ...TXT(30, 600, bloqueia ? "#f87171" : "#4ade80"), transform: bloqueia ? `scale(${b})` : undefined }}>{bloqueia ? "🔒 Bloqueado" : "Aprovado"}</div>
        </div>
        <div style={{ ...TXT(32, 500, COR.suave), marginTop: 14 }}>
          Título de R$ 1.840,00 · {f > 100 ? <b style={{ color: "#f87171" }}>vencido</b> : <span>vence hoje</span>}
        </div>
        {bloqueia && <div style={{ ...TXT(32, 600, "#fbbf24"), marginTop: 16 }}>⚠️ Novas reservas bloqueadas sozinhas</div>}
      </Cartao>
    </Cena>
  );
};

/* 5 · O cliente do instalador fica com ele */
const CenaPrivacidade: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const borra = entre(f, 14, 34) * 14;
  const cad = useMola(30, { damping: 8, mass: 0.6 });
  return (
    <Cena d={d}>
      <Titulo texto="O cliente *fica com o instalador.*" />
      <Cartao atraso={0} estilo={{ position: "absolute", top: 420, left: 60, right: 60 }}>
        <div style={{ ...TXT(32, 600, COR.suave) }}>🏪 O que você vê</div>
        {([["Instalador", "Instala Seg Araguari", false], ["Itens", "CFTV 4 câmeras", false], ["Cliente", "Maria Oliveira · (34) 9····", true], ["Endereço", "Rua das Flores, 120", true], ["Cidade", "Araguari/MG", false]] as [string, string, boolean][]).map(([k, v, oculto]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ ...TXT(32, 500, COR.suave) }}>{k}</span>
            <span style={{ position: "relative", ...TXT(32, 600) }}>
              <span style={{ filter: oculto ? `blur(${borra}px)` : undefined }}>{v}</span>
              {oculto && f > 30 && <span style={{ position: "absolute", right: 0, top: -6, fontSize: 40, transform: `scale(${cad})` }}>🔒</span>}
            </span>
          </div>
        ))}
      </Cartao>
      <Entra atraso={60} estilo={{ position: "absolute", top: 1010, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 16, ...TXT(42, 600, "#4ade80") }}>
        <Check atraso={60} tam={64} /> Por isso ele confia em você
      </Entra>
    </Cena>
  );
};

export const VideoEloFornecedor: React.FC = () => (
  <VideoAnimado
    pasta="elo-fornecedor"
    nome="Nexor Elo · para o fornecedor"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[6, 7]}
    cenas={[
      (d) => <CenaGancho d={d} icone="📦" texto="O orçamento saiu do balcão. *Ele volta?*" extra={<PapelVoando />} />,
      (d) => <CenaCatalogo d={d} />,
      (d) => <CenaFunil d={d} />,
      (d) => <CenaRecebe d={d} />,
      (d) => <CenaCredito d={d} />,
      (d) => <CenaPrivacidade d={d} />,
      (d) => <CenaManifesto d={d} linha1="Mais venda." linha2="Menos risco." emoji="🛡️" />,
      (_d, voz) => <CenaFinal voz={voz} icone="🏪" chamada="Só *10 vagas* de fundador para fornecedores" botao="Link na bio →" />,
    ]}
  />
);
export const temposEloFornecedor = tempos;
