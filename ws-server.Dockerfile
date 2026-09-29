# ws-server (Railway) — ConversationRelay WebSocket server
#
# Dependencias PROPIAS (2026-09-28, docs/hallazgos/F-78.md): el servidor de voz
# ya no instala el package.json de la aplicación Next. Instala
# `ws-server/package.json` + `ws-server/package-lock.json`, que contienen SOLO
# el cierre de ejecución de ws-server.ts (calculado con un grafo de imports de
# esbuild y confirmado instrumentando la resolución de módulos al arrancar):
#   @supabase/supabase-js · dotenv · openai · svix · twilio · ws · tsx (runtime)
# Antes: ~1.600 paquetes (Next, puppeteer, antd, sharp, xlsx…) y 32 avisos de
# `npm audit` (2 críticos, 18 altos); Railway bloqueaba la imagen en
# BUILD_IMAGE. Ahora: ~80 paquetes, 0 críticos y 0 altos.
#
# Si ws-server.ts o algo de `src/lib/**` que alcance importa un paquete nuevo,
# hay que añadirlo a `ws-server/package.json` (y regenerar su lockfile): lo
# exige `src/__tests__/infra/wsServerDependencias.test.ts`.
#
# - `npm ci --omit=dev`: todo lo de ws-server/package.json es de ejecución,
#   incluido `tsx`, que es el runtime del servidor.
# - Se copia src/lib completo para que los imports `@/lib/**` resuelvan sin
#   listar carpetas; tsx solo carga los archivos que se alcanzan de verdad.
# - `src/lib/supabase/ws-config.ts` sustituye a `config.ts` (cliente browser)
#   para que `@/lib/supabase/config` resuelva al cliente Node server-safe. Hoy
#   nada del cierre lo importa; se mantiene como red por si alguien lo añade.
#
# Plan Node 22: cambiar `FROM node:20-slim` → `node:22-slim` junto con
#   `engines.node >=22` y `openai` 7.x en un PR separado (ver FASE-00 §4.7).
#   Ojo: `svix` 2.2.0 declara `engines.node >=22` (npm ci avisa EBADENGINE en
#   Node 20; tsx lo carga igual, verificado sin require(esm) nativo).

FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Dependencias del servidor con su propio lockfile (capa cacheable)
COPY ws-server/package.json ws-server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

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
