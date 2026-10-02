# ws-server (Railway) — ConversationRelay WebSocket server
#
# Dependencias PROPIAS (2026-09-28, docs/hallazgos/F-78.md): el servidor de voz
# ya no instala el package.json de la aplicación Next. Instala
# `ws-server/package.json` + `ws-server/package-lock.json`, que contienen SOLO
# el cierre de ejecución de ws-server.ts (calculado con un grafo de imports de
# esbuild y confirmado instrumentando la resolución de módulos al arrancar):
#   @supabase/supabase-js · dotenv · libphonenumber-js · openai · resend ·
#   sanitize-html · svix · twilio · ws · zod · tsx (runtime)
# `@sentry/react` aparece como import dinámico de timezoneFallback.ts, solo
# si hay `window`. No se instala: su peer es react, prohibido en esta imagen.
# Antes: ~1.600 paquetes (Next, puppeteer, antd, sharp, xlsx…) y 32 avisos de
# `npm audit` (2 críticos, 18 altos); Railway bloqueaba la imagen en
# BUILD_IMAGE. Ahora: el cierre propio, sin esos paquetes de la web.
# 2026-09-30: `npm audit --omit=dev` = 0 avisos. Se subió `@supabase/supabase-js`
# a 2.50.5 (auth-js 2.70.0; GHSA-8r88-6cj9-9fh5 afectaba ≤ 2.69.1) y `tsx` a
# 4.23.15 (esbuild 0.28.2; GHSA-g7r4-m6w7-qqqr afectaba 0.27.3–0.28.0). Arranque
# verificado con esta misma disposición de archivos (/health responde).
# 2026-10-02: el correo de reunión alcanzó resend, sanitize-html, zod y
# libphonenumber-js. `npm ci` instala 98 paquetes. `npm audit --omit=dev` = 0.
# En Node 20.20.2 (la imagen de Railway) esos cuatro módulos cargan.
# sanitize-html declara engines >=22.12: npm avisa EBADENGINE y el require
# funciona, igual que svix.
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
