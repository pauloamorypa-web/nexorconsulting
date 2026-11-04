# Imagem do nexor-agente (Nexor). Construída no servidor do cliente a partir deste repositório.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8792 DATA_DIR=/dados
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# Roda sem privilégios de administrador; os dados ficam no volume /dados
RUN mkdir -p /dados && chown -R node:node /dados
USER node
VOLUME ["/dados"]
EXPOSE 8792
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8792/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/servidor.js"]
