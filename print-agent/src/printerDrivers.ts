import type { PrinterRow, PrintJobPayload, PrintJobRow } from './types';
import type { PaperSpec } from './printing/paper';
import { getPaperSpec } from './printing/paper';
import { printKitchenTicket, buildPlainTextTicket, printSaleTicket, buildPlainTextSaleTicket, printShipmentGuide, buildPlainTextShipmentGuide } from './printing/renderEscpos';
import { buildSaleTicketHTML, buildKitchenTicketHTML, buildShipmentGuideHTML } from './printing/renderHtml';
import { buildEscposBuffer } from './printing/escposBuffer';
import { sendRawToPrinter } from './transports/rawSpooler';

function renderToDevice(device_: any, jobType: PrintJobRow['job_type'], payload: PrintJobPayload, paper: PaperSpec): void {
  // CP858 = Latin-1 + Euro. Soporta Ñ, tildes, °, ¿, ¡, €.
  // encode() cambia el encoding de iconv (cómo se codifican los strings a bytes).
  // setCharacterCodeTable(19) envía ESC t 19 para que la impresora use Code Page 858.
  device_.encode('CP858').setCharacterCodeTable(19);

  if (jobType === 'sale_ticket' || jobType === 'pre_cuenta') {
    printSaleTicket(device_, payload as any, paper);
  } else if (jobType === 'shipment_guide') {
    printShipmentGuide(device_, payload as any, paper);
  } else {
    printKitchenTicket(device_, payload as any, paper);
  }
}

function renderPlainText(jobType: PrintJobRow['job_type'], payload: PrintJobPayload, paper: PaperSpec): string {
  if (jobType === 'sale_ticket' || jobType === 'pre_cuenta') return buildPlainTextSaleTicket(payload as any, paper);
  if (jobType === 'shipment_guide') return buildPlainTextShipmentGuide(payload as any, paper);
  return buildPlainTextTicket(payload as any, paper);
}

function renderHTML(jobType: PrintJobRow['job_type'], payload: PrintJobPayload, paper: PaperSpec): string {
  if (jobType === 'sale_ticket' || jobType === 'pre_cuenta') return buildSaleTicketHTML(payload as any, paper);
  if (jobType === 'shipment_guide') return buildShipmentGuideHTML(payload as any, paper);
  return buildKitchenTicketHTML(payload as any, paper);
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
      // USB delega al spooler RAW de Windows: envía ESC/POS directo sin Zadig/libusb.
      // Requiere system_printer_name con el nombre exacto de la impresora en Windows.
      return printViaRawSpooler(printer, jobType, payload);
    case 'bluetooth':
      return printViaBluetooth(printer, jobType, payload);
    case 'system':
      return printViaSystem(printer, jobType, payload);
    case 'raw_spooler':
      return printViaRawSpooler(printer, jobType, payload);
    default:
      throw new Error(`Tipo de conexión no soportado: ${printer.connection_type}`);
  }
}

async function printViaNetwork(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  if (!printer.ip_address) {
    throw new Error(`Impresora "${printer.name}" no tiene ip_address configurada`);
  }
  const port = printer.port || 9100;
  const paper = getPaperSpec(printer.paper_width);

  console.log(`[printer] printViaNetwork: printer="${printer.name}" ${printer.ip_address}:${port}`);

  return new Promise((resolve, reject) => {
    const device = new escpos.Network(printer.ip_address, port);
    const device_ = new escpos.Printer(device);

    // Timeout de conexión: si la impresora no responde en 5s, fallar.
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { device.device.destroy(); } catch { /* ignore */ }
      reject(new Error(`Timeout conectando a ${printer.ip_address}:${port} — ¿IP correcta? ¿impresora encendida?`));
    }, 5000);

    device.open((err: any) => {
      if (settled) return;
      if (err) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`No se pudo conectar a ${printer.ip_address}:${port} — ${err.message || err}`));
        return;
      }
      clearTimeout(timer);
      try {
        renderToDevice(device_, jobType, payload, paper);
        device_.close(() => {
          if (settled) return;
          settled = true;
          resolve();
        });
      } catch (printErr) {
        if (settled) return;
        settled = true;
        reject(printErr);
      }
    });
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

  const paper = getPaperSpec(printer.paper_width);

  return new Promise((resolve, reject) => {
    const device = new escpos.Bluetooth(printer.mac_address);
    const device_ = new escpos.Printer(device);

    device.open((err: any) => {
      if (err) return reject(new Error(`No se pudo conectar por Bluetooth a "${printer.name}" — ${err.message || err}`));
      try {
        renderToDevice(device_, jobType, payload, paper);
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
  const paper = getPaperSpec(printer.paper_width);
  const html = renderHTML(jobType, payload, paper);

  // El nombre real en Windows puede diferir del nombre interno del ERP.
  // Si system_printer_name no está configurado, caer en printer.name
  // pero avisar para que el usuario lo configure correctamente.
  const printerName = printer.system_printer_name || printer.name;
  if (!printer.system_printer_name) {
    console.warn(
      `[printer] printViaSystem: "${printer.name}" no tiene system_printer_name configurado. ` +
      `Usando "${printer.name}" como nombre de impresora. ` +
      `Configura system_printer_name con el nombre exacto de Windows para evitar errores.`
    );
  }

  console.log(
    `[printer] printViaSystem: printer="${printerName}", paper_width="${printer.paper_width}" -> ` +
    `${paper.width} (rollo ${paper.rollMm}mm, imprimible ${paper.printableMm}mm, ` +
    `${paper.charsPerLine} cols)`
  );

  // 1. Intentar impresión via Electron (Chromium embebido)
  const electron = tryRequire('electron');
  if (electron && electron.BrowserWindow) {
    try {
      await printViaElectron(html, printerName, paper);
      return;
    } catch (err: any) {
      console.error('[printer] Error con Electron print, fallback a texto plano:', err.message);
    }
  }

  // 2. Fallback: texto plano con node-printer
  const nodePrinter = tryRequire('printer');
  if (nodePrinter) {
    const text = renderPlainText(jobType, payload, paper);
    return new Promise((resolve, reject) => {
      nodePrinter.printDirect({
        data: text,
        printer: printerName,
        type: 'RAW',
        success: () => resolve(),
        error: (err: any) => reject(new Error(`Error imprimiendo en impresora del sistema "${printerName}": ${err}`)),
      });
    });
  }

  throw new Error(`No se pudo imprimir en "${printerName}": Electron print no disponible y módulo printer no instalado`);
}

/**
 * Usa una BrowserWindow oculta de Electron para cargar el HTML y enviarlo a la impresora.
 * Electron ya incluye Chromium — no requiere puppeteer ni descargas adicionales.
 *
 * IMPORTANTE: se debe pasar `pageSize` explícito en MICRONES. Sin él, Chromium usa
 * Letter/A4 y el driver térmico escala la página completa a 80mm, dejando el ticket
 * ilegible (texto microscópico) y casi todo el papel en blanco.
 *
 * IGUAL DE IMPORTANTE: la ventana debe tener EXACTAMENTE el ancho al que se va a
 * imprimir. La altura del ticket se calcula midiendo `scrollHeight`, y ese valor
 * depende del ancho con el que se maqueta: una ventana más ancha produce menos
 * saltos de línea y por tanto una altura menor que la real. Si la ventana mide
 * 400px pero se imprime a 302px, la página resulta más corta que el contenido y
 * el ticket sale recortado.
 *
 * El ancho es el IMPRIMIBLE, no el del rollo: el driver ya recorta al área del
 * cabezal. Usar el ancho del rollo provocaba margenes dobles y recortes.
 */
function printViaElectron(html: string, printerName: string, paper: PaperSpec): Promise<void> {
  console.log(
    `[printer] printViaElectron: printer="${printerName}", ${paper.width} -> ` +
    `ancho de pagina ${paper.printableMicrons} micrones / ${paper.cssPx}px CSS ` +
    `(area imprimible ${paper.printableMm}mm)`
  );

  return new Promise((resolve, reject) => {
    const electron = require('electron');
    const win = new electron.BrowserWindow({
      // El ancho debe coincidir con el de impresión para que la altura medida
      // más abajo corresponda a la maquetación real.
      width: paper.cssPx,
      height: 600,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { win.destroy(); } catch { /* ignore */ }
      if (err) reject(err); else resolve();
    };

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    win.webContents.on('did-finish-load', async () => {
      try {
        // Esperar a que todas las imágenes terminen de cargar (QR, logos).
        // Sin esto, se imprime antes de que rendericen y salen huecos en blanco.
        await win.webContents.executeJavaScript(`
          new Promise((res) => {
            const imgs = Array.from(document.images);
            if (imgs.length === 0) return res(true);
            let pending = imgs.length;
            const done = () => { if (--pending <= 0) res(true); };
            imgs.forEach((img) => {
              if (img.complete) return done();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            });
            // Tope de seguridad: no bloquear la impresión más de 3s
            setTimeout(() => res(true), 3000);
          })
        `);

        // Altura real del contenido en px CSS -> micrones (1px CSS = 1/96 pulgada = 264.583 micrones)
        const heightPx: number = await win.webContents.executeJavaScript(
          'Math.ceil(document.documentElement.scrollHeight)'
        );
        // +2mm de holgura: el redondeo de subpíxeles y el interlineado de la
        // última línea pueden desbordar la página y provocar que se corte.
        const SAFETY_MARGIN_MICRONS = 2000;
        const heightMicrons = Math.max(20000, Math.round(heightPx * 264.583) + SAFETY_MARGIN_MICRONS);

        console.log(`[printer] printViaElectron: alto medido ${heightPx}px CSS -> ${heightMicrons} micrones`);

        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: printerName,
            pageSize: { width: paper.printableMicrons, height: heightMicrons },
            margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
          },
          (success: boolean, errorType: string) => {
            if (success) finish();
            else finish(new Error(`Error imprimiendo via Electron en "${printerName}": ${errorType}`));
          }
        );
      } catch (err: any) {
        finish(new Error(`Error preparando impresión: ${err.message || err}`));
      }
    });

    win.webContents.on('did-fail-load', (_e: any, _code: number, desc: string) => {
      finish(new Error(`Error cargando HTML para impresión: ${desc}`));
    });
  });
}

/**
 * Transporte RAW por spooler de Windows (winspool.drv).
 *
 * Genera el buffer ESC/POS con buildEscposBuffer (Fase 3) y lo envía crudo a la
 * impresora usando PowerShell + C# embebido que llama a OpenPrinter con
 * datatype = "RAW". Esto permite usar una impresora térmica USB instalada en
 * Windows (POS-80C) sin Zadig ni libusb: el spooler ya tiene el handle.
 *
 * Requiere `system_printer_name` con el nombre exacto de la impresora en Windows.
 */
async function printViaRawSpooler(printer: PrinterRow, jobType: PrintJobRow['job_type'], payload: PrintJobPayload): Promise<void> {
  const printerName = printer.system_printer_name || printer.name;
  if (!printer.system_printer_name) {
    console.warn(
      `[printer] printViaRawSpooler: "${printer.name}" no tiene system_printer_name configurado. ` +
      `Usando "${printer.name}" como nombre de impresora. ` +
      `Configura system_printer_name con el nombre exacto de Windows para evitar errores.`
    );
  }

  const paper = getPaperSpec(printer.paper_width);
  console.log(
    `[printer] printViaRawSpooler: printer="${printerName}", paper_width="${printer.paper_width}" -> ` +
    `${paper.width} (imprimible ${paper.printableMm}mm, ${paper.charsPerLine} cols)`
  );

  const buffer = await buildEscposBuffer(jobType, payload, paper);
  console.log(`[printer] printViaRawSpooler: buffer ESC/POS generado (${buffer.length} bytes)`);

  await sendRawToPrinter(printerName, buffer);
  console.log(`[printer] printViaRawSpooler: enviado a "${printerName}"`);
}
