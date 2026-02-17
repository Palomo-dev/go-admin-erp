FROM node:20-slim

WORKDIR /app

# Instalar solo las dependencias necesarias para el WS server
RUN npm init -y && \
    npm install ws dotenv openai @supabase/supabase-js twilio tsx typescript

# Copiar tsconfig para path aliases
COPY tsconfig.json ./

# Copiar WS server
COPY ws-server.ts ./

# Supabase: usar el cliente Node.js (ws-config) como config.ts
# Así los imports `@/lib/supabase/config` resuelven al cliente server-safe
COPY src/lib/supabase/ws-config.ts ./src/lib/supabase/config.ts

# Cache bust: 2026-02-17T12
ARG CACHEBUST=1

# Servicios Twilio (handler + dependencias)
COPY src/lib/services/integrations/twilio/ ./src/lib/services/integrations/twilio/
COPY src/lib/services/commCreditsService.ts ./src/lib/services/commCreditsService.ts

EXPOSE 8080

CMD ["npx", "tsx", "ws-server.ts"]
