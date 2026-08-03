/**
 * Generación de buffers ESC/POS desacoplada del transporte.
 *
 * El BufferAdapter implementa la misma interfaz que escpos.Network / escpos.USB
 * (open, write, close), por lo que escpos.Printer puede usarlo sin saber que
 * los bytes se acumulan en memoria en lugar de enviarse a un puerto físico.
 *
 * buildEscposBuffer genera el buffer completo sin abrir ninguna conexión.
 * El mismo buffer puede enviarse luego por red, USB, Bluetooth o spooler de
 * Windows (RAW), lo que permite reutilizar la lógica de maquetación para todos
 * los transportes.
 */

import type { PrintJobPayload, PrintJobRow } from '../types';
import type { PaperSpec } from './paper';
import type { SaleTicketPrintPayload, KitchenTicketPrintPayload, ShipmentGuidePrintPayload, ElectronicInvoicePrintPayload } from './types';
import { printSaleTicket, printKitchenTicket, printShipmentGuide, printElectronicInvoice } from './renderEscpos';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const escpos = require('escpos');

/**
 * Adapter in-memory que acumula los bytes ESC/POS en un Buffer.
 * No abre ni cierra ningún recurso físico.
 */
export class BufferAdapter {
  private chunks: Buffer[] = [];

  open(cb?: (err?: Error | null) => void): void {
    if (cb) cb(null);
  }

  write(data: Buffer | number[], cb?: (err?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    if (cb) cb(null);
  }

  close(cb?: (err?: Error | null) => void): void {
    if (cb) cb(null);
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/**
 * Genera un Buffer con los comandos ESC/POS completos para un job,
 * sin abrir ninguna conexión física.
 */
export async function buildEscposBuffer(
  jobType: PrintJobRow['job_type'],
  payload: PrintJobPayload,
  paper: PaperSpec,
): Promise<Buffer> {
  const adapter = new BufferAdapter();
  const printer = new escpos.Printer(adapter);

  // CP858 = Latin-1 + Euro. Soporta Ñ, tildes, °, ¿, ¡, €.
  printer.encode('CP858').setCharacterCodeTable(19);

  if (jobType === 'sale_ticket' || jobType === 'pre_cuenta') {
    printSaleTicket(printer, payload as SaleTicketPrintPayload, paper);
  } else if (jobType === 'shipment_guide') {
    printShipmentGuide(printer, payload as ShipmentGuidePrintPayload, paper);
  } else if (jobType === 'electronic_invoice') {
    printElectronicInvoice(printer, payload as ElectronicInvoicePrintPayload, paper);
  } else {
    printKitchenTicket(printer, payload as KitchenTicketPrintPayload, paper);
  }

  // qrimage usa QRCode.toDataURL que es asíncrono, pero printSaleTicket no
  // pasa callback. Esperar un tick para que los bytes del QR lleguen al
  // adapter antes de retornar el buffer.
  await new Promise((resolve) => setTimeout(resolve, 50));

  // close() hace flush() del MutableBuffer interno del Printer al adapter.
  // Sin esto, los bytes se quedan en el buffer interno y getBuffer() retorna vacío.
  await new Promise<void>((resolve) => {
    printer.close(() => resolve());
  });

  return adapter.getBuffer();
}

/**
 * Comando ESC/POS para abrir el cajón de dinero (cash drawer).
 * ESC p m t1 t2 — pulso en el pin 2 (m=0) o pin 5 (m=1), con duración t1*2ms y t2*2ms.
 * Valores típicos: m=0, t1=100 (200ms), t2=100 (200ms).
 */
const CASH_DRAWER_CMD = Buffer.from([0x1B, 0x70, 0x00, 0x64, 0x64]);

/**
 * Genera un Buffer con el comando ESC/POS de apertura de cajón.
 * No necesita payload ni paper: es un comando fijo de 5 bytes.
 */
export async function buildCashDrawerBuffer(): Promise<Buffer> {
  return Promise.resolve(Buffer.from(CASH_DRAWER_CMD));
}
