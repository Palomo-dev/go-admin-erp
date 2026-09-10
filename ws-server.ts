/**
 * WebSocket Server — Twilio ConversationRelay
 * GO Admin ERP
 *
 * Servidor standalone que recibe conexiones WebSocket de Twilio ConversationRelay.
 * Corre de forma independiente a Next.js.
 *
 * Uso:
 *   npx tsx ws-server.ts
 *   # o en producción:
 *   node --loader ts-node/esm ws-server.ts
 *
 * Requiere las mismas variables de entorno que Next.js (.env.local).
 * Puerto configurable via WS_PORT (default: 8080).
 *
 * Seguridad (F0, C22 — fail-closed):
 *  1. En el upgrade se exige `?st=<token>` (HMAC con WS_SESSION_SECRET, 10 min),
 *     emitido por /api/voice/twiml/ai-agent o /api/integrations/twilio/voice/incoming.
 *  2. Se valida `X-Twilio-Signature` sobre la URL wss completa (WS_PUBLIC_URL +
 *     path + query) con el Auth Token de la (sub)cuenta de la org del token.
 *  3. En el mensaje `setup` el handler exige de nuevo `customParameters.token`.
 *  Cualquier fallo → 401/403 en el handshake o close(1008).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createServer, type IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import { handleConversationRelayConnection } from './src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler';
import { verifyWsSessionToken, type WsSessionClaims } from './src/lib/security/wsSessionToken';
import { verifyTwilioUrlSignature } from './src/lib/security/webhookSignatures';
import { getServiceClient } from './src/lib/supabase/server-service';

const PORT = parseInt(process.env.WS_PORT || '8080', 10);
const WS_PATH = '/conversation-relay';

// ─── HTTP Server base ───────────────────────────────────

const server = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'voice-agent-ws', uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── Auth del upgrade ───────────────────────────────────

/** Origin público wss del ws-server (para reconstruir la URL firmada por Twilio). */
function getPublicWsOrigin(): string | null {
  const raw = process.env.WS_PUBLIC_URL || process.env.WS_SERVER_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Auth Token de Twilio para la org (subcuenta si la tiene; si no, master). */
async function getTwilioAuthTokenForOrg(orgId: number): Promise<string | null> {
  try {
    const { data } = await getServiceClient()
      .from('comm_settings')
      .select('twilio_subaccount_sid, twilio_subaccount_auth_token')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();
    const row = data as { twilio_subaccount_sid?: string | null; twilio_subaccount_auth_token?: string | null } | null;
    if (row?.twilio_subaccount_sid && row?.twilio_subaccount_auth_token) return row.twilio_subaccount_auth_token;
  } catch (err) {
    console.error('[WS] Error leyendo comm_settings:', err instanceof Error ? err.message : err);
  }
  return process.env.TWILIO_MASTER_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || null;
}

function reject(socket: Duplex, status: number, reason: string): void {
  const text = status === 401 ? 'Unauthorized' : 'Forbidden';
  console.warn(`[WS] Upgrade rechazado (${status}): ${reason}`);
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch {
    /* noop */
  }
  socket.destroy();
}

/**
 * Verifica token de sesión + firma de Twilio en el handshake.
 * Devuelve los claims si todo es válido; si no, responde y cierra el socket.
 */
async function authenticateUpgrade(req: IncomingMessage, socket: Duplex): Promise<WsSessionClaims | null> {
  const origin = getPublicWsOrigin();
  if (!origin) {
    reject(socket, 403, 'WS_PUBLIC_URL/WS_SERVER_URL no configurado');
    return null;
  }

  const url = new URL(req.url || '/', origin);
  if (url.pathname !== WS_PATH) {
    reject(socket, 404, `ruta no soportada ${url.pathname}`);
    return null;
  }

  // 1. Token de sesión (query ?st=)
  const claims = verifyWsSessionToken(url.searchParams.get('st'));
  if (!claims) {
    reject(socket, 401, 'token de sesión ausente/inválido/expirado');
    return null;
  }

  // 2. Firma de Twilio sobre la URL wss completa (sin params POST)
  const signature = String(req.headers['x-twilio-signature'] || '');
  const authToken = await getTwilioAuthTokenForOrg(claims.orgId);
  if (!signature || !authToken) {
    reject(socket, 403, 'sin X-Twilio-Signature o sin Auth Token para la org');
    return null;
  }

  // Twilio firma la URL tal como la configuró el TwiML (esquema wss:// o https://).
  const signedUrl = `${origin}${url.pathname}${url.search}`;
  const httpsUrl = signedUrl.replace(/^wss:\/\//, 'https://');
  const valid = verifyTwilioUrlSignature(authToken, signature, signedUrl) || verifyTwilioUrlSignature(authToken, signature, httpsUrl);
  if (!valid) {
    reject(socket, 403, 'X-Twilio-Signature inválida');
    return null;
  }

  return claims;
}

// ─── WebSocket Server (noServer: el upgrade lo autenticamos nosotros) ───

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  authenticateUpgrade(req, socket)
    .then((claims) => {
      if (!claims) return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, claims);
      });
    })
    .catch((err) => {
      console.error('[WS] Error autenticando upgrade:', err instanceof Error ? err.message : err);
      reject(socket, 403, 'error interno de autenticación');
    });
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage, claims: WsSessionClaims) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Nueva conexión desde ${clientIp} (org ${claims.orgId}, call ${claims.callSid || claims.callId || '-'})`);

  handleConversationRelayConnection(ws, claims);
});

wss.on('error', (error) => {
  console.error('[WS] Error del servidor:', error);
});

// ─── Start ──────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🎙️  Voice Agent WebSocket Server`);
  console.log(`   Puerto: ${PORT}`);
  console.log(`   Ruta:   ws://localhost:${PORT}${WS_PATH}?st=<token>`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  if (!process.env.WS_SESSION_SECRET) console.warn('   ⚠️  WS_SESSION_SECRET no configurado: todas las conexiones serán rechazadas');
  if (!getPublicWsOrigin()) console.warn('   ⚠️  WS_PUBLIC_URL no configurado: todas las conexiones serán rechazadas\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[WS] Cerrando servidor...');
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, 'Server shutting down');
    }
  });
  server.close(() => {
    console.log('[WS] Servidor cerrado.');
    process.exit(0);
  });
});
