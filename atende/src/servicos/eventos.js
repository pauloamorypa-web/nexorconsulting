/* Tempo real para o painel (Server-Sent Events): cada empresa recebe só os próprios eventos. */

export function criarEventos() {
  const inscritos = new Map(); // empresa_id → Set<res>

  const pulso = setInterval(() => {
    for (const lista of inscritos.values()) for (const res of lista) res.write(": pulso\n\n");
  }, 25_000);
  pulso.unref();

  return {
    inscrever(empresa_id, req, res) {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 3000\n\n");
      let lista = inscritos.get(empresa_id);
      if (!lista) inscritos.set(empresa_id, (lista = new Set()));
      lista.add(res);
      req.on("close", () => {
        lista.delete(res);
        if (!lista.size) inscritos.delete(empresa_id);
      });
    },
    emitir(empresa_id, tipo, dados) {
      const lista = inscritos.get(empresa_id);
      if (!lista) return;
      const linha = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
      for (const res of lista) res.write(linha);
    },
    conectados: (empresa_id) => inscritos.get(empresa_id)?.size ?? 0,
  };
}
