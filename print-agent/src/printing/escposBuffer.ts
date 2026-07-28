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
import type { SaleTicketPrintPayload, KitchenTicketPrintPayload } from './types';
import { printSaleTicket, printKitchenTicket } from './renderEscpos';

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

  if (jobType === 'sale_ticket' || jobType === 'pre_cuenta') {
    printSaleTicket(printer, payload as SaleTicketPrintPayload, paper);
  } else {
    printKitchenTicket(printer, payload as KitchenTicketPrintPayload, paper);
  }

  // qrimage usa QRCode.toDataURL que es asíncrono, pero printSaleTicket no
  // pasa callback. Esperar un tick para que los bytes del QR lleguen al
  // adapter antes de retornar el buffer.
  await new Promise((resolve) => setTimeout(resolve, 50));

  return adapter.getBuffer();
}
