import type { PrinterRow, PrintJobPayload, PrintJobRow } from './types';
import { printKitchenTicket, buildPlainTextTicket, printSaleTicket, buildPlainTextSaleTicket } from './escposFormatter';
import { buildSaleTicketHTML, buildKitchenTicketHTML } from './htmlFormatter';

function renderToDevice(device_: any, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): void {
  if (jobType === 'sale_ticket' || jobType === 'pre_cuenta') {
    printSaleTicket(device_, payload as any);
  } else {
    printKitchenTicket(device_, payload as any);
  }
}

function renderPlainText(jobType: PrintJobRow['job_type'], payload: PrintJobPayload): string {
  return jobType === 'sale_ticket' || jobType === 'pre_cuenta'
    ? buildPlainTextSaleTicket(payload as any)
    : buildPlainTextTicket(payload as any);
}

function renderHTML(jobType: PrintJobRow['job_type'], payload: PrintJobPayload): string {
  return jobType === 'sale_ticket' || jobType === 'pre_cuenta'
    ? buildSaleTicketHTML(payload as any)
    : buildKitchenTicketHTML(payload as any);
}

// Los paquetes escpos-* no traen tipados oficiales completos; se cargan con require
// y se tratan como `any` para simplificar la integración.
// USB, Bluetooth y printer son módulos NATIVOS opcionales (requieren compilación):
// si no están instalados, el agente sigue funcionando con red y sistema.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const escpos = require('escpos');
// eslint-disable-next-line @typescript-eslint/no-var-requires
escpos.Network = require('escpos-network');

function tryRequire(moduleName: string): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(moduleName);
  } catch {
    return null;
  }
}

escpos.USB = tryRequire('escpos-usb');
escpos.Bluetooth = tryRequire('escpos-bluetooth');

/**
 * Imprime la comanda en la impresora indicada, según su connection_type.
 * Lanza una excepción si algo falla (el llamador debe capturarla y marcar
 * el print_job como 'error').
 */
export async function printToDevice(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  switch (printer.connection_type) {
    case 'network':
      return printViaNetwork(printer, jobType, payload);
    case 'usb':
      return printViaUsb(printer, jobType, payload);
    case 'bluetooth':
      return printViaBluetooth(printer, jobType, payload);
    case 'system':
      return printViaSystem(printer, jobType, payload);
    default:
      throw new Error(`Tipo de conexión no soportado: ${printer.connection_type}`);
  }
}

function printViaNetwork(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  if (!printer.ip_address) {
    throw new Error(`Impresora "${printer.name}" no tiene ip_address configurada`);
  }
  const port = printer.port || 9100;

  return new Promise((resolve, reject) => {
    const device = new escpos.Network(printer.ip_address, port);
    const device_ = new escpos.Printer(device);

    device.open((err: any) => {
      if (err) return reject(new Error(`No se pudo conectar a ${printer.ip_address}:${port} — ${err.message || err}`));
      try {
        renderToDevice(device_, jobType, payload);
        device_.close(() => resolve());
      } catch (printErr) {
        reject(printErr);
      }
    });
  });
}

/**
 * NOTA: requiere que el vendor_id/product_id estén en formato hexadecimal
 * (ej. "0x04b8"), y que el sistema operativo tenga el driver/permiso correcto
 * (en Windows normalmente vía Zadig/WinUSB; en Linux, reglas udev).
 * Validar con el dispositivo físico antes de usar en producción.
 */
function printViaUsb(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  if (!escpos.USB) {
    throw new Error('Soporte USB no disponible: el módulo nativo escpos-usb no se pudo instalar en este equipo');
  }
  if (!printer.vendor_id || !printer.product_id) {
    throw new Error(`Impresora "${printer.name}" no tiene vendor_id/product_id configurados`);
  }

  return new Promise((resolve, reject) => {
    try {
      const device = new escpos.USB(Number(printer.vendor_id), Number(printer.product_id));
      const device_ = new escpos.Printer(device);

      device.open((err: any) => {
        if (err) return reject(new Error(`No se pudo abrir la impresora USB "${printer.name}" — ${err.message || err}`));
        try {
          renderToDevice(device_, jobType, payload);
          device_.close(() => resolve());
        } catch (printErr) {
          reject(printErr);
        }
      });
    } catch (err: any) {
      reject(new Error(`Error inicializando impresora USB "${printer.name}": ${err.message || err}`));
    }
  });
}

/**
 * NOTA: requiere que el dispositivo Bluetooth ya esté emparejado con el SO
 * y que mac_address corresponda al emparejamiento. Validar con hardware real.
 */
function printViaBluetooth(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  if (!escpos.Bluetooth) {
    throw new Error('Soporte Bluetooth no disponible: el módulo nativo escpos-bluetooth no se pudo instalar en este equipo');
  }
  if (!printer.mac_address) {
    throw new Error(`Impresora "${printer.name}" no tiene mac_address configurada`);
  }

  return new Promise((resolve, reject) => {
    const device = new escpos.Bluetooth(printer.mac_address);
    const device_ = new escpos.Printer(device);

    device.open((err: any) => {
      if (err) return reject(new Error(`No se pudo conectar por Bluetooth a "${printer.name}" — ${err.message || err}`));
      try {
        renderToDevice(device_, jobType, payload);
        device_.close(() => resolve());
      } catch (printErr) {
        reject(printErr);
      }
    });
  });
}

/**
 * Impresora estándar del sistema operativo.
 * Estrategia (en orden):
 *   1. Electron BrowserWindow.print() — usa el Chromium embebido en Electron (sin dependencias extra)
 *   2. node-printer con texto plano ESC/POS — si el módulo nativo está disponible
 *   3. Lanza error
 */
async function printViaSystem(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  const html = renderHTML(jobType, payload);

  // 1. Intentar impresión via Electron (Chromium embebido)
  const electron = tryRequire('electron');
  if (electron && electron.BrowserWindow) {
    try {
      await printViaElectron(html, printer.name);
      return;
    } catch (err: any) {
      console.error('[printer] Error con Electron print, fallback a texto plano:', err.message);
    }
  }

  // 2. Fallback: texto plano con node-printer
  const nodePrinter = tryRequire('printer');
  if (nodePrinter) {
    const text = renderPlainText(jobType, payload);
    return new Promise((resolve, reject) => {
      nodePrinter.printDirect({
        data: text,
        printer: printer.name,
        type: 'RAW',
        success: () => resolve(),
        error: (err: any) => reject(new Error(`Error imprimiendo en impresora del sistema "${printer.name}": ${err}`)),
      });
    });
  }

  throw new Error(`No se pudo imprimir en "${printer.name}": Electron print no disponible y módulo printer no instalado`);
}

/**
 * Usa una BrowserWindow oculta de Electron para cargar el HTML y enviarlo a la impresora.
 * Electron ya incluye Chromium — no requiere puppeteer ni descargas adicionales.
 */
function printViaElectron(html: string, printerName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const electron = require('electron');
    const win = new electron.BrowserWindow({
      width: 400,
      height: 600,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    win.webContents.on('did-finish-load', () => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName,
          margins: { marginType: 'custom', top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
        },
        (success: boolean, errorType: string) => {
          win.destroy();
          if (success) resolve();
          else reject(new Error(`Error imprimiendo via Electron en "${printerName}": ${errorType}`));
        }
      );
    });

    win.webContents.on('did-fail-load', (_e: any, _code: number, desc: string) => {
      win.destroy();
      reject(new Error(`Error cargando HTML para impresión: ${desc}`));
    });
  });
}
