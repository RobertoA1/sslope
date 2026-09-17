FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production PORT=3000

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node public ./public
COPY --chown=node:node src ./src
COPY --chown=node:node data/rainfall ./data/rainfall
COPY --chown=node:node data/models ./data/models
COPY --chown=node:node data/generated/ta01-baseline-1h.json ./data/generated/ta01-baseline-1h.json
COPY --chown=node:node data/generated/ta01-baseline-6h.json ./data/generated/ta01-baseline-6h.json
COPY --chown=node:node data/validation ./data/validation
RUN mkdir -p /app/data/local && chown node:node /app/data/local

USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["npm", "start"]
