'use client';

import { useState } from 'react';
import { FileText, Printer, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import { useBlindCloseMode } from './useBlindCloseMode';
import type { CashSessionReport } from './types';
import { toast } from 'sonner';

interface ReportGeneratorProps {
  sessionId: number;
  disabled?: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  credit_card: 'Tarjeta Crédito',
  debit_card: 'Tarjeta Débito',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
  credit: 'Crédito',
  other: 'Otros',
};

export function ReportGenerator({ sessionId, disabled }: ReportGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const { showExpected } = useBlindCloseMode();

  const generateReport = async (format: 'letter' | 'pos') => {
    setLoading(true);
    try {
      const reportData = await CajasService.generateSessionReport(sessionId);
      const htmlContent = format === 'pos'
        ? generatePOSReport(reportData)
        : generateLetterReport(reportData);

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }

      toast.success(format === 'pos' ? 'Reporte POS generado' : 'Reporte generado exitosamente');
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Error al generar reporte', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const generateLetterReport = (report: CashSessionReport): string => {
    const { session, movements, summary, sales_summary } = report;
    const cashierName = (session as any).opened_by_name || 'Usuario';
    const branchName = (session as any).branch_name || `#${session.branch_id}`;
    const blindMode = !showExpected;

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    };

    const ingressMovements = movements.filter(m => m.type === 'in');
    const egressMovements = movements.filter(m => m.type === 'out');

    const incomeMethods = summary.income_by_method || {};
    const expenseMethods = summary.expense_by_method || {};

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Reporte de Caja #${session.id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; padding: 30px; color: #000; font-size: 12px; line-height: 1.5; }
  .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 22px; letter-spacing: 2px; }
  .header .subtitle { font-size: 13px; margin-top: 4px; }
  .header .meta { font-size: 10px; margin-top: 6px; color: #555; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section-title { font-weight: bold; font-size: 13px; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 10px; letter-spacing: 1px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .info-item { display: flex; justify-content: space-between; border-bottom: 1px dotted #ccc; padding: 4px 0; }
  .info-label { font-weight: bold; }
  .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .table th, .table td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 11px; }
  .table th { background: #eee; font-weight: bold; text-transform: uppercase; font-size: 10px; }
  .table .total-row { border-top: 2px solid #000; font-weight: bold; background: #f5f5f5; }
  .amount-right { text-align: right; font-family: monospace; }
  .methods-list { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .methods-list td { border: 1px solid #000; padding: 6px 8px; font-size: 11px; }
  .methods-list .method-label { font-weight: bold; }
  .methods-list .method-amount { text-align: right; font-family: monospace; }
  .grand-total { margin-top: 15px; border: 2px solid #000; padding: 10px; text-align: center; }
  .grand-total .label { font-size: 11px; text-transform: uppercase; font-weight: bold; }
  .grand-total .amount { font-size: 20px; font-weight: bold; margin-top: 4px; }
  .signature-section { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
  .signature-box { text-align: center; }
  .signature-box .line { border-top: 1px solid #000; padding-top: 8px; font-size: 10px; }
  .footer { margin-top: 30px; border-top: 1px solid #000; padding-top: 10px; text-align: center; font-size: 9px; color: #555; }
  @media print { body { padding: 15px; } .section { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="header">
    <h1>REPORTE DE ARQUEO DE CAJA</h1>
    <div class="subtitle">Sucursal: ${branchName} &mdash; Sesion #${session.id}</div>
    <div class="meta">Generado: ${formatDate(new Date().toISOString())}</div>
  </div>

  <div class="section">
    <div class="section-title">INFORMACION DE LA SESION</div>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Cajero:</span><span>${cashierName}</span></div>
      <div class="info-item"><span class="info-label">Estado:</span><span>${session.status === 'open' ? 'ABIERTA' : 'CERRADA'}</span></div>
      <div class="info-item"><span class="info-label">Apertura:</span><span>${formatDate(session.opened_at)}</span></div>
      <div class="info-item"><span class="info-label">Cierre:</span><span>${session.closed_at ? formatDate(session.closed_at) : '---'}</span></div>
      <div class="info-item"><span class="info-label">Sucursal:</span><span>${branchName}</span></div>
      <div class="info-item"><span class="info-label">Sesion ID:</span><span>#${session.id}</span></div>
    </div>
    ${session.notes ? `<div style="margin-top: 8px;"><strong>Observaciones:</strong> ${session.notes}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">RESUMEN FINANCIERO</div>
    <table class="table">
      <tr><td>Monto Inicial</td><td class="amount-right">${formatCurrency(summary.initial_amount)}</td></tr>
      <tr><td>Ventas en Efectivo (neto de vuelto)</td><td class="amount-right">${formatCurrency(summary.sales_cash)}</td></tr>
      <tr><td>Ingresos Manuales</td><td class="amount-right">${formatCurrency(summary.cash_in)}</td></tr>
      <tr><td>Egresos Manuales</td><td class="amount-right">-${formatCurrency(summary.cash_out)}</td></tr>
      ${summary.change_total > 0 ? `<tr><td>Vuelto Entregado</td><td class="amount-right">-${formatCurrency(summary.change_total)}</td></tr>` : ''}
      ${summary.returns_total > 0 ? `<tr><td>Devoluciones</td><td class="amount-right">-${formatCurrency(summary.returns_total)}</td></tr>` : ''}
      <tr class="total-row"><td>EFECTIVO ESPERADO EN CAJA</td><td class="amount-right">${blindMode ? '***' : formatCurrency(summary.expected_amount)}</td></tr>
    </table>
    ${session.status === 'closed' && summary.counted_amount !== undefined && !blindMode ? `
    <table class="table" style="margin-top: 8px;">
      <tr><td>Monto Contado</td><td class="amount-right">${formatCurrency(summary.counted_amount)}</td></tr>
      <tr class="total-row"><td>DIFERENCIA</td><td class="amount-right">${summary.difference! >= 0 ? '+' : ''}${formatCurrency(summary.difference || 0)}</td></tr>
    </table>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">PAGOS POR METODO</div>
    <table class="methods-list">
      <tr style="background: #eee;"><td class="method-label">METODO</td><td class="method-amount">INGRESOS</td><td class="method-amount">EGRESOS</td></tr>
      ${Object.keys({...incomeMethods, ...expenseMethods}).map(method => `
        <tr>
          <td class="method-label">${METHOD_LABELS[method] || method}</td>
          <td class="method-amount">${incomeMethods[method] ? formatCurrency(incomeMethods[method]) : '-'}</td>
          <td class="method-amount">${expenseMethods[method] ? '-' + formatCurrency(expenseMethods[method]) : '-'}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="section">
    <div class="section-title">RESUMEN DE VENTAS</div>
    <table class="table">
      <tr><td>Total Ventas (todos los metodos)</td><td class="amount-right">${formatCurrency(sales_summary.total_sales)}</td></tr>
      <tr><td>Ventas en Efectivo</td><td class="amount-right">${formatCurrency(sales_summary.cash_sales)}</td></tr>
      <tr><td>Ventas con Tarjeta</td><td class="amount-right">${formatCurrency(sales_summary.card_sales)}</td></tr>
      <tr><td>Otros Metodos</td><td class="amount-right">${formatCurrency(sales_summary.other_sales)}</td></tr>
    </table>
  </div>

  ${movements.length > 0 ? `
  <div class="section">
    <div class="section-title">MOVIMIENTOS DE CAJA</div>
    ${ingressMovements.length > 0 ? `
    <table class="table">
      <thead><tr><th>Fecha/Hora</th><th>Concepto</th><th class="amount-right">Ingreso</th><th>Notas</th></tr></thead>
      <tbody>
        ${ingressMovements.map(m => `<tr><td>${formatDate(m.created_at)}</td><td>${m.concept}</td><td class="amount-right">${formatCurrency(m.amount)}</td><td>${m.notes || '-'}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="2">TOTAL INGRESOS</td><td class="amount-right">${formatCurrency(summary.cash_in)}</td><td></td></tr>
      </tbody>
    </table>
    ` : ''}
    ${egressMovements.length > 0 ? `
    <table class="table" style="margin-top: 12px;">
      <thead><tr><th>Fecha/Hora</th><th>Concepto</th><th class="amount-right">Egreso</th><th>Notas</th></tr></thead>
      <tbody>
        ${egressMovements.map(m => `<tr><td>${formatDate(m.created_at)}</td><td>${m.concept}</td><td class="amount-right">-${formatCurrency(m.amount)}</td><td>${m.notes || '-'}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="2">TOTAL EGRESOS</td><td class="amount-right">-${formatCurrency(summary.cash_out)}</td><td></td></tr>
      </tbody>
    </table>
    ` : ''}
  </div>
  ` : ''}

  <div class="grand-total">
    <div class="label">EFECTIVO ESPERADO EN CAJA</div>
    <div class="amount">${blindMode ? '***' : formatCurrency(summary.expected_amount)}</div>
  </div>

  <div class="signature-section">
    <div class="signature-box"><div class="line">Cajero: ${cashierName}</div></div>
    <div class="signature-box"><div class="line">Supervisor</div></div>
  </div>

  <div class="footer">
    <p>GO Admin ERP - Reporte generado automaticamente</p>
    <p>${formatDate(new Date().toISOString())}</p>
  </div>
</body>
</html>`;
  };

  const generatePOSReport = (report: CashSessionReport): string => {
    const { session, summary, sales_summary } = report;
    const cashierName = (session as any).opened_by_name || 'Usuario';
    const branchName = (session as any).branch_name || `#${session.branch_id}`;
    const blindMode = !showExpected;

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    };

    const incomeMethods = summary.income_by_method || {};
    const expenseMethods = summary.expense_by_method || {};

    const line = (label: string, value: string) => `<tr><td>${label}</td><td style="text-align:right;">${value}</td></tr>`;
    const divider = '<tr><td colspan="2" style="border-top: 1px dashed #000; padding: 0;"></td></tr>';

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Caja #${session.id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; color: #000; font-size: 11px; line-height: 1.4; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 14px; }
  .small { font-size: 9px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .total-box { border: 2px solid #000; padding: 6px; margin: 6px 0; text-align: center; }
  .total-box .label { font-size: 10px; }
  .total-box .amount { font-size: 16px; font-weight: bold; }
  @media print { body { width: 80mm; margin: 0; } }
</style>
</head>
<body>
  <div class="center bold large">REPORTE DE CAJA</div>
  <div class="center small">${branchName} - Sesion #${session.id}</div>
  <hr>
  <table>
    ${line('Cajero:', cashierName)}
    ${line('Sucursal:', branchName)}
    ${line('Apertura:', formatDate(session.opened_at))}
    ${session.closed_at ? line('Cierre:', formatDate(session.closed_at)) : ''}
    ${line('Estado:', session.status === 'open' ? 'ABIERTA' : 'CERRADA')}
  </table>
  <hr>
  <div class="center bold">RESUMEN FINANCIERO</div>
  <table>
    ${line('Monto Inicial', formatCurrency(summary.initial_amount))}
    ${line('Ventas Efectivo', formatCurrency(summary.sales_cash))}
    ${line('Ingresos', formatCurrency(summary.cash_in))}
    ${line('Egresos', '-' + formatCurrency(summary.cash_out))}
    ${summary.change_total > 0 ? line('Vuelto', '-' + formatCurrency(summary.change_total)) : ''}
    ${summary.returns_total > 0 ? line('Devoluciones', '-' + formatCurrency(summary.returns_total)) : ''}
    ${divider}
    ${line('ESPERADO', blindMode ? '***' : formatCurrency(summary.expected_amount))}
  </table>
  ${session.status === 'closed' && summary.counted_amount !== undefined && !blindMode ? `
  <table>
    ${line('Contado', formatCurrency(summary.counted_amount))}
    ${line('Diferencia', (summary.difference! >= 0 ? '+' : '') + formatCurrency(summary.difference || 0))}
  </table>
  ` : ''}
  <hr>
  <div class="center bold">PAGOS POR METODO</div>
  <table>
    ${Object.keys({...incomeMethods, ...expenseMethods}).map(method => `
      ${line(METHOD_LABELS[method] || method, formatCurrency(incomeMethods[method] || 0))}
    `).join('')}
  </table>
  <hr>
  <div class="center bold">VENTAS</div>
  <table>
    ${line('Total', formatCurrency(sales_summary.total_sales))}
    ${line('Efectivo', formatCurrency(sales_summary.cash_sales))}
    ${line('Tarjeta', formatCurrency(sales_summary.card_sales))}
    ${line('Otros', formatCurrency(sales_summary.other_sales))}
  </table>
  <hr>
  <div class="total-box">
    <div class="label">EFECTIVO ESPERADO</div>
    <div class="amount">${blindMode ? '***' : formatCurrency(summary.expected_amount)}</div>
  </div>
  <hr>
  <div class="center small">
    Cajero: ${cashierName}<br>
    GO Admin ERP<br>
    ${formatDate(new Date().toISOString())}
  </div>
</body>
</html>`;
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
      <CardHeader>
        <CardTitle className="text-lg flex items-center space-x-2 dark:text-white text-gray-900">
          <FileText className="h-5 w-5 text-blue-600" />
          <span>Generar Reporte</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm dark:text-gray-400 text-gray-600">
          Genera un reporte de la sesión de caja. Formato profesional blanco y negro.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={() => generateReport('letter')}
            disabled={disabled || loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Generando...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Reporte Hoja Carta
              </>
            )}
          </Button>
          
          <Button
            onClick={() => generateReport('pos')}
            disabled={disabled || loading}
            variant="outline"
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Reporte POS 80mm
          </Button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Consejo:</strong> Use formato hoja para archivo/auditoria, y POS 80mm para impresora termica.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
