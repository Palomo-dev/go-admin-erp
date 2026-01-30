import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: data.currency || 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const statusText: Record<string, string> = {
      'draft': 'Borrador',
      'issued': 'Emitida',
      'paid': 'Pagada',
      'partial': 'Pago Parcial',
      'void': 'Anulada'
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Factura ${data.number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; }
          .invoice { max-width: 800px; margin: 0 auto; padding: 40px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #2563eb; }
          .logo { font-size: 28px; font-weight: bold; color: #2563eb; }
          .invoice-title { text-align: right; }
          .invoice-title h1 { font-size: 32px; color: #1f2937; margin-bottom: 5px; }
          .invoice-number { font-size: 16px; color: #6b7280; }
          .status { display: inline-block; padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 8px; }
          .status-draft { background: #fef3c7; color: #92400e; }
          .status-issued { background: #dbeafe; color: #1e40af; }
          .status-paid { background: #d1fae5; color: #065f46; }
          .status-partial { background: #ede9fe; color: #5b21b6; }
          .status-void { background: #f3f4f6; color: #374151; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-box { width: 48%; }
          .info-box h3 { font-size: 12px; text-transform: uppercase; color: #6b7280; margin-bottom: 10px; letter-spacing: 1px; font-weight: 600; }
          .info-box p { margin-bottom: 5px; line-height: 1.6; }
          .info-box .name { font-weight: 700; font-size: 16px; color: #111827; }
          .dates { display: flex; gap: 50px; margin-bottom: 30px; padding: 20px; background: #f3f4f6; border-radius: 10px; }
          .dates div { }
          .dates label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
          .dates span { font-weight: 700; font-size: 14px; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #2563eb; color: white; padding: 14px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
          th:last-child { text-align: right; }
          td { padding: 14px 12px; border-bottom: 1px solid #e5e7eb; }
          td:last-child { text-align: right; font-weight: 500; }
          tr:hover { background: #f9fafb; }
          .totals { margin-left: auto; width: 300px; }
          .totals div { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; }
          .totals .subtotal { border-bottom: 1px solid #e5e7eb; }
          .totals .total { font-size: 18px; font-weight: bold; border-top: 3px solid #2563eb; padding-top: 15px; margin-top: 5px; color: #111827; }
          .totals .balance { color: #dc2626; font-weight: 600; }
          .notes { margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 10px; border-left: 4px solid #f59e0b; }
          .notes h4 { font-size: 12px; text-transform: uppercase; color: #92400e; margin-bottom: 10px; letter-spacing: 0.5px; }
          .notes p { color: #78350f; line-height: 1.6; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; padding-top: 25px; border-top: 1px solid #e5e7eb; }
          .footer p { margin-bottom: 5px; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="logo">${data.organization?.name || 'Mi Empresa'}</div>
            <div class="invoice-title">
              <h1>FACTURA</h1>
              <div class="invoice-number">${data.number}</div>
              <span class="status status-${data.status}">${statusText[data.status] || data.status}</span>
            </div>
          </div>
          
          <div class="info-section">
            <div class="info-box">
              <h3>Emitido Por</h3>
              <p class="name">${data.organization?.name || 'Mi Empresa'}</p>
              ${data.organization?.tax_id ? `<p>NIT: ${data.organization.tax_id}</p>` : ''}
              ${data.organization?.address ? `<p>${data.organization.address}</p>` : ''}
              ${data.organization?.phone ? `<p>Tel: ${data.organization.phone}</p>` : ''}
              ${data.organization?.email ? `<p>${data.organization.email}</p>` : ''}
            </div>
            <div class="info-box">
              <h3>Facturar A</h3>
              <p class="name">${data.customer?.full_name || 'Cliente'}</p>
              ${data.customer?.tax_id ? `<p>NIT/CC: ${data.customer.tax_id}</p>` : ''}
              ${data.customer?.address ? `<p>${data.customer.address}</p>` : ''}
              ${data.customer?.phone ? `<p>Tel: ${data.customer.phone}</p>` : ''}
              ${data.customer?.email ? `<p>${data.customer.email}</p>` : ''}
            </div>
          </div>
          
          <div class="dates">
            <div>
              <label>Fecha de Emisión</label>
              <span>${formatDate(data.issue_date)}</span>
            </div>
            <div>
              <label>Fecha de Vencimiento</label>
              <span>${formatDate(data.due_date)}</span>
            </div>
            <div>
              <label>Moneda</label>
              <span>${data.currency || 'COP'}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 50%">Descripción</th>
                <th style="width: 10%">Cant.</th>
                <th style="width: 15%">Precio Unit.</th>
                <th style="width: 10%">IVA</th>
                <th style="width: 15%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${(data.items || []).map((item: any) => `
                <tr>
                  <td>${item.description}</td>
                  <td>${item.qty}</td>
                  <td>${formatCurrency(item.unit_price)}</td>
                  <td>${item.tax_rate ? `${item.tax_rate}%` : '-'}</td>
                  <td>${formatCurrency(item.total_line)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="subtotal">
              <span>Subtotal</span>
              <span>${formatCurrency(data.subtotal)}</span>
            </div>
            <div>
              <span>Impuestos</span>
              <span>${formatCurrency(data.tax_total)}</span>
            </div>
            <div class="total">
              <span>Total</span>
              <span>${formatCurrency(data.total)}</span>
            </div>
            ${data.balance > 0 && data.balance < data.total ? `
              <div class="balance">
                <span>Saldo Pendiente</span>
                <span>${formatCurrency(data.balance)}</span>
              </div>
            ` : ''}
          </div>
          
          ${data.notes ? `
            <div class="notes">
              <h4>Notas</h4>
              <p>${data.notes}</p>
            </div>
          ` : ''}
          
          <div class="footer">
            <p><strong>Gracias por su preferencia</strong></p>
            <p>Este documento fue generado electrónicamente</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Retornar HTML como respuesta con headers para descarga
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="factura_${data.number}.html"`,
      },
    });

  } catch (error) {
    console.error('Error generando PDF:', error);
    return NextResponse.json(
      { error: 'Error al generar el documento' },
      { status: 500 }
    );
  }
}
