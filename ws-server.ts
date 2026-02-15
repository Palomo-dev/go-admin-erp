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
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { handleConversationRelayConnection } from './src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler';

const PORT = parseInt(process.env.WS_PORT || '8080', 10);

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

// ─── WebSocket Server ───────────────────────────────────

const wss = new WebSocketServer({ server, path: '/conversation-relay' });

wss.on('connection', (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Nueva conexión desde ${clientIp}`);

  handleConversationRelayConnection(ws);
});

wss.on('error', (error) => {
  console.error('[WS] Error del servidor:', error);
});

// ─── Start ──────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🎙️  Voice Agent WebSocket Server`);
  console.log(`   Puerto: ${PORT}`);
  console.log(`   Ruta:   ws://localhost:${PORT}/conversation-relay`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
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
