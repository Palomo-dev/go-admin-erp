#!/usr/bin/env node
// ============================================================================
// Microservicio WhatsApp QR (Baileys) – GO Admin ERP
// Proceso Node SEPARADO del Next.js. Mantiene WebSockets persistentes con WA.
// Ref: docs/integraciones/whatsapp-qr-baileys.md
// ============================================================================
// Uso:
//   node scripts/whatsapp-qr-server.mjs
// Variables de entorno:
//   WHATSAPP_QR_SERVER_PORT (default 3001)
//   WHATSAPP_QR_SERVER_SECRET (shared secret con el ERP)
//   ERP_WEBHOOK_URL (endpoint /api/integrations/whatsapp/qr/inbound del ERP)
//   SESSIONS_DIR (default .whatsapp-qr-sessions)
//   MAX_SESSIONS (default 50)
// ============================================================================

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Baileys se importa dinámicamente para que el microservicio arranque aun si
// la dependencia no está instalada todavía (mensaje de error claro).
let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let fetchBaileysProto;
let isJidUser;
try {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.makeWASocket;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchBaileysProto = baileys.fetchLatestBaileysVersion;
  isJidUser = baileys.isJidUser;
} catch {
  console.error('[QR-Server] Falta dependencia @whiskeysockets/baileys.');
  console.error('[QR-Server] Instala con:  npm install @whiskeysockets/baileys');
  process.exit(1);
}

// ─── Config ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.WHATSAPP_QR_SERVER_PORT || '3001', 10);
const SECRET = process.env.WHATSAPP_QR_SERVER_SECRET || '';
const ERP_WEBHOOK_URL = process.env.ERP_WEBHOOK_URL || '';
const SESSIONS_DIR = process.env.SESSIONS_DIR || '.whatsapp-qr-sessions';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '50', 10);
const RECONNECT_MAX = 5;
const RECONNECT_BASE_MS = 2000;

if (!SECRET) {
  console.error('[QR-Server] WHATSAPP_QR_SERVER_SECRET es obligatorio.');
  process.exit(1);
}
if (!ERP_WEBHOOK_URL) {
  console.error('[QR-Server] ERP_WEBHOOK_URL es obligatorio.');
  process.exit(1);
}

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ─── Estado en memoria ─────────────────────────────────────────────────────
// sessionRef -> { sock, status, qr, phone, reconnectAttempts, watchdog }
const sessions = new Map();

function sessionDir(sessionRef) {
  return path.join(SESSIONS_DIR, sessionRef);
}

// ─── Callbacks al ERP ──────────────────────────────────────────────────────
async function notifyErp(sessionRef, event, payload = {}) {
  try {
    await fetch(ERP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-qr-server-secret': SECRET,
      },
      body: JSON.stringify({ sessionRef, event, ...payload }),
    });
  } catch (err) {
    console.error(`[QR-Server] notifyErp(${event}) fallo:`, err.message);
  }
}

// ─── Gestión de sesiones Baileys ───────────────────────────────────────────
async function startSession(sessionRef) {
  if (sessions.has(sessionRef)) {
    return { status: sessions.get(sessionRef).status, qr: sessions.get(sessionRef).qr || null };
  }
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Límite de sesiones (${MAX_SESSIONS}) alcanzado`);
  }

  const dir = sessionDir(sessionRef);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchBaileysProto();

  const entry = {
    sock: null,
    status: 'connecting',
    qr: null,
    phone: null,
    reconnectAttempts: 0,
    watchdog: null,
    lastEventAt: Date.now(),
  };
  sessions.set(sessionRef, entry);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['GO Admin ERP', 'Chrome', '1.0.0'],
    connectTimeoutMs: 20000,
  });
  entry.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;
    entry.lastEventAt = Date.now();

    if (qr) {
      entry.status = 'qr_ready';
      entry.qr = qr;
      await notifyErp(sessionRef, 'qr', { qr });
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      entry.reconnectAttempts = 0;
      entry.phone = sock.user?.id || null;
      startWatchdog(sessionRef);
      await notifyErp(sessionRef, 'connected', { phone: entry.phone });
    }

    if (connection === 'close') {
      stopWatchdog(sessionRef);
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect =
        code !== DisconnectReason.loggedOut &&
        entry.reconnectAttempts < RECONNECT_MAX;

      if (code === DisconnectReason.loggedOut) {
        entry.status = 'disconnected';
        entry.qr = null;
        // Credenciales borradas por Baileys → requiere re-escanear
        await notifyErp(sessionRef, 'disconnected', { reason: 'logged_out' });
        sessions.delete(sessionRef);
        return;
      }

      if (shouldReconnect) {
        entry.reconnectAttempts += 1;
        entry.status = 'reconnecting';
        const delay = RECONNECT_BASE_MS * 2 ** (entry.reconnectAttempts - 1);
        setTimeout(() => {
          sessions.delete(sessionRef);
          startSession(sessionRef).catch((err) => {
            console.error(`[QR-Server] reconnect(${sessionRef}) error:`, err.message);
            entry.status = 'error';
            notifyErp(sessionRef, 'error', { error: err.message });
          });
        }, delay);
      } else {
        entry.status = 'error';
        await notifyErp(sessionRef, 'error', {
          error: `Reconnect agotado (${entry.reconnectAttempts} intentos)`,
        });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // solo mensajes nuevos
    entry.lastEventAt = Date.now();
    console.log(`[QR-Server] messages.upsert: ${messages.length} mensaje(s) type=${type} en ${sessionRef}`);
    for (const msg of messages) {
      const from = msg.key?.remoteJid;
      const fromMe = msg.key?.fromMe;
      const hasMsg = !!msg.message;
      console.log(`[QR-Server] msg: from=${from} fromMe=${fromMe} hasMessage=${hasMsg} keys=${Object.keys(msg.message || {}).join(',')}`);
      if (!hasMsg || fromMe) continue;
      // Aceptar @s.whatsapp.net (chat individual) o @lid (nueva identidad LID de WhatsApp)
      if (!from || (!from.endsWith('@s.whatsapp.net') && !from.endsWith('@lid'))) {
        console.log(`[QR-Server] ignorando jid: ${from}`);
        continue;
      }

      const extracted = extractBaileysMessage(msg);
      console.log(`[QR-Server] → mensaje de ${from}: ${extracted.type}`);
      await notifyErp(sessionRef, 'message', {
        from,
        messageId: msg.key.id,
        timestamp: msg.messageTimestamp || Date.now(),
        ...extracted,
      });
    }
  });

  // Detección de alertas de Meta (no es un evento oficial, pero logs lo revelan)
  sock.ev.on('qrcode.update', () => {});

  return { status: entry.status, qr: entry.qr };
}

function extractBaileysMessage(msg) {
  const m = msg.message;
  if (m.conversation || m.extendedTextMessage?.text) {
    return { type: 'text', text: m.conversation || m.extendedTextMessage?.text || '' };
  }
  if (m.imageMessage) {
    return {
      type: 'image',
      mime: m.imageMessage.mimetype,
      caption: m.imageMessage.caption || null,
      // Baileys guarda media en buffer; el ERP la descarga vía /media endpoint
      hasMedia: true,
    };
  }
  if (m.audioMessage) {
    return { type: 'audio', mime: m.audioMessage.mimetype, hasMedia: true };
  }
  if (m.documentMessage) {
    return {
      type: 'document',
      mime: m.documentMessage.mimetype,
      filename: m.documentMessage.fileName || null,
      hasMedia: true,
    };
  }
  if (m.videoMessage) {
    return { type: 'video', mime: m.videoMessage.mimetype, caption: m.videoMessage.caption || null, hasMedia: true };
  }
  if (m.locationMessage) {
    return {
      type: 'location',
      latitude: m.locationMessage.degreesLatitude,
      longitude: m.locationMessage.degreesLongitude,
      name: m.locationMessage.name || null,
    };
  }
  return { type: 'unknown', raw: Object.keys(m) };
}

function startWatchdog(sessionRef) {
  const entry = sessions.get(sessionRef);
  if (!entry) return;
  stopWatchdog(sessionRef);
  // Watchdog deshabilitado cuando la conexión está abierta.
  // Baileys maneja reconexiones internamente: si el WebSocket se cae,
  // dispara connection.update con connection='close' y reconectamos ahí.
  // El watchdog solo causa desconexiones innecesarias en conexiones sanas.
}

function stopWatchdog(sessionRef) {
  const entry = sessions.get(sessionRef);
  if (entry?.watchdog) {
    clearInterval(entry.watchdog);
    entry.watchdog = null;
  }
}

async function stopSession(sessionRef) {
  const entry = sessions.get(sessionRef);
  if (!entry) return { status: 'disconnected' };
  stopWatchdog(sessionRef);
  try { await entry.sock?.logout(); } catch { /* puede no estar conectado */ }
  entry.status = 'disconnected';
  sessions.delete(sessionRef);
  await notifyErp(sessionRef, 'disconnected', { reason: 'manual_stop' });
  return { status: 'disconnected' };
}

async function logoutSession(sessionRef) {
  await stopSession(sessionRef);
  const dir = sessionDir(sessionRef);
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: 'disconnected', cleared: true };
}

function getStatus(sessionRef) {
  const entry = sessions.get(sessionRef);
  if (!entry) return { status: 'disconnected', qr: null };
  return { status: entry.status, qr: entry.qr, phone: entry.phone };
}

async function sendMessage(sessionRef, to, text) {
  const entry = sessions.get(sessionRef);
  if (!entry || entry.status !== 'connected') {
    throw new Error('Sesión no conectada');
  }
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  const result = await entry.sock.sendMessage(jid, { text });
  return { externalId: result?.key?.id || null };
}

async function sendMedia(sessionRef, to, type, url, caption) {
  const entry = sessions.get(sessionRef);
  if (!entry || entry.status !== 'connected') {
    throw new Error('Sesión no conectada');
  }
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  const content = { caption };
  if (type === 'image') content.image = { url };
  else if (type === 'video') content.video = { url };
  else if (type === 'document') content.document = { url };
  else if (type === 'audio') content.audio = { url };
  else throw new Error(`Tipo media no soportado: ${type}`);
  const result = await entry.sock.sendMessage(jid, content);
  return { externalId: result?.key?.id || null };
}

async function markRead(sessionRef, jid, messageId) {
  const entry = sessions.get(sessionRef);
  if (!entry || entry.status !== 'connected') return false;
  await entry.sock.sendReadReceipt(jid, entry.sock.user?.id, [messageId]);
  return true;
}

// ─── HTTP server interno ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Health check sin auth
  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    return;
  }

  // Validar secret en todas las demás rutas
  if (req.headers['x-qr-server-secret'] !== SECRET) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const segments = url.pathname.split('/').filter(Boolean);

  try {
    // /status/:sessionRef
    if (req.method === 'GET' && segments[0] === 'status' && segments[1]) {
      res.end(JSON.stringify(getStatus(segments[1])));
      return;
    }
    // /start/:sessionRef
    if (req.method === 'POST' && segments[0] === 'start' && segments[1]) {
      const result = await startSession(segments[1]);
      res.end(JSON.stringify(result));
      return;
    }
    // /stop/:sessionRef
    if (req.method === 'POST' && segments[0] === 'stop' && segments[1]) {
      const result = await stopSession(segments[1]);
      res.end(JSON.stringify(result));
      return;
    }
    // /logout/:sessionRef
    if (req.method === 'POST' && segments[0] === 'logout' && segments[1]) {
      const result = await logoutSession(segments[1]);
      res.end(JSON.stringify(result));
      return;
    }
    // /send
    if (req.method === 'POST' && segments[0] === 'send') {
      const body = await readJson(req);
      const result = await sendMessage(body.sessionRef, body.to, body.text);
      res.end(JSON.stringify(result));
      return;
    }
    // /send-media
    if (req.method === 'POST' && segments[0] === 'send-media') {
      const body = await readJson(req);
      const result = await sendMedia(body.sessionRef, body.to, body.type, body.url, body.caption);
      res.end(JSON.stringify(result));
      return;
    }
    // /mark-read
    if (req.method === 'POST' && segments[0] === 'mark-read') {
      const body = await readJson(req);
      const ok = await markRead(body.sessionRef, body.jid, body.messageId);
      res.end(JSON.stringify({ ok }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch (err) {
    console.error('[QR-Server] handler error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
});

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

server.listen(PORT, () => {
  console.log(`[QR-Server] Escuchando en http://localhost:${PORT}`);
  console.log(`[QR-Server] Webhook ERP: ${ERP_WEBHOOK_URL}`);
  console.log(`[QR-Server] Sesiones dir: ${SESSIONS_DIR} (máx ${MAX_SESSIONS})`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[QR-Server] SIGTERM, cerrando sesiones...');
  for (const ref of sessions.keys()) {
    try { await stopSession(ref); } catch { /* noop */ }
  }
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => process.emit('SIGTERM'));
