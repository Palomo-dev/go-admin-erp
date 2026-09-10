# ws-server (Railway) — ConversationRelay WebSocket server
#
# F0 §4.7 / §12 (REG r1): build reproducible con lockfile.
# - `npm ci` instala EXACTAMENTE package-lock.json (tsx es devDependency y es
#   el runtime del servidor, por eso NO se usa --omit=dev).
# - Se copia src/lib completo (services/crm, services/integrations, crm/,
#   supabase/, webhooks/, jobs/, observability/ …) para que los imports `@/lib/**`
#   resuelvan sin listar carpetas una a una.
# - `src/lib/supabase/ws-config.ts` sustituye a `config.ts` (cliente browser)
#   para que `@/lib/supabase/config` resuelva al cliente Node server-safe.
#
# Tamaño/tiempo esperado (referencia, node:20-slim + lockfile actual):
#   imagen ≈ 1.6–1.9 GB (node_modules completo incl. puppeteer/antd; se puede
#   reducir con un package.json recortado en una fase posterior), build
#   ≈ 3–5 min en Railway (npm ci ≈ 2–3 min con cache de capas).
# Plan Node 22: cambiar `FROM node:20-slim` → `node:22-slim` junto con
#   `engines.node >=22` y `openai` 7.x en un PR separado (ver FASE-00 §4.7).

FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PUPPETEER_SKIP_DOWNLOAD=true

# Dependencias con lockfile (capa cacheable)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --include=dev

# tsconfig para path aliases (@/lib/**)
COPY tsconfig.json ./

# Código compartido con Next.js
COPY src/lib/ ./src/lib/
COPY src/types/ ./src/types/

# Supabase: cliente Node (ws-config) como config.ts
COPY src/lib/supabase/ws-config.ts ./src/lib/supabase/config.ts

# Servidor WS
COPY ws-server.ts ./

EXPOSE 8080

CMD ["npx", "tsx", "ws-server.ts"]
