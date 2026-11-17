/* Nexor Contábil · vídeo animado (padrão da Blue). Escritório, clientes e valores fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/contabil";
import { COR, Cartao, Celular, CenaFinal, CenaGancho, CenaManifesto, Cena, Check, Chip, Entra, GRAD_BOTAO, MsgWhats, Rico, TXT, TelaWhats, Toque, VERDE, VideoAnimado, entre, pop, useMola } from "../kit";

const FALAS = [
  "Quantas vezes você cobrou o mesmo documento este mês?",
  "O Nexor Contábil cobra os documentos por você, pelo WhatsApp e pelo e-mail.",
  "O cliente manda a foto, e a inteligência artificial lê a nota, o extrato ou o recibo.",
  "Ela sugere o lançamento. E quem confere e aprova é sempre você, contador.",
  "Os prazos de cada cliente ficam num painel só.",
  "Menos cobrança. Mais contabilidade.",
  "São só dez vagas de fundador. O link está na bio.",
];

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};

/* 0 · Cobranças repetidas se empilhando */
const Repeticoes: React.FC = () => {
  const f = useCurrentFrame();
  const n = Math.min(4, Math.floor(entre(f, 8, 60, 0, 4.99)));
  return (
    <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 14 }}>
      {new Array(n).fill(0).map((_, i) => (
        <div key={i} style={{ alignSelf: "flex-start", padding: "18px 28px", borderRadius: 26, background: "rgba(235,241,249,0.95)", ...TXT(34, 500, "#0b1733"), transform: `rotate(${(i % 2 ? 1 : -1) * 1.5}deg)` }}>
          Oi! Manda o extrato de outubro? <b style={{ color: "#dc2626" }}>({i + 2}ª vez)</b>
        </div>
      ))}
    </div>
  );
};

/* 1 · Cobrança automática no WhatsApp e no e-mail */
const CenaCobranca: React.FC<{ d: number }> = ({ d }) => {
  const p = useMola(0);
  const f = useCurrentFrame();
  const mail = useMola(54, { damping: 12, mass: 0.7 });
  return (
    <Cena d={d}>
      <Titulo texto="Cobra *por você.*" />
      <div style={{ position: "absolute", top: 380, left: 70, ...pop(p, 60) }}>
        <Celular largura={600} altura={720}>
          <TelaWhats nome="Escritório Contas Certas" sub="mensagem automática" cor="#0058FA">
            <MsgWhats de="eu" hora="09:00" atraso={10} lido>
              Olá, Padaria Trigo! 👋 Faltam 2 documentos de outubro: <b>extrato do banco</b> e <b>notas de compra</b>. É só mandar por aqui 📎
            </MsgWhats>
          </TelaWhats>
        </Celular>
      </div>
      {f > 52 && (
        <div style={{ position: "absolute", top: 940, right: 50, width: 560, padding: "28px 30px", borderRadius: 30, background: "rgba(235,241,249,0.97)", boxShadow: "0 24px 70px rgba(0,0,0,0.5)", transform: `translateX(${(1 - mail) * 300}px) rotate(2deg)`, opacity: mail }}>
          <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#0b1733" }}>✉️ E-mail enviado</div>
          <div style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 28, color: "#334155", marginTop: 8 }}>Lembrete: documentos de outubro da Padaria Trigo</div>
        </div>
      )}
      <div style={{ position: "absolute", top: 1180, left: 60, right: 60, display: "flex", gap: 16, justifyContent: "center" }}>
        <Chip atraso={70} cor="#4ade80">🤖 cobrança automática</Chip>
      </div>
    </Cena>
  );
};

/* 2 · Foto do recibo lida pela IA */
const CenaLeitura: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const varre = entre(f, 14, 60);
  const campos: [string, string][] = [["Tipo", "NF-e de compra"], ["Fornecedor", "Moinho Bom Grão"], ["Data", "14/10/2026"], ["Valor", "R$ 1.284,50"]];
  return (
    <Cena d={d}>
      <Titulo texto="A IA *lê o documento.*" />
      <Entra atraso={0} estilo={{ position: "absolute", top: 380, left: 70, width: 420, height: 600, borderRadius: 16, background: "#fffdf6", transform: "rotate(-3deg)", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", padding: "34px 30px", overflow: "hidden" }}>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, color: "#111", textAlign: "center" }}>MOINHO BOM GRÃO</div>
        <div style={{ fontFamily: "Inter", fontSize: 22, color: "#555", textAlign: "center", marginTop: 6 }}>DANFE · Nota de compra</div>
        {["Farinha T1 50kg  x10", "Fermento 500g  x24", "Açúcar 5kg  x12"].map((l) => (
          <div key={l} style={{ fontFamily: "Inter", fontSize: 24, color: "#333", marginTop: 26, borderBottom: "1px dashed #bbb", paddingBottom: 8 }}>{l}</div>
        ))}
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 32, color: "#111", marginTop: 40 }}>TOTAL R$ 1.284,50</div>
        <div style={{ fontFamily: "Inter", fontSize: 22, color: "#555", marginTop: 8 }}>14/10/2026</div>
        {f > 12 && f < 64 && <div style={{ position: "absolute", left: 0, right: 0, top: `${varre * 100}%`, height: 10, background: COR.ciano, boxShadow: `0 0 40px ${COR.ciano}` }} />}
      </Entra>
      <div style={{ position: "absolute", top: 430, left: 540, right: 50, display: "flex", flexDirection: "column", gap: 16 }}>
        {campos.map(([k, v], i) => (
          <Cartao key={k} atraso={30 + i * 9} estilo={{ padding: "20px 24px", borderRadius: 24 }}>
            <div style={{ ...TXT(24, 600, COR.suave) }}>{k}</div>
            <div style={{ ...TXT(34, 600), marginTop: 4 }}>{v}</div>
          </Cartao>
        ))}
      </div>
      <div style={{ position: "absolute", top: 1100, left: 60, right: 60, display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
        <Chip atraso={74}>🧾 nota</Chip>
        <Chip atraso={80}>🏦 extrato</Chip>
        <Chip atraso={86}>🧾 recibo</Chip>
      </div>
    </Cena>
  );
};

/* 3 · Lançamento sugerido; o contador aprova */
const CenaAprova: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const aprovado = f >= 84;
  const c = useMola(84, { damping: 9, mass: 0.6 });
  const conf = Math.round(entre(f, 16, 50) * 96);
  return (
    <Cena d={d}>
      <Titulo texto="Você *confere e aprova.*" />
      <Cartao atraso={0} destaque={aprovado} estilo={{ position: "absolute", top: 380, left: 60, right: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...TXT(40) }}>🤖 Lançamento sugerido</div>
          <div style={{ ...TXT(32, 600, COR.ciano) }}>{conf}% de confiança</div>
        </div>
        {[["Débito", "1.1.3 · Estoques"], ["Crédito", "2.1.1 · Fornecedores"], ["Valor", "R$ 1.284,50"], ["Histórico", "NF-e Moinho Bom Grão · 14/10"]].map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "18px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", opacity: entre(f, 8 + i * 7, 16 + i * 7) }}>
            <span style={{ ...TXT(34, 500, COR.suave) }}>{k}</span>
            <span style={{ ...TXT(34, 600) }}>{v}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
          <div style={{ flex: 1, padding: "24px 0", textAlign: "center", borderRadius: 22, border: "2px solid rgba(255,255,255,0.2)", ...TXT(34, 600, COR.suave) }}>Ajustar</div>
          <div style={{ position: "relative", flex: 1.4, padding: "24px 0", textAlign: "center", borderRadius: 22, background: aprovado ? VERDE : GRAD_BOTAO, ...TXT(36, 600, "#fff") }}>
            {aprovado ? "✓ Aprovado" : "Aprovar"}
            <Toque em={80} />
          </div>
        </div>
      </Cartao>
      {aprovado && (
        <div style={{ position: "absolute", top: 1060, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, transform: `scale(${c})`, ...TXT(44, 600, VERDE) }}>
          <Check atraso={84} tam={70} /> Aprovado por você, contador
        </div>
      )}
    </Cena>
  );
};

/* 4 · Prazos de todos os clientes num painel só */
const CenaPrazos: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const itens: [string, string, string, "ok" | "hoje" | "breve"][] = [
    ["DAS", "Padaria Trigo", "20/11", "ok"],
    ["DCTFWeb", "Auto Peças Sul", "hoje", "hoje"],
    ["EFD-Reinf", "Clínica Vida", "15/11", "breve"],
    ["FGTS Digital", "Mercado Bom Preço", "20/11", "ok"],
    ["DAS", "Studio Fit", "20/11", "ok"],
  ];
  const cor = { ok: VERDE, hoje: "#f59e0b", breve: COR.azulClaro };
  return (
    <Cena d={d}>
      <Titulo texto="Prazos num *painel só.*" />
      <div style={{ position: "absolute", top: 380, left: 60, right: 60, display: "flex", gap: 16 }}>
        {[["48", "clientes"], ["212", "obrigações"], ["3", "vencem hoje"]].map(([n, l], i) => (
          <Cartao key={l} atraso={i * 5} estilo={{ flex: 1, padding: "24px 22px", textAlign: "center" }}>
            <div style={{ ...TXT(70), color: i === 2 ? "#fbbf24" : COR.ciano }}>{Math.round(entre(f, 6, 40) * Number(n))}</div>
            <div style={{ ...TXT(26, 600, COR.suave) }}>{l}</div>
          </Cartao>
        ))}
      </div>
      <div style={{ position: "absolute", top: 610, left: 60, right: 60, display: "flex", flexDirection: "column", gap: 14 }}>
        {itens.map(([o, c, dt, st], i) => (
          <Entra key={i} atraso={14 + i * 6} y={30}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "22px 28px", borderRadius: 24, background: "rgba(14,30,66,0.62)", border: `1.5px solid ${st === "hoje" ? "#f59e0b" : "rgba(120,170,255,0.2)"}` }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: cor[st] }} />
              <div style={{ ...TXT(34, 600), width: 230 }}>{o}</div>
              <div style={{ ...TXT(30, 500, COR.suave), flex: 1 }}>{c}</div>
              <div style={{ ...TXT(32, 600, cor[st]) }}>{dt}</div>
            </div>
          </Entra>
        ))}
      </div>
    </Cena>
  );
};

export const VideoContabil: React.FC = () => (
  <VideoAnimado
    pasta="contabil"
    nome="Nexor Contábil"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[5, 6]}
    cenas={[
      (d) => <CenaGancho d={d} icone="📄" texto="Cobrando o *mesmo documento* de novo?" extra={<Repeticoes />} />,
      (d) => <CenaCobranca d={d} />,
      (d) => <CenaLeitura d={d} />,
      (d) => <CenaAprova d={d} />,
      (d) => <CenaPrazos d={d} />,
      (d) => <CenaManifesto d={d} linha1="Menos cobrança." linha2="Mais contabilidade." emoji="📊" />,
      (_d, voz) => <CenaFinal voz={voz} icone="📊" chamada="Só *10 vagas* de fundador" botao="Link na bio →" />,
    ]}
  />
);
export const temposContabil = tempos;
