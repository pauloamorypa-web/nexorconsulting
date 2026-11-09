/* Registro de aceite dos Termos de Uso e da Política de Privacidade (LGPD art. 8º: o consentimento precisa ser
   demonstrável). Grava usuário, versão, data/hora e IP. A versão vigente vem da configuração (TERMOS_VERSAO):
   quando muda, todo usuário do painel vê o aceite de novo antes de continuar.

   As rotas de login e cadastro não são alteradas aqui: o roteador é envolvido na busca da rota, e
   - POST /api/cadastro passa a exigir "aceite_termos": true e grava o aceite do primeiro usuário;
   - GET /api/eu ganha o campo "termos" (versão, link e se o aceite está pendente);
   - as demais rotas do painel respondem 428 enquanto o usuário não aceitar a versão vigente. */

import { randomUUID } from "node:crypto";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS termos_aceites (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, usuario_id TEXT NOT NULL, versao TEXT NOT NULL,
  ip TEXT, agente TEXT, origem TEXT NOT NULL DEFAULT 'login', aceito_em INTEGER NOT NULL, UNIQUE (usuario_id, versao)
);
CREATE INDEX IF NOT EXISTS termos_aceites_empresa ON termos_aceites (empresa_id, aceito_em);
`;

export const MENSAGEM_CADASTRO = "Para criar a conta, leia e aceite os Termos de Uso e a Política de Privacidade.";
export const MENSAGEM_PENDENTE = "Os Termos de Uso e a Política de Privacidade mudaram. Leia e aceite a nova versão para continuar.";

/** Rotas do painel que funcionam antes do aceite (para mostrar a tela de aceite e sair) */
const LIVRES = new Set(["GET /api/eu", "GET /api/termos", "POST /api/termos/aceite", "POST /api/sair", "GET /api/eventos"]);

/**
 * @param {object} d
 * @param {{ db: import('node:sqlite').DatabaseSync }} d.repo
 * @param {{ versao: string, url: string }} d.termos configuração dos termos
 * @param {string} [d.tenant] coluna da empresa na tabela de usuários
 */
export function criarTermos({ repo, termos, tenant = "empresa_id", agora = () => Date.now() }) {
  const db = repo.db;
  db.exec(ESQUEMA);
  const versao = () => String(termos.versao ?? "").trim();

  const aceite = (usuario_id, v = versao()) => db.prepare("SELECT * FROM termos_aceites WHERE usuario_id = ? AND versao = ?").get(usuario_id, v) ?? null;
  /** O Suporte Nexor (equipe da operadora) não aceita termos em nome do cliente */
  const pendente = (u) => Boolean(u && !u.nexor && versao() && !aceite(u.id));

  function aceitar(u, { ip, agente, origem = "login" } = {}) {
    if (!u || u.nexor || !versao()) return null;
    db.prepare("INSERT OR IGNORE INTO termos_aceites (id, empresa_id, usuario_id, versao, ip, agente, origem, aceito_em) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), u[tenant], u.id, versao(), ip ?? null, String(agente ?? "").slice(0, 300) || null, origem, agora());
    return aceite(u.id);
  }

  const situacao = (u) => {
    const a = u ? aceite(u.id) : null;
    return { versao: versao(), url: termos.url, pendente: pendente(u), aceito_em: a?.aceito_em ?? null };
  };

  const historico = (empresa_id, limite = 300) =>
    db.prepare(`SELECT a.usuario_id, u.nome, u.email, a.versao, a.ip, a.origem, a.aceito_em FROM termos_aceites a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.empresa_id = ? ORDER BY a.aceito_em DESC LIMIT ?`).all(empresa_id, limite);

  /** Envolve o roteador: exige aceite no cadastro, informa a situação em /api/eu e barra o painel até o aceite. */
  function proteger(r, { falha, rotasDeSessao = ["app", "cliente", "portal", "webhook"] }) {
    const encontrar = r.encontrar;
    r.encontrar = (metodo, caminho) => {
      const achado = encontrar(metodo, caminho);
      const rota = achado.rota;
      if (!rota) return achado;
      const chave = `${metodo} ${caminho}`;
      let fn = rota.fn;
      if (chave === "POST /api/cadastro") {
        fn = async (ctx) => {
          const b = await ctx.corpo();
          if (b?.aceite_termos !== true) falha(400, MENSAGEM_CADASTRO);
          const resultado = await rota.fn(ctx);
          const u = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(String(b.email ?? "").trim().toLowerCase());
          if (u) aceitar(u, { ip: ctx.ip, agente: ctx.req?.headers?.["user-agent"], origem: "cadastro" });
          return resultado;
        };
      } else if (chave === "GET /api/eu") {
        fn = async (ctx) => {
          const resultado = await rota.fn(ctx);
          return resultado && typeof resultado === "object" ? { ...resultado, termos: situacao(ctx.usuario) } : resultado;
        };
      } else if (!rota.opcoes.publico && !rotasDeSessao.some((o) => rota.opcoes[o]) && !LIVRES.has(chave)) {
        fn = (ctx) => {
          if (pendente(ctx.usuario)) falha(428, MENSAGEM_PENDENTE, { codigo: "termos" });
          return rota.fn(ctx);
        };
      }
      return fn === rota.fn ? achado : { ...achado, rota: { ...rota, fn } };
    };
  }

  return { versao, url: () => termos.url, aceite, pendente, aceitar, situacao, historico, proteger };
}
