import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';

function formatCurrency(value: number | undefined, currency: string = 'COP'): string {
  if (!value || value === 0) return '-';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '-';
  }
}

function getStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    pending: 'Pendiente',
    assigned: 'Asignado',
    ready: 'Listo',
    picked: 'Recogido',
    dispatched: 'Despachado',
    in_transit: 'En Tránsito',
    out_for_delivery: 'En Entrega',
    delivered: 'Entregado',
    failed: 'Fallido',
    returned: 'Devuelto',
    cancelled: 'Cancelado',
  };
  return labels[status || ''] || status || '-';
}

function getPaymentLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    cod: 'Contra Entrega',
    cancelled: 'Cancelado',
  };
  return labels[status || ''] || status || '-';
}

interface ShipmentItem {
  id: string;
  description: string;
  quantity: number;
  weight_kg?: number;
  unit_value?: number;
}

export function generateShipmentLabelHTML(shipment: ShipmentWithDetails): string {
  const meta = (shipment.metadata as Record<string, unknown> | null) || {};
  const items = (meta.items as ShipmentItem[] | undefined) || [];

  const senderName = (meta.sender_name as string) || shipment.sender_name || '-';
  const senderPhone = (meta.sender_phone as string) || shipment.sender_phone || '-';
  const receiverName = shipment.delivery_contact_name || shipment.receiver_name || shipment.customer?.full_name || '-';
  const receiverPhone = shipment.delivery_contact_phone || shipment.receiver_phone || shipment.customer?.phone || '-';
  const receiverAddress = shipment.delivery_address || '-';
  const receiverCity = shipment.delivery_city || '-';
  const originStop = shipment.origin_stop?.name || (meta.origin_stop_id as string) || '-';
  const destinationStop = shipment.destination_stop?.name || (meta.destination_stop_id as string) || '-';
  const driverName = shipment.driver_name || 'Sin asignar';
  const packageType = (meta.package_type as string) || shipment.package_type || '-';
  const deliveryType = (meta.delivery_type as string) || shipment.delivery_type || '-';
  const isFragile = (meta.is_fragile as boolean) || shipment.is_fragile || false;
  const requiresSignature = (meta.requires_signature as boolean) || shipment.requires_signature || false;

  const itemsRows = items.length > 0
    ? items.map((item) => `
      <tr>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${item.description || '-'}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: right;">${item.weight_kg ? item.weight_kg + ' kg' : '-'}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unit_value)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #999;">Sin items registrados</td></tr>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Etiqueta de Envío - ${shipment.tracking_number || shipment.shipment_number || ''}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
  .label-container { max-width: 800px; margin: 0 auto; background: #fff; border: 2px solid #333; border-radius: 8px; overflow: hidden; }
  .label-header { background: #1a1a2e; color: #fff; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
  .label-header h1 { font-size: 24px; font-weight: 700; }
  .label-header .tracking { text-align: right; }
  .label-header .tracking .label { font-size: 11px; opacity: 0.7; text-transform: uppercase; }
  .label-header .tracking .value { font-size: 20px; font-weight: 700; letter-spacing: 1px; }
  .barcode-section { background: #fff; padding: 12px 20px; border-bottom: 2px dashed #ccc; text-align: center; }
  .barcode-section .barcode-box { display: inline-block; border: 2px solid #333; padding: 8px 16px; font-family: 'Courier New', monospace; font-size: 28px; font-weight: 700; letter-spacing: 4px; }
  .label-body { padding: 20px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #666; border-bottom: 2px solid #1a1a2e; padding-bottom: 4px; margin-bottom: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .info-card { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; }
  .info-card.from { border-left: 4px solid #2563eb; }
  .info-card.to { border-left: 4px solid #16a34a; }
  .info-card h3 { font-size: 13px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
  .info-card .field { margin-bottom: 4px; }
  .info-card .field-label { font-size: 10px; color: #999; text-transform: uppercase; }
  .info-card .field-value { font-size: 14px; font-weight: 500; }
  .route-section { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f0f4ff; border-radius: 6px; margin-bottom: 16px; }
  .route-point { flex: 1; text-align: center; }
  .route-point .icon { font-size: 20px; }
  .route-point .name { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .route-arrow { font-size: 24px; color: #666; }
  .details-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .detail-item { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 8px; text-align: center; }
  .detail-item .label { font-size: 10px; color: #999; text-transform: uppercase; }
  .detail-item .value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .items-table th { background: #1a1a2e; color: #fff; padding: 8px; font-size: 11px; text-transform: uppercase; text-align: left; }
  .items-table th.center { text-align: center; }
  .items-table th.right { text-align: right; }
  .costs-section { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
  .cost-item { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 10px; text-align: center; }
  .cost-item .label { font-size: 10px; color: #999; text-transform: uppercase; }
  .cost-item .value { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-top: 4px; }
  .cost-item.total { background: #1a1a2e; color: #fff; }
  .cost-item.total .label { color: #aaa; }
  .cost-item.total .value { color: #fff; font-size: 18px; }
  .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .badge { padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge.fragile { background: #fee2e2; color: #dc2626; }
  .badge.signature { background: #dbeafe; color: #2563eb; }
  .badge.status { background: #e0e7ff; color: #4338ca; }
  .badge.payment { background: #fef3c7; color: #d97706; }
  .badge.driver { background: #d1fae5; color: #059669; }
  .footer { background: #f5f5f5; padding: 12px 20px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; text-align: center; }
  .notes-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 10px; margin-bottom: 16px; font-size: 12px; }
  .notes-box .label { font-size: 10px; color: #92400e; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  @media print {
    body { background: #fff; padding: 0; }
    .label-container { border: none; max-width: 100%; }
    .no-print { display: none; }
    @page { margin: 10mm; }
  }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #1a1a2e; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
  .print-btn:hover { background: #2d2d4e; }
</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <div class="label-container">
    <div class="label-header">
      <div>
        <h1>ETIQUETA DE ENVÍO</h1>
        <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">${shipment.shipment_number || ''}</div>
      </div>
      <div class="tracking">
        <div class="label">Tracking</div>
        <div class="value">${shipment.tracking_number || '-'}</div>
      </div>
    </div>

    <div class="barcode-section">
      <div class="barcode-box">*${(shipment.tracking_number || shipment.shipment_number || '').replace(/[^A-Z0-9]/gi, '')}*</div>
    </div>

    <div class="label-body">
      <div class="badges">
        <span class="badge status">Estado: ${getStatusLabel(shipment.status)}</span>
        <span class="badge payment">Pago: ${getPaymentLabel(shipment.payment_status)}</span>
        <span class="badge driver">Conductor: ${driverName}</span>
        ${isFragile ? '<span class="badge fragile">⚠️ FRÁGIL</span>' : ''}
        ${requiresSignature ? '<span class="badge signature">✍️ REQUIERE FIRMA</span>' : ''}
      </div>

      <div class="route-section">
        <div class="route-point">
          <div class="icon">📍</div>
          <div class="name">${originStop}</div>
          <div style="font-size: 10px; color: #999;">Origen</div>
        </div>
        <div class="route-arrow">→</div>
        <div class="route-point">
          <div class="icon">🎯</div>
          <div class="name">${destinationStop}</div>
          <div style="font-size: 10px; color: #999;">Destino</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Remitente / Destinatario</div>
        <div class="info-grid">
          <div class="info-card from">
            <h3>📤 Remitente</h3>
            <div class="field">
              <div class="field-label">Nombre</div>
              <div class="field-value">${senderName}</div>
            </div>
            <div class="field">
              <div class="field-label">Teléfono</div>
              <div class="field-value">${senderPhone}</div>
            </div>
          </div>
          <div class="info-card to">
            <h3>📥 Destinatario</h3>
            <div class="field">
              <div class="field-label">Nombre</div>
              <div class="field-value">${receiverName}</div>
            </div>
            <div class="field">
              <div class="field-label">Teléfono</div>
              <div class="field-value">${receiverPhone}</div>
            </div>
            <div class="field">
              <div class="field-label">Dirección</div>
              <div class="field-value">${receiverAddress}</div>
            </div>
            <div class="field">
              <div class="field-label">Ciudad</div>
              <div class="field-value">${receiverCity}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Detalles del Envío</div>
        <div class="details-grid">
          <div class="detail-item">
            <div class="label">Peso</div>
            <div class="value">${shipment.weight_kg ? shipment.weight_kg + ' kg' : '-'}</div>
          </div>
          <div class="detail-item">
            <div class="label">Paquetes</div>
            <div class="value">${shipment.package_count || 1}</div>
          </div>
          <div class="detail-item">
            <div class="label">Tipo Paquete</div>
            <div class="value">${packageType}</div>
          </div>
          <div class="detail-item">
            <div class="label">Tipo Entrega</div>
            <div class="value">${deliveryType}</div>
          </div>
          <div class="detail-item">
            <div class="label">Valor Declarado</div>
            <div class="value">${formatCurrency(shipment.declared_value)}</div>
          </div>
          <div class="detail-item">
            <div class="label">Volumen</div>
            <div class="value">${shipment.volume_m3 ? shipment.volume_m3 + ' m³' : '-'}</div>
          </div>
          <div class="detail-item">
            <div class="label">Fecha Creación</div>
            <div class="value">${formatDate(shipment.created_at)}</div>
          </div>
          <div class="detail-item">
            <div class="label">Entrega Esperada</div>
            <div class="value">${formatDate(shipment.expected_delivery_date)}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Items del Envío</div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="center">Cantidad</th>
              <th class="right">Peso</th>
              <th class="right">Valor Unit.</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Costos</div>
        <div class="costs-section">
          <div class="cost-item">
            <div class="label">Flete</div>
            <div class="value">${formatCurrency(shipment.shipping_fee || shipment.freight_cost)}</div>
          </div>
          <div class="cost-item">
            <div class="label">Seguro</div>
            <div class="value">${formatCurrency(shipment.insurance_fee || shipment.insurance_cost)}</div>
          </div>
          <div class="cost-item total">
            <div class="label">Total</div>
            <div class="value">${formatCurrency(shipment.total_cost)}</div>
          </div>
        </div>
      </div>

      ${shipment.notes ? `
      <div class="notes-box">
        <div class="label">Notas</div>
        <div>${shipment.notes}</div>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      Etiqueta generada el ${new Date().toLocaleString('es-CO')} · ${shipment.shipment_number || shipment.tracking_number || ''}
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`;
}

export function printShipmentLabel(shipment: ShipmentWithDetails): void {
  const html = generateShipmentLabelHTML(shipment);
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir la etiqueta.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}
