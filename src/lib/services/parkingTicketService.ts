'use client';

export interface EntryTicketData {
  // Datos de la organización
  organization_name: string;
  organization_logo?: string;
  organization_nit?: string;
  organization_phone?: string;
  organization_email?: string;
  organization_address?: string;
  
  // Datos de la sucursal
  branch_name: string;
  branch_address?: string;
  branch_phone?: string;
  
  // Datos de la sesión
  session_id: string;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  space_label?: string;
  zone_name?: string;
  
  // Configuración
  ticket_message?: string;
  show_qr?: boolean;
}

export interface ExitTicketData extends EntryTicketData {
  exit_at: string;
  duration_min: number;
  amount: number;
  payment_method?: string;
  invoice_number?: string;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: 'Carro',
  motorcycle: 'Moto',
  truck: 'Camión',
  bicycle: 'Bicicleta',
};

class ParkingTicketService {
  /**
   * Genera e imprime un ticket de entrada
   */
  printEntryTicket(data: EntryTicketData): void {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      console.error('No se pudo abrir la ventana de impresión');
      return;
    }

    const entryDate = new Date(data.entry_at);
    const formattedDate = entryDate.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = entryDate.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const ticketHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket de Entrada - ${data.vehicle_plate}</title>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            max-width: 80mm;
            margin: 0 auto;
            padding: 5mm;
            font-size: 12px;
            line-height: 1.4;
          }
          .ticket {
            border: 1px dashed #000;
            padding: 3mm;
          }
          .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 3mm;
            margin-bottom: 3mm;
          }
          .logo {
            max-width: 50mm;
            max-height: 15mm;
            margin-bottom: 2mm;
          }
          .company-name {
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .company-info {
            font-size: 10px;
            color: #333;
          }
          .branch-info {
            font-size: 11px;
            margin-top: 2mm;
            padding-top: 2mm;
            border-top: 1px dotted #666;
          }
          .title {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 4mm 0;
            padding: 2mm;
            background: #000;
            color: #fff;
          }
          .plate {
            text-align: center;
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 3px;
            margin: 4mm 0;
            padding: 3mm;
            border: 2px solid #000;
            background: #f0f0f0;
          }
          .info-section {
            margin: 3mm 0;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 1mm 0;
            border-bottom: 1px dotted #ccc;
          }
          .info-label {
            font-weight: bold;
            color: #333;
          }
          .info-value {
            text-align: right;
          }
          .datetime {
            text-align: center;
            margin: 4mm 0;
            padding: 3mm;
            background: #f5f5f5;
            border-radius: 2mm;
          }
          .datetime .date {
            font-size: 11px;
            color: #666;
          }
          .datetime .time {
            font-size: 24px;
            font-weight: bold;
          }
          .qr-section {
            text-align: center;
            margin: 4mm 0;
            padding: 3mm;
            border: 1px dashed #ccc;
          }
          .qr-code {
            width: 25mm;
            height: 25mm;
            margin: 0 auto;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
            color: #999;
          }
          .footer {
            text-align: center;
            margin-top: 4mm;
            padding-top: 3mm;
            border-top: 1px dashed #000;
            font-size: 10px;
          }
          .footer .message {
            font-style: italic;
            margin-bottom: 2mm;
          }
          .footer .id {
            font-size: 8px;
            color: #666;
          }
          .warning {
            text-align: center;
            margin-top: 3mm;
            padding: 2mm;
            background: #f5f5f5;
            border: 1px solid #000;
            font-size: 9px;
            font-weight: bold;
          }
          @media print {
            body {
              width: 80mm;
            }
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            ${data.organization_logo ? `<img src="${data.organization_logo}" class="logo" alt="Logo">` : ''}
            <div class="company-name">${data.organization_name}</div>
            <div class="company-info">
              ${data.organization_nit ? `NIT: ${data.organization_nit}<br>` : ''}
              ${data.organization_address ? `${data.organization_address}<br>` : ''}
              ${data.organization_phone ? `Tel: ${data.organization_phone}` : ''}
              ${data.organization_email ? ` | ${data.organization_email}` : ''}
            </div>
            <div class="branch-info">
              <strong>${data.branch_name}</strong>
              ${data.branch_address ? `<br>${data.branch_address}` : ''}
              ${data.branch_phone ? `<br>Tel: ${data.branch_phone}` : ''}
            </div>
          </div>

          <div class="title">[P] TICKET DE ENTRADA</div>

          <div class="plate">${data.vehicle_plate}</div>

          <div class="datetime">
            <div class="date">${formattedDate}</div>
            <div class="time">${formattedTime}</div>
          </div>

          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Tipo:</span>
              <span class="info-value">${VEHICLE_TYPE_LABELS[data.vehicle_type] || data.vehicle_type}</span>
            </div>
            ${data.space_label ? `
            <div class="info-row">
              <span class="info-label">Espacio:</span>
              <span class="info-value">${data.space_label}</span>
            </div>
            ` : ''}
            ${data.zone_name ? `
            <div class="info-row">
              <span class="info-label">Zona:</span>
              <span class="info-value">${data.zone_name}</span>
            </div>
            ` : ''}
          </div>

          ${data.show_qr ? `
          <div class="qr-section">
            <div class="qr-code">
              [QR: ${data.session_id.substring(0, 8)}]
            </div>
            <div style="font-size: 8px; color: #666; margin-top: 1mm;">
              Escanee para validar
            </div>
          </div>
          ` : ''}

          <div class="warning">
            (*) CONSERVE ESTE TICKET<br>
            Requerido para la salida del vehículo
          </div>

          <div class="footer">
            ${data.ticket_message ? `<div class="message">${data.ticket_message}</div>` : ''}
            <div class="id">ID: ${data.session_id.substring(0, 8).toUpperCase()}</div>
            <div style="margin-top: 2mm;">¡Gracias por su visita!</div>
          </div>
        </div>

      </body>
      </html>
    `;

    try {
      printWindow.document.write(ticketHtml);
      printWindow.document.close();
      // Usar setTimeout para dar tiempo al documento de renderizar
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // Ignorar errores de impresión silenciosamente
        }
        // Cerrar ventana después de imprimir
        setTimeout(() => {
          try { printWindow.close(); } catch {}
        }, 500);
      }, 250);
    } catch {
      // Ignorar errores silenciosamente para no afectar otros procesos
    }
  }

  /**
   * Genera e imprime un ticket de salida/recibo
   */
  printExitTicket(data: ExitTicketData): void {
    const printWindow = window.open('', '_blank', 'width=400,height=700');
    if (!printWindow) {
      console.error('No se pudo abrir la ventana de impresión');
      return;
    }

    const entryDate = new Date(data.entry_at);
    const exitDate = new Date(data.exit_at);
    
    const formatDateTime = (date: Date) => {
      return date.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const formatDuration = (minutes: number) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours > 0) {
        return `${hours}h ${mins}min`;
      }
      return `${mins} min`;
    };

    const ticketHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recibo - ${data.vehicle_plate}</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            max-width: 80mm;
            margin: 0 auto;
            padding: 5mm;
            font-size: 12px;
            line-height: 1.4;
          }
          .ticket { border: 1px dashed #000; padding: 3mm; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
          .company-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
          .company-info { font-size: 10px; color: #333; }
          .branch-info { font-size: 11px; margin-top: 2mm; padding-top: 2mm; border-top: 1px dotted #666; }
          .title { text-align: center; font-size: 16px; font-weight: bold; margin: 4mm 0; padding: 2mm; background: #000; color: #fff; }
          .plate { text-align: center; font-size: 22px; font-weight: bold; letter-spacing: 2px; margin: 3mm 0; }
          .info-row { display: flex; justify-content: space-between; padding: 1mm 0; border-bottom: 1px dotted #ccc; }
          .info-label { font-weight: bold; }
          .total-section { margin: 4mm 0; padding: 3mm; background: #f0f0f0; border: 2px solid #000; }
          .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; }
          .footer { text-align: center; margin-top: 4mm; padding-top: 3mm; border-top: 1px dashed #000; font-size: 10px; }
          @media print { body { width: 80mm; } }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            <div class="company-name">${data.organization_name}</div>
            <div class="company-info">
              ${data.organization_nit ? `NIT: ${data.organization_nit}<br>` : ''}
              ${data.organization_address || ''}
            </div>
            <div class="branch-info"><strong>${data.branch_name}</strong></div>
          </div>

          <div class="title">[R] RECIBO DE PARKING</div>

          <div class="plate">${data.vehicle_plate}</div>

          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Tipo:</span>
              <span>${VEHICLE_TYPE_LABELS[data.vehicle_type] || data.vehicle_type}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Entrada:</span>
              <span>${formatDateTime(entryDate)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Salida:</span>
              <span>${formatDateTime(exitDate)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Duración:</span>
              <span>${formatDuration(data.duration_min)}</span>
            </div>
            ${data.payment_method ? `
            <div class="info-row">
              <span class="info-label">Pago:</span>
              <span>${data.payment_method}</span>
            </div>
            ` : ''}
            ${data.invoice_number ? `
            <div class="info-row">
              <span class="info-label">Factura:</span>
              <span>${data.invoice_number}</span>
            </div>
            ` : ''}
          </div>

          <div class="total-section">
            <div class="total-row">
              <span>TOTAL:</span>
              <span>$${data.amount.toLocaleString('es-CO')}</span>
            </div>
          </div>

          <div class="footer">
            <div>ID: ${data.session_id.substring(0, 8).toUpperCase()}</div>
            <div style="margin-top: 2mm;">¡Gracias por su visita!</div>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      printWindow.document.write(ticketHtml);
      printWindow.document.close();
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {}
        setTimeout(() => {
          try { printWindow.close(); } catch {}
        }, 500);
      }, 250);
    } catch {}
  }
}

export const parkingTicketService = new ParkingTicketService();
export default parkingTicketService;
