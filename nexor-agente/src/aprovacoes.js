/* Pedidos de aprovação: toda ação que altera dados num sistema (criar, editar, apagar) espera o
   dono tocar em "Aprovar" no WhatsApp. O pedido expira sozinho e só o dono que pediu pode aprovar. */

import { randomBytes } from "node:crypto";

export function criarAprovacoes({ expiraMinutos = 30, agora = () => Date.now() } = {}) {
  const pendentes = new Map();
  const limpar = () => {
    for (const [id, p] of pendentes) if (agora() > p.expiraEm) pendentes.delete(id);
  };
  return {
    criar(pedido) {
      limpar();
      let id;
      do id = "A" + randomBytes(3).toString("hex").toUpperCase();
      while (pendentes.has(id));
      pendentes.set(id, { ...pedido, id, criadoEm: agora(), expiraEm: agora() + expiraMinutos * 60_000 });
      return id;
    },
    /** Retira o pedido da fila (uso único). Devolve null se não existir, expirou ou é de outro dono. */
    retirar(id, dono) {
      limpar();
      const p = pendentes.get(String(id ?? "").toUpperCase());
      if (!p || p.dono !== dono) return null;
      pendentes.delete(p.id);
      return p;
    },
    pendentesDe: (dono) => [...pendentes.values()].filter((p) => p.dono === dono && agora() <= p.expiraEm),
  };
}
