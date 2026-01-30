'use client';

import { formatCurrency } from '@/utils/Utils';

export interface InvoiceDataForPDF {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  notes?: string;
  customer?: {
    full_name: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
  };
  organization?: {
    name: string;
    tax_id?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  items: {
    description: string;
    qty: number;
    unit_price: number;
    tax_rate?: number;
    total_line: number;
  }[];
}

export class PDFService {
  // Generar PDF de factura usando API route
  static async generateInvoicePDF(invoiceData: InvoiceDataForPDF): Promise<Blob> {
    try {
      const response = await fetch('/api/pdf/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoiceData),
      });

      if (!response.ok) {
        throw new Error('Error al generar PDF');
      }

      return await response.blob();
    } catch (error) {
      console.error('Error generando PDF:', error);
      throw error;
    }
  }

  // Descargar PDF de factura
  static async downloadInvoicePDF(invoiceData: InvoiceDataForPDF, filename?: string): Promise<void> {
    try {
      const blob = await this.generateInvoicePDF(invoiceData);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `factura_${invoiceData.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error descargando PDF:', error);
      throw error;
    }
  }

  // Abrir PDF en nueva pestaña para imprimir
  static async printInvoicePDF(invoiceData: InvoiceDataForPDF): Promise<void> {
    try {
      const blob = await this.generateInvoicePDF(invoiceData);
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error('Error imprimiendo PDF:', error);
      throw error;
    }
  }

  // Generar HTML para el PDF (alternativa usando window.print con estilos)
  static generateInvoiceHTML(data: InvoiceDataForPDF): string {
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

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Factura ${data.number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; }
          .invoice { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb; }
          .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
          .invoice-title { text-align: right; }
          .invoice-title h1 { font-size: 28px; color: #333; margin-bottom: 5px; }
          .invoice-number { font-size: 14px; color: #666; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 5px; }
          .status-draft { background: #fef3c7; color: #92400e; }
          .status-issued { background: #dbeafe; color: #1e40af; }
          .status-paid { background: #d1fae5; color: #065f46; }
          .status-partial { background: #ede9fe; color: #5b21b6; }
          .status-void { background: #f3f4f6; color: #374151; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-box { width: 48%; }
          .info-box h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: 0.5px; }
          .info-box p { margin-bottom: 4px; line-height: 1.5; }
          .info-box .name { font-weight: 600; font-size: 14px; color: #111; }
          .dates { display: flex; gap: 40px; margin-bottom: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .dates div { }
          .dates label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 4px; }
          .dates span { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #2563eb; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
          th:last-child { text-align: right; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
          td:last-child { text-align: right; }
          .totals { margin-left: auto; width: 280px; }
          .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
          .totals .subtotal { border-bottom: 1px solid #e5e7eb; }
          .totals .total { font-size: 16px; font-weight: bold; border-top: 2px solid #2563eb; padding-top: 12px; margin-top: 4px; }
          .totals .balance { color: #dc2626; }
          .notes { margin-top: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .notes h4 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .invoice { padding: 0; }
          }
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
              ${data.items.map(item => `
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
              <span>IVA</span>
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
            <p>Gracias por su preferencia</p>
            <p>Este documento fue generado electrónicamente</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Método alternativo: Imprimir usando ventana del navegador
  static printInvoiceHTML(data: InvoiceDataForPDF): void {
    const html = this.generateInvoiceHTML(data);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }
}
