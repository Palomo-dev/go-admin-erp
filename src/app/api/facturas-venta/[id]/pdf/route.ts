import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: data.currency || 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const statusText: Record<string, string> = {
      draft: 'Borrador',
      issued: 'Emitida',
      paid: 'Pagada',
      partial: 'Pago Parcial',
      void: 'Anulada',
      voided: 'Anulada',
    };

    const primaryColor = data.organization?.primary_color || '#2563eb';
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : '';
    const qrData = `Factura: ${data.number} | Total: ${formatCurrency(data.total)} | Saldo: ${formatCurrency(data.balance || 0)} | ${data.organization?.name || ''}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura ${data.number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; }
  .invoice { max-width: 800px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid ${primaryColor}; }
  .logo-section { display: flex; align-items: center; gap: 12px; }
  .logo-img { max-height: 60px; max-width: 180px; object-fit: contain; }
  .logo-text { font-size: 28px; font-weight: bold; color: ${primaryColor}; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 32px; color: #1f2937; margin-bottom: 5px; }
  .invoice-number { font-size: 16px; color: #6b7280; margin-bottom: 8px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .status-issued { background: #dbeafe; color: #1e40af; }
  .status-paid { background: #d1fae5; color: #065f46; }
  .status-partial { background: #fef3c7; color: #92400e; }
  .status-void, .status-voided { background: #fee2e2; color: #991b1b; }
  .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .info-box { flex: 1; }
  .info-box h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
  .info-box p { margin-bottom: 4px; line-height: 1.5; }
  .info-box .name { font-weight: 600; font-size: 14px; color: #111; }
  .dates { display: flex; gap: 40px; margin-bottom: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
  .dates label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 4px; }
  .dates span { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { background: ${primaryColor}; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
  th:last-child { text-align: right; }
  td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
  td:last-child { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
  .totals .subtotal { border-bottom: 1px solid #e5e7eb; }
  .totals .discount { color: #dc2626; }
  .totals .total { font-size: 16px; font-weight: bold; border-top: 2px solid ${primaryColor}; padding-top: 12px; margin-top: 4px; }
  .totals .balance { color: #dc2626; font-weight: bold; }
  .totals .paid { color: #059669; font-weight: 600; }
  .item-discount { color: #dc2626; font-size: 11px; }
  .notes { margin-top: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
  .notes h4 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
  .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; padding-top: 20px; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div class="logo-section">
      ${data.organization?.logo_url ? `<img src="${data.organization.logo_url}" alt="Logo" class="logo-img" />` : `<div class="logo-text">${data.organization?.name || 'Mi Empresa'}</div>`}
    </div>
    <div class="invoice-title">
      <h1>FACTURA</h1>
      <div class="invoice-number">${data.number}</div>
      <span class="status status-${data.status}">${statusText[data.status] || data.status}</span>
    </div>
  </div>

  ${['void', 'voided', 'cancelled'].includes(data.status) ? `<div style="border:2px solid #dc2626;color:#dc2626;background:#fef2f2;padding:10px 16px;border-radius:8px;text-align:center;font-weight:bold;font-size:16px;letter-spacing:2px;margin-bottom:20px;">DOCUMENTO ANULADO</div>` : ''}

  <div class="info-section">
    <div class="info-box">
      <h3>De</h3>
      <p class="name">${data.organization?.name || 'Mi Empresa'}</p>
      ${data.organization?.tax_id ? `<p>NIT: ${data.organization.tax_id}</p>` : ''}
      ${data.organization?.address ? `<p>${data.organization.address}</p>` : ''}
      ${data.organization?.phone ? `<p>Tel: ${data.organization.phone}</p>` : ''}
      ${data.organization?.email ? `<p>${data.organization.email}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Facturar a</h3>
      <p class="name">${data.customer?.full_name || 'Cliente'}</p>
      ${data.customer?.tax_id ? `<p>NIT/CC: ${data.customer.tax_id}</p>` : ''}
      ${data.customer?.address ? `<p>${data.customer.address}</p>` : ''}
      ${data.customer?.phone ? `<p>Tel: ${data.customer.phone}</p>` : ''}
      ${data.customer?.email ? `<p>${data.customer.email}</p>` : ''}
    </div>
  </div>

  <div class="dates">
    <div><label>Fecha de Emisión</label><span>${formatDate(data.issue_date)}</span></div>
    <div><label>Fecha de Vencimiento</label><span>${formatDate(data.due_date)}</span></div>
    <div><label>Moneda</label><span>${data.currency || 'COP'}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40%">Descripción</th>
        <th style="width:8%">Cant.</th>
        <th style="width:13%">Precio Unit.</th>
        <th style="width:10%">Descuento</th>
        <th style="width:9%">IVA</th>
        <th style="width:15%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${(data.items || []).map((item: any) => `
        <tr>
          <td>${item.sku ? `<span style="color:#6b7280;font-size:11px;">SKU: ${item.sku}</span><br/>` : ''}${item.description}</td>
          <td>${item.qty}</td>
          <td>${formatCurrency(item.unit_price)}</td>
          <td>${item.discount_amount && item.discount_amount > 0 ? `<span class="item-discount">- ${formatCurrency(item.discount_amount)}</span>` : '-'}</td>
          <td>${item.tax_rate ? `${item.tax_rate}%${item.tax_included ? ' (incl.)' : ''}` : '-'}</td>
          <td>${formatCurrency(item.total_line)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="subtotal"><span>Subtotal</span><span>${formatCurrency(data.subtotal)}</span></div>
    ${data.discount_total && data.discount_total > 0 ? `<div class="discount"><span>Descuentos</span><span>- ${formatCurrency(data.discount_total)}</span></div>` : ''}
    <div><span>IVA</span><span>${formatCurrency(data.tax_total)}</span></div>
    <div class="total"><span>Total</span><span>${formatCurrency(data.total)}</span></div>
    ${data.credit_applied && data.credit_applied > 0 ? `<div><span>Nota crédito / saldo aplicado</span><span>- ${formatCurrency(data.credit_applied)}</span></div>` : ''}
    ${data.balance > 0 ? `<div class="balance"><span>Saldo Pendiente</span><span>${formatCurrency(data.balance)}</span></div>` : `<div class="paid"><span>Pagado</span><span>${formatCurrency(data.total - (data.balance || 0))}</span></div>`}
  </div>

  ${data.notes ? `<div class="notes"><h4>Notas</h4><p>${data.notes}</p></div>` : ''}

  <div class="footer">
    <p>Gracias por su preferencia</p>
    <p>Este documento fue generado electrónicamente</p>
  </div>
</div>
</body>
</html>`;

    // Generar PDF con puppeteer
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      });
    } catch (launchErr) {
      console.error('[PDF API] Error lanzando puppeteer:', launchErr);
      throw launchErr;
    }
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'letter',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
      });
      await browser.close();

      // Subir PDF a Supabase Storage con admin client (service role key)
      const supabase = getSupabaseAdmin();

      const filePath = `facturas-venta/${id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error('[PDF API] Error subiendo PDF a Storage:', uploadError);
        return NextResponse.json({ error: 'Error al subir PDF' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      console.log('[PDF API] PDF subido correctamente:', urlData.publicUrl);
      return NextResponse.json({ url: urlData.publicUrl });
    } catch (innerErr) {
      if (browser) await browser.close();
      throw innerErr;
    }
  } catch (error) {
    console.error('Error generando PDF:', error);
    return NextResponse.json(
      { error: 'Error al generar PDF' },
      { status: 500 }
    );
  }
}
