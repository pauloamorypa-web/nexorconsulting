/* Nexor Atende IA · vídeo animado (padrão da Blue). Empresa e dados fictícios. */
import React from "react";
import { useCurrentFrame } from "remotion";
import tempos from "../tempos/atende";
import { COR, Cartao, Celular, CenaFinal, Cena, Check, Chip, Contador, DigitandoWhats, Entra, GRAD, MsgWhats, Orbe, Rico, TXT, TelaWhats, VERDE, VideoAnimado, entre, pop, useMola } from "../kit";

const FALAS = [
  "Dez da noite. Um cliente perguntou o preço no WhatsApp. E ninguém respondeu.",
  "Com o Nexor Atende IA, a inteligência artificial responde na hora, com os preços e as regras da sua empresa.",
  "Ela tira as dúvidas, agenda e confirma o horário.",
  "E passa para a sua equipe quando precisa, com o resumo pronto.",
  "Cada conversa vira um contato, e você sabe quem está pronto para comprar.",
  "Seu WhatsApp atendendo vinte e quatro horas.",
  "Teste grátis por trinta dias. O link está na bio.",
];

const PERGUNTA = "Oi! Quanto custa a limpeza de pele? 🙂";

const Titulo: React.FC<{ texto: string }> = ({ texto }) => {
  const p = useMola(0);
  return <div style={{ position: "absolute", top: 230, left: 72, right: 72, ...TXT(68), ...pop(p) }}><Rico texto={texto} /></div>;
};
const Fone: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => {
  const p = useMola(0);
  return (
    <div style={{ position: "absolute", top: 430, left: 0, right: 0, display: "flex", justifyContent: "center", ...pop(p, 60) }}>
      <Celular largura={660} altura={800}>
        <TelaWhats nome="Clínica Bela Pele" sub={sub}>{children}</TelaWhats>
      </Celular>
    </div>
  );
};

/* 0 · 22h: a pergunta fica sem resposta */
const CenaSemResposta: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const minutos = Math.round(entre(f, 40, 120, 3, 41));
  const p = useMola(90);
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 240, left: 72, ...TXT(120), letterSpacing: "-0.03em" }}>
        🌙 22:{String(minutos).padStart(2, "0")}
      </div>
      <Fone sub="visto por último às 18:02">
        <MsgWhats de="outro" hora="22:03" atraso={14}>{PERGUNTA}</MsgWhats>
      </Fone>
      {f > 90 && (
        <div style={{ position: "absolute", top: 1265, left: 0, right: 0, display: "flex", justifyContent: "center", ...pop(p) }}>
          <div style={{ padding: "20px 34px", borderRadius: 999, background: "rgba(239,68,68,0.9)", ...TXT(40, 600, "#fff") }}>😶 Ninguém respondeu</div>
        </div>
      )}
    </Cena>
  );
};

/* 1 · A IA responde na hora, com os preços e as regras da empresa */
const CenaResponde: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  return (
    <Cena d={d}>
      <Titulo texto="A IA responde *na hora.*" />
      <Fone sub="online · Atende IA">
        <MsgWhats de="outro" hora="22:03">{PERGUNTA}</MsgWhats>
        {f < 30 ? (
          f > 6 && <DigitandoWhats />
        ) : (
          <MsgWhats de="eu" hora="22:03" atraso={30} lido>
            Oi! A limpeza de pele custa <b>R$ 120</b> e leva 1 hora. Tenho amanhã às <b>9h</b> ou às <b>14h</b>. Qual prefere? 😊
          </MsgWhats>
        )}
      </Fone>
      <div style={{ position: "absolute", top: 1265, left: 60, right: 60, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        <Chip atraso={44} cor="#4ade80">⚡ respondeu em 3 s</Chip>
        <Chip atraso={64}>📋 tabela de preços</Chip>
        <Chip atraso={80}>📏 regras da empresa</Chip>
      </div>
    </Cena>
  );
};

/* 2 · Agenda e confirma */
const CenaAgenda: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const c = useMola(48, { damping: 10, mass: 0.6 });
  return (
    <Cena d={d}>
      <Titulo texto="Tira dúvidas, *agenda e confirma.*" />
      <Fone sub="online · Atende IA">
        <MsgWhats de="outro" hora="22:04" atraso={0}>Amanhã às 14h! Precisa ir de rosto limpo?</MsgWhats>
        {f > 20 && (
          <MsgWhats de="eu" hora="22:04" atraso={20} lido>
            Não precisa 😉 <b>Agendado: quinta, 14:00.</b> Te mando um lembrete pela manhã.
          </MsgWhats>
        )}
      </Fone>
      {f > 46 && (
        <div style={{ position: "absolute", top: 1265, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, transform: `scale(${c})`, ...TXT(48, 600, VERDE) }}>
          <Check atraso={48} tam={76} /> Quinta, 14:00 na agenda
        </div>
      )}
    </Cena>
  );
};

/* 3 · Passa para a equipe com o resumo */
const CenaEquipe: React.FC<{ d: number; energia: number }> = ({ d, energia }) => {
  const f = useCurrentFrame();
  const linha = entre(f, 8, 30);
  const tags = ["🔥 Pronta para fechar", "💆 Limpeza de pele", "📅 Quinta, 14:00", "❓ Quer pacote com 4 sessões"];
  return (
    <Cena d={d}>
      <Titulo texto="Passa para a equipe *com o resumo.*" />
      <Entra atraso={0} estilo={{ position: "absolute", top: 420, left: 90, right: 90, display: "flex", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Orbe tam={200} energia={energia} icone="🤖" />
          <div style={{ marginTop: 20, ...TXT(34, 600) }}>Atende IA</div>
        </div>
        <div style={{ flex: 1, margin: "0 24px 56px", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.1)", position: "relative" }}>
          <div style={{ width: `${linha * 100}%`, height: "100%", borderRadius: 4, background: GRAD }} />
          <div style={{ position: "absolute", top: -24, left: `calc(${linha * 100}% - 26px)`, fontSize: 44, opacity: linha < 1 ? 1 : 0 }}>📨</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 200, height: 200, borderRadius: 100, background: "#db2777", display: "flex", alignItems: "center", justifyContent: "center", ...TXT(72, 600, "#fff") }}>CL</div>
          <div style={{ marginTop: 20, ...TXT(34, 600) }}>Carla · equipe</div>
        </div>
      </Entra>
      <Cartao atraso={26} estilo={{ position: "absolute", top: 820, left: 60, right: 60 }}>
        <div style={{ ...TXT(46) }}>Resumo da conversa</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 24 }}>
          {tags.map((x, i) => <Chip key={x} atraso={34 + i * 7}>{x}</Chip>)}
        </div>
      </Cartao>
    </Cena>
  );
};

/* 4 · Cada conversa vira contato; quem está pronto para comprar sobe */
const CenaFunil: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const colunas: [string, string, number][] = [["Novos", "🆕", 38], ["Interessados", "👀", 21], ["Prontos para comprar", "🔥", 9]];
  const nomes = ["Ana", "João", "Marta", "Lucas", "Bia", "Rui"];
  return (
    <Cena d={d}>
      <Titulo texto="Quem está *pronto para comprar.*" />
      <div style={{ position: "absolute", top: 400, left: 50, right: 50, display: "flex", gap: 18 }}>
        {colunas.map(([n, e, total], ci) => (
          <Cartao key={n} atraso={ci * 6} destaque={ci === 2} estilo={{ flex: 1, padding: "28px 22px", minHeight: 760 }}>
            <div style={{ ...TXT(30, 600, COR.suave) }}>{e} {n}</div>
            <div style={{ ...TXT(84), marginTop: 6, color: ci === 2 ? COR.ciano : COR.gelo }}><Contador q0={10} q1={70} ate={total} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
              {nomes.slice(0, 3 - ci + 1).map((nome, i) => {
                const voa = ci === 2 ? entre(f, 40 + i * 14, 58 + i * 14) : 1;
                return (
                  <div key={nome} style={{ padding: "16px 18px", borderRadius: 18, background: ci === 2 ? "linear-gradient(135deg, rgba(0,88,250,0.8), rgba(0,180,255,0.7))" : "rgba(255,255,255,0.07)", ...TXT(28, 600), opacity: voa, transform: `translateX(${(1 - voa) * -260}px)` }}>
                    {ci === 2 ? nomes[i + 3] : nome}
                  </div>
                );
              })}
            </div>
          </Cartao>
        ))}
      </div>
    </Cena>
  );
};

/* 5 · 24 horas: relógio que gira */
const Cena24h: React.FC<{ d: number }> = ({ d }) => {
  const f = useCurrentFrame();
  const a = useMola(0);
  const giro = entre(f, 0, d - 10) * 720;
  return (
    <Cena d={d}>
      <div style={{ position: "absolute", top: 380, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `scale(${a})` }}>
        <div style={{ position: "relative", width: 380, height: 380, borderRadius: 190, border: `10px solid ${COR.ciano}`, boxShadow: "0 0 80px rgba(0,225,251,0.4)" }}>
          <div style={{ position: "absolute", left: 185, top: 40, width: 10, height: 150, borderRadius: 5, background: COR.gelo, transformOrigin: "5px 150px", transform: `rotate(${giro}deg)` }} />
          <div style={{ position: "absolute", left: 186, top: 90, width: 8, height: 100, borderRadius: 4, background: COR.azulClaro, transformOrigin: "4px 100px", transform: `rotate(${giro / 12}deg)` }} />
        </div>
      </div>
      <div style={{ position: "absolute", top: 860, left: 72, right: 72, textAlign: "center", ...TXT(84), lineHeight: 1.1 }}>
        <Entra atraso={6}>Seu WhatsApp atendendo</Entra>
        <Entra atraso={16}><span style={{ ...TXT(170), background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>24 horas</span></Entra>
      </div>
    </Cena>
  );
};

export const VideoAtende: React.FC = () => (
  <VideoAnimado
    pasta="atende"
    nome="Nexor Atende IA"
    falas={FALAS}
    tempos={tempos}
    semLegenda={[5, 6]}
    cenas={[
      (d) => <CenaSemResposta d={d} />,
      (d) => <CenaResponde d={d} />,
      (d) => <CenaAgenda d={d} />,
      (d, voz) => <CenaEquipe d={d} energia={voz.energia} />,
      (d) => <CenaFunil d={d} />,
      (d) => <Cena24h d={d} />,
      (_d, voz) => <CenaFinal voz={voz} icone="💬" chamada="Teste grátis por *30 dias*" botao="Link na bio →" />,
    ]}
  />
);
export const temposAtende = tempos;
