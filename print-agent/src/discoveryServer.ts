import http from 'http';
import { config } from './config';
import { buildCashDrawerBuffer } from './printing/escposBuffer';
import { sendRawToPrinter } from './transports/rawSpooler';

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
  /**
   * true si el dispositivo fue detectado via PowerShell/WMI (no via libusb).
   * Las impresoras USB instaladas como impresora de Windows (usbprint.sys)
   * no aparecen via libusb pero si via Win32_PnPEntity.
   */
  viaWmi?: boolean;
}

export interface BluetoothDevice {
  /** Nombre legible del dispositivo Bluetooth. */
  name: string;
  /** Dirección MAC del dispositivo. */
  macAddress: string;
  /** true si el dispositivo está emparejado con el SO. */
  isPaired: boolean;
  /** true si parece ser una impresora (por nombre o clase). */
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
  const seen = new Set<string>();
  const result: UsbDevice[] = [];

  // --- 1. Escaneo libusb (dispositivos WinUSB/libusbK) ---
  const usbModule = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('usb');
    } catch {
      return null;
    }
  })();

  if (usbModule?.WebUSB) {
    try {
      const webusb = new usbModule.WebUSB({ allowAllDevices: true });
      const devices = (await webusb.getDevices()) || [];
      const names = await listWindowsUsbNames();

      for (const device of devices) {
        if (typeof device?.vendorId !== 'number' || typeof device?.productId !== 'number') continue;

        const vendorId = toHexId(device.vendorId);
        const productId = toHexId(device.productId);
        const key = `${vendorId}:${productId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const interfaces = device.configuration?.interfaces || [];
        const isPrinter = interfaces.some(
          (iface: any) => iface?.alternate?.interfaceClass === USB_CLASS_PRINTER
        );

        result.push({
          vendorId,
          productId,
          name: names.get(key) || device.productName || device.manufacturerName,
          isPrinter,
        });
      }
    } catch (err) {
      console.error('[discovery] Error enumerando dispositivos USB via libusb:', err);
    }
  }

  // --- 2. Fallback PowerShell: impresoras USB via usbprint.sys ---
  // libusb no ve dispositivos del spooler de Windows. Win32_PnPEntity sí.
  if (process.platform === 'win32') {
    try {
      const wmiPrinters = await listWindowsUsbPrinters();
      for (const p of wmiPrinters) {
        const key = `${p.vendorId}:${p.productId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          vendorId: p.vendorId,
          productId: p.productId,
          name: p.name,
          isPrinter: true,
          viaWmi: true,
        });
      }
    } catch (err) {
      console.error('[discovery] Error enumerando impresoras USB via WMI:', err);
    }

    // --- 3. Impresoras en puertos USB virtuales (USB001, USB002...) ---
    try {
      const usbPortPrinters = await listUsbPortPrinters();
      for (const p of usbPortPrinters) {
        const key = `usbport:${p.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`[discovery] Impresora puerto USB: ${p.name} (${p.portName})`);
        result.push({
          vendorId: '0x0000',
          productId: '0x0000',
          name: `${p.name} (${p.portName})`,
          isPrinter: true,
          viaWmi: true,
        });
      }
    } catch (err) {
      console.error('[discovery] Error enumerando impresoras puerto USB:', err);
    }
  }

  // Las impresoras primero: es lo que el usuario viene a buscar.
  return result.sort((a, b) => Number(b.isPrinter) - Number(a.isPrinter));
}

/**
 * Fallback Windows: enumera impresoras USB via Win32_PnPEntity.
 * Consulta dispositivos cuya clase PnP es 'Printer' o 'USB' y cuyo nombre
 * sugiere impresora térmica. Esto detecta impresoras que libusb no ve
 * porque usan el driver usbprint.sys del spooler de Windows.
 */
function listWindowsUsbPrinters(): Promise<{ vendorId: string; productId: string; name: string }[]> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const cmd =
      'powershell -NoProfile -Command "' +
      'Get-CimInstance Win32_PnPEntity | ' +
      "Where-Object { `$_.DeviceID -like 'USB\\VID_*' } | " +
      'Select-Object Name, DeviceID, Class | ConvertTo-Json -Compress"';

    exec(cmd, { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err: Error | null, stdout: string) => {
      if (err) {
        console.error('[discovery] Error ejecutando WMI USB query:', err.message);
        return resolve([]);
      }
      try {
        const raw = stdout.trim();
        if (!raw) {
          console.log('[discovery] WMI USB: respuesta vacía');
          return resolve([]);
        }
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        console.log(`[discovery] WMI USB: ${list.length} dispositivos USB encontrados`);
        const result: { vendorId: string; productId: string; name: string }[] = [];

        for (const entry of list) {
          const match = /VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})/.exec(entry?.DeviceID || '');
          if (!match) continue;
          const name = entry?.Name || `USB ${match[1]}:${match[2]}`;
          console.log(`[discovery] WMI USB: ${name} (${entry?.Class || '?'}) ${match[1]}:${match[2]}`);
          result.push({
            vendorId: `0x${match[1].toLowerCase()}`,
            productId: `0x${match[2].toLowerCase()}`,
            name,
          });
        }
        resolve(result);
      } catch (parseErr: any) {
        console.error('[discovery] Error parseando WMI USB:', parseErr.message);
        resolve([]);
      }
    });
  });
}

/**
 * Detecta impresoras instaladas en puertos USB (USB001, USB002, etc.).
 * Muchas impresoras USB térmicas se instalan como impresora de Windows
 * en un puerto USB virtual y no aparecen como dispositivo USB raw.
 */
function listUsbPortPrinters(): Promise<{ name: string; portName: string }[]> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const cmd =
      'powershell -NoProfile -Command "' +
      'Get-CimInstance Win32_Printer | ' +
      "Where-Object { `$_.PortName -match '^USB' } | " +
      'Select-Object Name, PortName | ConvertTo-Json -Compress"';

    exec(cmd, { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err: Error | null, stdout: string) => {
      if (err) {
        console.error('[discovery] Error listando impresoras en puerto USB:', err.message);
        return resolve([]);
      }
      try {
        const raw = stdout.trim();
        if (!raw) return resolve([]);
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        console.log(`[discovery] Impresoras en puerto USB: ${list.length}`);
        resolve(list.map((e: any) => ({ name: e?.Name || '', portName: e?.PortName || '' })));
      } catch (parseErr: any) {
        console.error('[discovery] Error parseando impresoras puerto USB:', parseErr.message);
        resolve([]);
      }
    });
  });
}

/**
 * Lista dispositivos Bluetooth emparejados en Windows via PowerShell.
 * Usa Get-PnpDevice para enumerar dispositivos de clase Bluetooth.
 * Filtra los que parecen impresoras por nombre.
 */
async function listBluetoothPrinters(): Promise<BluetoothDevice[]> {
  if (process.platform !== 'win32') return [];

  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const cmd =
      'powershell -NoProfile -Command "' +
      'Get-PnpDevice | ' +
      "Where-Object { (`$_.Class -eq 'Bluetooth' -or `$_.Class -eq 'Printer') -and `$_.Status -eq 'OK' } | " +
      'Select-Object FriendlyName, DeviceID, Status, Class | ConvertTo-Json -Compress"';

    exec(cmd, { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err: Error | null, stdout: string) => {
      if (err) {
        console.error('[discovery] Error listando Bluetooth:', err.message);
        return resolve([]);
      }
      try {
        const raw = stdout.trim();
        if (!raw) return resolve([]);
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        console.log(`[discovery] Bluetooth: ${list.length} dispositivos encontrados`);
        const result: BluetoothDevice[] = [];

        for (const entry of list) {
          const name = entry?.FriendlyName || 'Dispositivo desconocido';
          const deviceId = entry?.DeviceID || '';
          const deviceClass = entry?.Class || '';

          const isBtDevice = deviceClass === 'Bluetooth' || /BTHENUM|BTHLE/i.test(deviceId);
          if (!isBtDevice && deviceClass !== 'Printer') continue;

          console.log(`[discovery] Bluetooth/Printer: ${name} (${deviceClass}) ${deviceId}`);

          // Extraer MAC del DeviceID
          const macMatch = /Dev_([0-9A-Fa-f]{12})/.exec(deviceId);
          const macAddress = macMatch
            ? macMatch[1].replace(/(.{2})/g, '$1:').slice(0, -1).toUpperCase()
            : '';

          // Impresora si la clase es Printer o el nombre lo sugiere
          const isPrinter = deviceClass === 'Printer' || /printer|impresora|pos|thermal|receipt|ticket|80|58|tsc|xprinter|epson|star/i.test(name);

          result.push({
            name,
            macAddress,
            isPaired: true,
            isPrinter,
          });
        }

        // Impresoras primero
        resolve(result.sort((a, b) => Number(b.isPrinter) - Number(a.isPrinter)));
      } catch (parseErr) {
        console.error('[discovery] Error parseando Bluetooth:', parseErr);
        resolve([]);
      }
    });
  });
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
 *   GET /bluetooth     → lista dispositivos Bluetooth emparejados
 */
export function startDiscoveryServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = (req.url || '').split('?')[0].replace(/\/$/, '') || '/';

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agent: config.agentName }));
      return;
    }

    if (url === '/printers') {
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

    if (url === '/discover') {
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

    if (url === '/usb') {
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

    if (url === '/bluetooth') {
      try {
        const devices = await listBluetoothPrinters();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ devices }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url === '/debug-usb') {
      try {
        const { exec } = require('child_process');
        const cmd =
          'powershell -NoProfile -Command "' +
          'Get-CimInstance Win32_PnPEntity | ' +
          "Where-Object { `$_.DeviceID -like 'USB\\VID_*' } | " +
          'Select-Object Name, DeviceID, Class, Status | ConvertTo-Json -Compress"';
        exec(cmd, { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err: Error | null, stdout: string, stderr: string) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: err?.message || null,
            stderr: stderr || null,
            raw: stdout.trim() || null,
          }));
        });
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // POST /open-cash-drawer — envía comando ESC/POS de apertura de cajón
    // Body: { "printerName": "POS-80C" } (opcional, usa default si no se pasa)
    if (url === '/open-cash-drawer' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let printerName: string | undefined;
      try {
        const parsed = JSON.parse(body);
        printerName = parsed.printerName;
      } catch { /* body vacío o inválido, usar default */ }

      try {
        const buffer = await buildCashDrawerBuffer();
        if (!printerName) {
          const printers = await listSystemPrinters();
          const defaultPrinter = printers.find(p => p.isDefault) || printers[0];
          if (!defaultPrinter) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No hay impresoras del sistema' }));
            return;
          }
          printerName = defaultPrinter.name;
        }
        await sendRawToPrinter(printerName, buffer);
        console.log(`[discovery] open-cash-drawer: comando enviado a "${printerName}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        console.error('[discovery] open-cash-drawer error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
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
    console.log(`[discovery]   GET /bluetooth - dispositivos Bluetooth emparejados`);
    console.log(`[discovery]   GET /debug-usb - diagnóstico raw de PowerShell USB`);
  });

  return server;
}
