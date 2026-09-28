'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEtiquetaEstado } from '@/components/kit/useIdiomaKit';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { NuevaFacturaForm, type DatosEdicionFactura, type FacturaInicialVenta } from '../nueva-factura/NuevaFacturaForm';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { resolveLineTax } from '@/lib/services/taxResolver';
import { ErrorPeticionFactura, guardarFacturaVenta } from '@/lib/finanzas/ventas/clienteFacturas';

interface EditarFacturaVentaProps {
  facturaId: string;
}

/** Por qué no se pudo abrir la factura para editar (el texto sale del idioma activo). */
type ErrorCargaFactura =
  | { tipo: 'faltanDatos' }
  | { tipo: 'noEncontrada' }
  | { tipo: 'noEditable'; estado: string }
  | { tipo: 'carga' };

export function EditarFacturaVenta({ facturaId }: EditarFacturaVentaProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [factura, setFactura] = useState<(FacturaInicialVenta & { id: string }) | null>(null);
  const [error, setError] = useState<ErrorCargaFactura | null>(null);
  const organizationId = getOrganizationId();
  const t = useTranslations('facturasVenta');
  const etiquetaEstado = useEtiquetaEstado();

  const cargarFactura = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!organizationId || !facturaId) {
        setError({ tipo: 'faltanDatos' });
        return;
      }

      const { data: facturaData, error: facturaError } = await supabase
        .from('invoice_sales')
        .select('*')
        .eq('id', facturaId)
        .eq('organization_id', organizationId)
        .single();

      if (facturaError) throw facturaError;
      if (!facturaData) {
        setError({ tipo: 'noEncontrada' });
        return;
      }

      if (facturaData.status !== 'draft') {
        setError({ tipo: 'noEditable', estado: String(facturaData.status) });
        return;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_sales_id', facturaId)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      // Cargar impuestos aplicados
      const { data: appliedTaxesData, error: appliedTaxesError } = await supabase
        .from('invoice_applied_taxes')
        .select('tax_code, tax_rate, is_applied')
        .eq('invoice_id', facturaId);

      if (appliedTaxesError) console.warn('Error cargando impuestos aplicados:', appliedTaxesError);

      setFactura({
        ...facturaData,
        items: itemsData || [],
        applied_taxes: appliedTaxesData || []
      });
    } catch (error: unknown) {
      console.error('Error cargando factura:', error);
      setError({ tipo: 'carga' });
    } finally {
      setLoading(false);
    }
  }, [facturaId, organizationId]);

  useEffect(() => {
    void cargarFactura();
  }, [cargarFactura]);

  const handleSubmit = async (datosFactura: DatosEdicionFactura) => {
    if (!factura) return;

    try {
      setSaving(true);

      // F-42: cada línea pasa por el resolver único antes de guardarse. La
      // tarifa elegida en el formulario manda; si viene en 0, el resolver sigue
      // con los impuestos del producto y los de la organización por defecto.
      const documentoTaxIncluded = Boolean(datosFactura.tax_included);
      const lineas = [];
      for (const item of datosFactura.items) {
        const qty = Number(item.qty) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        const discountAmount = Number(item.discount_amount) || 0;
        const resolved = await resolveLineTax({
          itemTaxRate: item.tax_rate,
          itemTaxCode: item.tax_code,
          productId: item.product_id || null,
          organizationId: Number(organizationId),
          taxIncluded: documentoTaxIncluded,
          qty,
          unitPrice,
          discountAmount,
        });
        lineas.push({
          product_id: item.product_id || null,
          description: item.description,
          qty,
          unit_price: unitPrice,
          tax_code: resolved.tax_code,
          tax_rate: resolved.tax_rate,
          tax_included: resolved.tax_included,
          total_line: resolved.total_line,
          discount_amount: discountAmount,
          serial_ids:
            item.product_id && datosFactura.serial_selections?.[item.product_id]?.length
              ? datosFactura.serial_selections[item.product_id]
              : undefined,
        });
      }

      // Una sola llamada: la base edita el borrador en una transacción (cabecera,
      // líneas, impuestos y venta ligada) y recalcula totales y saldo; nada de
      // saldos escritos desde el navegador.
      await guardarFacturaVenta(factura.id, {
        number: datosFactura.number || null,
        customer_id: datosFactura.customer_id || null,
        branch_id: Number(datosFactura.branch_id),
        issue_date: datosFactura.issue_date || null,
        due_date: datosFactura.due_date || null,
        currency: datosFactura.currency || null,
        payment_terms: Number(datosFactura.payment_terms) || 0,
        payment_method: datosFactura.payment_method || null,
        notes: datosFactura.notes || null,
        tax_included: documentoTaxIncluded,
        salesperson_id: datosFactura.salesperson_id || null,
        opportunity_id: datosFactura.opportunity_id || null,
        commission_rate: Number(datosFactura.commission_rate) || 0,
        commission_type: datosFactura.commission_type || 'none',
        commission_method: datosFactura.commission_method || 'percentage',
        applied_taxes: Object.keys(datosFactura.appliedTaxes || {})
          .filter((code) => datosFactura.appliedTaxes[code])
          .map((code) => ({ tax_code: code })),
        items: lineas,
      });

      toastSuccess(t('editar.actualizadaTitulo'), t('editar.actualizada'));

      router.push(`/app/finanzas/facturas-venta/${factura.id}`);
    } catch (error: unknown) {
      console.error('Error actualizando factura:', error);
      const codigo = error instanceof ErrorPeticionFactura ? error.codigo : null;
      toastError(
        t('editar.errorActualizarTitulo'),
        codigo === 'factura_no_borrador'
          ? t('errores.factura_no_borrador')
          : codigo === 'numero_duplicado'
            ? t('formulario.avisos.numeroYaExiste')
            : t('editar.errorActualizar'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
        <Card className="
          p-3 sm:p-4 lg:p-6
          bg-white dark:bg-gray-800
          border-gray-200 dark:border-gray-700
          shadow-sm
          w-full
          overflow-hidden
        ">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    const mensajeError =
      error.tipo === 'faltanDatos'
        ? t('editar.faltanDatos')
        : error.tipo === 'noEncontrada'
          ? t('errores.factura_no_encontrada')
          : error.tipo === 'noEditable'
            ? t('editar.noEditable', { estado: etiquetaEstado(error.estado) })
            : t('editar.errorCarga');
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              aria-label={t('editar.volver')}
              className="p-2 h-auto min-w-[36px] sm:min-w-[40px] hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </Button>
            <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {t('editar.titulo')}
            </h1>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{mensajeError}</AlertDescription>
        </Alert>
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {error.tipo === 'noEditable' ? t('editar.noEditableAyuda') : t('editar.cargaAyuda')}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="default" onClick={cargarFactura}>
              {t('editar.reintentar')}
            </Button>
            <Button variant="outline" onClick={() => router.push(`/app/finanzas/facturas-venta/${facturaId}`)}>
              {t('editar.volverDetalle')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (factura) {
    return (
      <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              aria-label={t('editar.volver')}
              className="
                p-2 h-auto min-w-[36px] sm:min-w-[40px]
                hover:bg-gray-100 dark:hover:bg-gray-700
                rounded-lg
                transition-colors
              "
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </Button>
            <div className="flex-shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {t('editar.tituloVenta')}
            </h1>
          </div>
        </div>
        <Card className="
          p-3 sm:p-4 lg:p-6
          bg-white dark:bg-gray-800
          border-gray-200 dark:border-gray-700
          shadow-sm
          w-full
          overflow-hidden
        ">
          <NuevaFacturaForm
            facturaInicial={factura}
            onSubmit={handleSubmit}
            saving={saving}
            esEdicion={true}
          />
        </Card>
      </div>
    );
  }

  return null;
}
