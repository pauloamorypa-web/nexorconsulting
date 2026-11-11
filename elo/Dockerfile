# Imagem do Nexor Elo (hospedado pela Nexor, multi-inquilino).
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8796 DATA_DIR=/dados
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /dados && chown -R node:node /dados
USER node
VOLUME ["/dados"]
EXPOSE 8796
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8796/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/servidor.js"]
