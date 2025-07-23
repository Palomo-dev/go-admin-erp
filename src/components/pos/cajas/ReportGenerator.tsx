'use client';

import { useState } from 'react';
import { FileText, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';
import { CajasService } from './CajasService';
import type { CashSessionReport } from './types';
import { toast } from 'sonner';

interface ReportGeneratorProps {
  sessionId: number;
  disabled?: boolean;
}

export function ReportGenerator({ sessionId, disabled }: ReportGeneratorProps) {
  const [loading, setLoading] = useState(false);

  const generatePDF = async () => {
    setLoading(true);
    try {
      // Generar los datos del reporte
      const reportData = await CajasService.generateSessionReport(sessionId);
      
      // Crear el contenido HTML para el PDF
      const htmlContent = generateHTMLReport(reportData);
      
      // Crear y abrir el PDF en una nueva ventana para impresión/descarga
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        // Intentar imprimir automáticamente
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      
      toast.success('Reporte generado exitosamente');
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Error al generar reporte', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const generateHTMLReport = (report: CashSessionReport): string => {
    const { session, movements, summary, sales_summary } = report;
    
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const ingressMovements = movements.filter(m => m.type === 'in');
    const egressMovements = movements.filter(m => m.type === 'out');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reporte de Caja - ${session.id}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.4;
            font-size: 12px;
          }
          .header { 
            text-align: center; 
            border-bottom: 2px solid #333; 
            padding-bottom: 15px; 
            margin-bottom: 20px;
          }
          .header h1 { 
            color: #2563eb; 
            margin: 0;
            font-size: 24px;
          }
          .header h2 { 
            margin: 5px 0; 
            color: #666;
            font-size: 16px;
            font-weight: normal;
          }
          .section { 
            margin-bottom: 25px; 
            page-break-inside: avoid;
          }
          .section-title { 
            background: #f3f4f6; 
            padding: 8px 12px; 
            border-left: 4px solid #2563eb;
            font-weight: bold;
            font-size: 14px;
            color: #374151;
          }
          .info-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 15px; 
            margin: 15px 0;
          }
          .info-item { 
            padding: 8px 0; 
          }
          .info-label { 
            font-weight: bold; 
            color: #374151;
          }
          .info-value { 
            color: #1f2937;
            margin-top: 2px;
          }
          .summary-grid { 
            display: grid; 
            grid-template-columns: repeat(2, 1fr); 
            gap: 15px; 
            margin: 15px 0;
          }
          .summary-item { 
            border: 1px solid #d1d5db; 
            border-radius: 6px; 
            padding: 12px; 
            text-align: center;
          }
          .summary-item.positive { 
            background: #f0fdf4; 
            border-color: #16a34a;
          }
          .summary-item.negative { 
            background: #fef2f2; 
            border-color: #dc2626;
          }
          .summary-item.neutral { 
            background: #f8fafc; 
            border-color: #64748b;
          }
          .summary-item.primary { 
            background: #eff6ff; 
            border-color: #2563eb;
          }
          .summary-label { 
            font-size: 11px; 
            color: #6b7280; 
            text-transform: uppercase; 
            font-weight: 600;
          }
          .summary-amount { 
            font-size: 16px; 
            font-weight: bold; 
            margin-top: 4px;
          }
          .movements-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 10px;
          }
          .movements-table th, 
          .movements-table td { 
            border: 1px solid #d1d5db; 
            padding: 8px; 
            text-align: left;
          }
          .movements-table th { 
            background: #f9fafb; 
            font-weight: bold; 
            color: #374151;
            font-size: 11px;
            text-transform: uppercase;
          }
          .movements-table td { 
            font-size: 11px;
          }
          .amount-positive { 
            color: #16a34a; 
            font-weight: bold;
          }
          .amount-negative { 
            color: #dc2626; 
            font-weight: bold;
          }
          .total-row { 
            background: #f3f4f6 !important; 
            font-weight: bold;
            font-size: 12px;
          }
          .footer { 
            margin-top: 30px; 
            padding-top: 15px; 
            border-top: 1px solid #d1d5db; 
            text-align: center; 
            font-size: 10px; 
            color: #6b7280;
          }
          .signature-section { 
            margin-top: 40px; 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 50px;
          }
          .signature-box { 
            text-align: center; 
            border-top: 1px solid #374151; 
            padding-top: 10px;
          }
          @media print {
            body { margin: 10px; }
            .header { page-break-after: avoid; }
            .section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <!-- Encabezado -->
        <div class="header">
          <h1>REPORTE DE CAJA</h1>
          <h2>Sesión #${session.id}</h2>
          <p>Fecha de generación: ${formatDate(new Date().toISOString())}</p>
        </div>

        <!-- Información de la sesión -->
        <div class="section">
          <div class="section-title">INFORMACIÓN DE LA SESIÓN</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Estado:</div>
              <div class="info-value">${session.status === 'open' ? 'Abierta' : 'Cerrada'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Sucursal:</div>
              <div class="info-value">ID: ${session.branch_id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha de Apertura:</div>
              <div class="info-value">${formatDate(session.opened_at)}</div>
            </div>
            ${session.closed_at ? `
            <div class="info-item">
              <div class="info-label">Fecha de Cierre:</div>
              <div class="info-value">${formatDate(session.closed_at)}</div>
            </div>
            ` : ''}
          </div>
          ${session.notes ? `
          <div class="info-item">
            <div class="info-label">Observaciones:</div>
            <div class="info-value">${session.notes}</div>
          </div>
          ` : ''}
        </div>

        <!-- Resumen de caja -->
        <div class="section">
          <div class="section-title">RESUMEN FINANCIERO</div>
          <div class="summary-grid">
            <div class="summary-item primary">
              <div class="summary-label">Monto Inicial</div>
              <div class="summary-amount">${formatCurrency(summary.initial_amount)}</div>
            </div>
            <div class="summary-item positive">
              <div class="summary-label">Ventas Efectivo</div>
              <div class="summary-amount">${formatCurrency(summary.sales_cash)}</div>
            </div>
            <div class="summary-item positive">
              <div class="summary-label">Ingresos</div>
              <div class="summary-amount">${formatCurrency(summary.cash_in)}</div>
            </div>
            <div class="summary-item negative">
              <div class="summary-label">Egresos</div>
              <div class="summary-amount">${formatCurrency(summary.cash_out)}</div>
            </div>
          </div>
          <div style="margin-top: 20px;">
            <div class="summary-item primary" style="max-width: 300px; margin: 0 auto;">
              <div class="summary-label">Total Esperado</div>
              <div class="summary-amount" style="font-size: 20px;">${formatCurrency(summary.expected_amount)}</div>
            </div>
          </div>
          ${session.status === 'closed' && summary.counted_amount !== undefined ? `
          <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; max-width: 600px; margin-left: auto; margin-right: auto;">
            <div class="summary-item neutral">
              <div class="summary-label">Monto Contado</div>
              <div class="summary-amount">${formatCurrency(summary.counted_amount)}</div>
            </div>
            <div class="summary-item ${summary.difference === 0 ? 'neutral' : summary.difference! > 0 ? 'positive' : 'negative'}">
              <div class="summary-label">Diferencia</div>
              <div class="summary-amount">${summary.difference! >= 0 ? '+' : ''}${formatCurrency(summary.difference || 0)}</div>
            </div>
          </div>
          ` : ''}
        </div>

        <!-- Resumen de ventas -->
        <div class="section">
          <div class="section-title">RESUMEN DE VENTAS</div>
          <div class="summary-grid">
            <div class="summary-item neutral">
              <div class="summary-label">Total Ventas</div>
              <div class="summary-amount">${formatCurrency(sales_summary.total_sales)}</div>
            </div>
            <div class="summary-item positive">
              <div class="summary-label">Efectivo</div>
              <div class="summary-amount">${formatCurrency(sales_summary.cash_sales)}</div>
            </div>
            <div class="summary-item neutral">
              <div class="summary-label">Tarjetas</div>
              <div class="summary-amount">${formatCurrency(sales_summary.card_sales)}</div>
            </div>
            <div class="summary-item neutral">
              <div class="summary-label">Otros</div>
              <div class="summary-amount">${formatCurrency(sales_summary.other_sales)}</div>
            </div>
          </div>
        </div>

        ${movements.length > 0 ? `
        <!-- Movimientos de caja -->
        <div class="section">
          <div class="section-title">MOVIMIENTOS DE CAJA</div>
          
          ${ingressMovements.length > 0 ? `
          <h4 style="color: #16a34a; margin: 15px 0 10px 0;">INGRESOS</h4>
          <table class="movements-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${ingressMovements.map(movement => `
                <tr>
                  <td>${formatDate(movement.created_at)}</td>
                  <td>${movement.concept}</td>
                  <td class="amount-positive">${formatCurrency(movement.amount)}</td>
                  <td>${movement.notes || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2">TOTAL INGRESOS</td>
                <td class="amount-positive">${formatCurrency(summary.cash_in)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          ` : ''}

          ${egressMovements.length > 0 ? `
          <h4 style="color: #dc2626; margin: 15px 0 10px 0;">EGRESOS</h4>
          <table class="movements-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${egressMovements.map(movement => `
                <tr>
                  <td>${formatDate(movement.created_at)}</td>
                  <td>${movement.concept}</td>
                  <td class="amount-negative">${formatCurrency(movement.amount)}</td>
                  <td>${movement.notes || '-'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2">TOTAL EGRESOS</td>
                <td class="amount-negative">${formatCurrency(summary.cash_out)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          ` : ''}
        </div>
        ` : ''}

        <!-- Firmas -->
        <div class="signature-section">
          <div class="signature-box">
            <div>Elaborado por</div>
            <div style="margin-top: 30px; font-size: 10px;">
              Usuario ID: ${session.opened_by}
            </div>
          </div>
          <div class="signature-box">
            <div>Revisado por</div>
            <div style="margin-top: 30px; font-size: 10px;">
              Supervisor
            </div>
          </div>
        </div>

        <!-- Pie de página -->
        <div class="footer">
          <p>Reporte generado automáticamente por GO Admin ERP</p>
          <p>Fecha: ${formatDate(new Date().toISOString())}</p>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-200">
      <CardHeader>
        <CardTitle className="text-lg flex items-center space-x-2 dark:text-white light:text-gray-900">
          <FileText className="h-5 w-5 text-blue-600" />
          <span>Generar Reporte</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm dark:text-gray-400 light:text-gray-600">
          Genera un reporte completo de la sesión de caja con todos los movimientos, 
          resúmenes financieros y detalles para archivo o auditoría.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={generatePDF}
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
                Imprimir Reporte
              </>
            )}
          </Button>
          
          <Button
            onClick={generatePDF}
            disabled={disabled || loading}
            variant="outline"
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>💡 Consejo:</strong> Se recomienda generar el reporte al cerrar cada sesión 
            de caja para mantener un archivo completo de las operaciones.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
