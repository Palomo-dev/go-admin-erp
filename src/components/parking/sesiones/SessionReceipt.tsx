'use client';

import { ParkingSession } from './SesionesTable';

export function printSessionReceipt(session: ParkingSession) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const receiptHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Recibo Parking</title>
      <style>
        body { font-family: monospace; max-width: 300px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin: 5px 0; }
        .total { font-size: 1.2em; font-weight: bold; border-top: 1px dashed #000; padding-top: 10px; }
        .footer { text-align: center; margin-top: 20px; font-size: 0.8em; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>RECIBO PARKING</h2>
        <p>${new Date().toLocaleString('es-ES')}</p>
      </div>
      <div class="row"><span>Placa:</span><span>${session.vehicle_plate}</span></div>
      <div class="row"><span>Tipo:</span><span>${session.vehicle_type}</span></div>
      <div class="row"><span>Entrada:</span><span>${new Date(session.entry_at).toLocaleString('es-ES')}</span></div>
      <div class="row"><span>Salida:</span><span>${session.exit_at ? new Date(session.exit_at).toLocaleString('es-ES') : '-'}</span></div>
      <div class="row"><span>Duración:</span><span>${session.duration_min || 0} min</span></div>
      <div class="row total"><span>TOTAL:</span><span>$${session.amount?.toLocaleString('es-CO') || 0}</span></div>
      <div class="footer">
        <p>Gracias por su visita</p>
        <p>ID: ${session.id.substring(0, 8)}</p>
      </div>
      <script>window.print(); window.close();</script>
    </body>
    </html>
  `;

  printWindow.document.write(receiptHtml);
  printWindow.document.close();
}
