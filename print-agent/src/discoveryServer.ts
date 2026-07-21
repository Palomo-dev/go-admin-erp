import http from 'http';
import { config } from './config';

export interface SystemPrinter {
  name: string;
  isDefault: boolean;
}

export interface NetworkPrinter {
  ip: string;
  port: number;
  name?: string;
}

/**
 * Lista las impresoras instaladas en el sistema operativo usando el paquete `printer`.
 */
function listSystemPrinters(): SystemPrinter[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodePrinter = require('printer');
    const printers = nodePrinter.getPrinters() || [];
    return printers.map((p: any) => ({
      name: p.name || 'Desconocida',
      isDefault: p.isDefault || false,
    }));
  } catch (err) {
    console.error('[discovery] Error listando impresoras del sistema:', err);
    return [];
  }
}

/**
 * Escanea la red local buscando dispositivos con el puerto 9100 abierto (impresoras ESC/POS).
 * Toma como base la IP local del equipo y escanea el rango 1-254.
 */
async function discoverNetworkPrinters(): Promise<NetworkPrinter[]> {
  const results: NetworkPrinter[] = [];
  const localIP = getLocalIP();
  if (!localIP) {
    console.error('[discovery] No se pudo determinar la IP local');
    return results;
  }

  const base = localIP.split('.').slice(0, 3).join('.');
  const port = 9100;

  const probes = Array.from({ length: 254 }, (_, i) => {
    const ip = `${base}.${i + 1}`;
    return probePort(ip, port, 500).then((open) => {
      if (open) results.push({ ip, port });
    });
  });

  await Promise.all(probes);
  return results.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
}

function getLocalIP(): string | null {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function probePort(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    let done = false;

    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));

    socket.connect(port, ip);
  });
}

/**
 * Inicia un servidor HTTP local en el puerto configurado.
 * Endpoints:
 *   GET /health        → estado del agente
 *   GET /printers      → lista impresoras del sistema operativo
 *   GET /discover      → escanea la red local en busca de impresoras (puerto 9100)
 */
export function startDiscoveryServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agent: config.agentName }));
      return;
    }

    if (req.url === '/printers') {
      try {
        const printers = listSystemPrinters();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ printers }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.url === '/discover') {
      try {
        const printers = await discoverNetworkPrinters();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ printers }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const port = config.discoveryPort;

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(
        `[discovery] El puerto ${port} ya está en uso (¿otra instancia del agente corriendo?). ` +
          'El servidor de descubrimiento no se iniciará en esta instancia, pero la impresión seguirá funcionando.'
      );
    } else {
      console.error('[discovery] Error en el servidor de descubrimiento:', err);
    }
  });

  server.listen(port, () => {
    console.log(`[discovery] Servidor de descubrimiento en http://localhost:${port}`);
    console.log(`[discovery]   GET /health   - estado del agente`);
    console.log(`[discovery]   GET /printers  - impresoras del sistema`);
    console.log(`[discovery]   GET /discover  - escanear red local (puerto 9100)`);
  });

  return server;
}
