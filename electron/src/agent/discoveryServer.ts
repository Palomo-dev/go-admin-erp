/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
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

export interface UsbDevice {
  /** Formato "0x04b8": es el que `Number()` sabe convertir al imprimir. */
  vendorId: string;
  productId: string;
  /** Nombre legible resuelto por el sistema, si se pudo obtener. */
  name?: string;
  /**
   * true si el dispositivo se declara de clase Impresora (clase USB 7), sea en
   * el descriptor del dispositivo o en alguna de sus interfaces. Sirve para
   * destacar los candidatos reales entre todo lo que hay conectado al bus.
   */
  isPrinter: boolean;
}

/** Clase USB 7 = Printer, segun la especificacion USB. */
const USB_CLASS_PRINTER = 7;

function toHexId(value: number): string {
  return `0x${value.toString(16).padStart(4, '0')}`;
}

/**
 * Enumera los dispositivos visibles en el bus USB.
 *
 * Se usa la API WebUSB del paquete `usb`, no la clasica `getDeviceList`: a
 * partir de usb@2 la API legacy dejo de exponerse y en usb@3 `require('usb').usb`
 * ya es una instancia de WebUSB, con lo que `getDeviceList` y `findByIds` son
 * `undefined`. `allowAllDevices` es imprescindible porque, sin el, WebUSB solo
 * devuelve los dispositivos previamente "autorizados".
 *
 * LIMITACION IMPORTANTE, no es un fallo de esta funcion:
 * libusb solo ve dispositivos cuyo driver sea compatible (WinUSB/libusbK). Una
 * impresora instalada como impresora de Windows pertenece al spooler
 * (`usbprint.sys`) y NO aparece aqui por diseno. Para esas hay que usar el tipo
 * de conexion "Impresora del sistema", que imprime a traves del propio Windows.
 */
async function listUsbDevices(): Promise<UsbDevice[]> {
  const usbModule = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('usb');
    } catch {
      return null;
    }
  })();

  if (!usbModule?.WebUSB) return [];

  let devices: any[];
  try {
    const webusb = new usbModule.WebUSB({ allowAllDevices: true });
    devices = (await webusb.getDevices()) || [];
  } catch (err) {
    console.error('[discovery] Error enumerando dispositivos USB:', err);
    return [];
  }

  const names = await listWindowsUsbNames();

  const seen = new Set<string>();
  const result: UsbDevice[] = [];

  for (const device of devices) {
    if (typeof device?.vendorId !== 'number' || typeof device?.productId !== 'number') continue;

    const vendorId = toHexId(device.vendorId);
    const productId = toHexId(device.productId);
    const key = `${vendorId}:${productId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // La clase se declara casi siempre en la interfaz, no en el dispositivo.
    const interfaces = device.configuration?.interfaces || [];
    const isPrinter = interfaces.some(
      (iface: any) => iface?.alternate?.interfaceClass === USB_CLASS_PRINTER
    );

    result.push({
      vendorId,
      productId,
      // El nombre de Windows ("POS-80C") suele ser mas reconocible que el
      // descriptor del dispositivo ("USB Printing Support").
      name: names.get(key) || device.productName || device.manufacturerName,
      isPrinter,
    });
  }

  // Las impresoras primero: es lo que el usuario viene a buscar.
  return result.sort((a, b) => Number(b.isPrinter) - Number(a.isPrinter));
}

/**
 * Mapa "0xVVVV:0xPPPP" -> nombre legible, leido del inventario PnP de Windows.
 *
 * libusb entrega los identificadores pero no el nombre comercial sin abrir el
 * dispositivo. Windows ya lo tiene registrado, asi que se consulta ahi.
 */
async function listWindowsUsbNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (process.platform !== 'win32') return names;

  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const cmd =
      'powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | ' +
      'Where-Object { $_.DeviceID -like \'USB\\VID_*\' } | ' +
      'Select-Object Name, DeviceID | ConvertTo-Json -Compress"';

    exec(cmd, { timeout: 15000, windowsHide: true }, (err: Error | null, stdout: string) => {
      if (err) return resolve(names);
      try {
        const raw = stdout.trim();
        if (!raw) return resolve(names);
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];

        for (const entry of list) {
          const match = /USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(entry?.DeviceID || '');
          if (!match || !entry?.Name) continue;
          const key = `0x${match[1].toLowerCase()}:0x${match[2].toLowerCase()}`;
          if (!names.has(key)) names.set(key, entry.Name);
        }
      } catch {
        // Sin nombres legibles la lista sigue siendo util: los IDs son lo
        // imprescindible para configurar la impresora.
      }
      resolve(names);
    });
  });
}

/**
 * Lista las impresoras instaladas en el sistema operativo.
 * Intenta primero el paquete nativo `printer`; si no está disponible
 * (no compiló en este equipo), usa PowerShell (Win32_Printer) como fallback.
 */
async function listSystemPrinters(): Promise<SystemPrinter[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodePrinter = require('printer');
    const printers = nodePrinter.getPrinters() || [];
    return printers.map((p: any) => ({
      name: p.name || 'Desconocida',
      isDefault: p.isDefault || false,
    }));
  } catch {
    // Módulo nativo no disponible: fallback por sistema operativo
  }

  if (process.platform === 'win32') {
    try {
      return await listWindowsPrinters();
    } catch (err) {
      console.error('[discovery] Error listando impresoras via PowerShell:', err);
    }
  }

  return [];
}

/**
 * Fallback Windows: lista impresoras con PowerShell (no requiere módulos nativos).
 */
function listWindowsPrinters(): Promise<SystemPrinter[]> {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    const cmd =
      'powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress"';
    exec(cmd, { timeout: 15000, windowsHide: true }, (err: Error | null, stdout: string) => {
      if (err) return reject(err);
      try {
        const raw = stdout.trim();
        if (!raw) return resolve([]);
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        resolve(
          list.map((p: any) => ({
            name: p.Name || 'Desconocida',
            isDefault: Boolean(p.Default),
          }))
        );
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
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
 *   GET /usb           → enumera dispositivos USB con su vendor_id/product_id
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
        const printers = await listSystemPrinters();
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

    if (req.url === '/usb') {
      try {
        const devices = await listUsbDevices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ devices }));
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
    console.log(`[discovery]   GET /usb       - dispositivos USB (vendor/product id)`);
  });

  return server;
}
