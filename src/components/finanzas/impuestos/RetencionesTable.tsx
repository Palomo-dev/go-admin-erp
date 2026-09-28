"use client";

import React, { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable, Tarjeta, clasesBoton, formatearTarifa, type ColumnaTabla, type AccionFila } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import TaxForm from './TaxForm';
import DeleteTaxDialog from './DeleteTaxDialog';
import { tipoRetencion } from './retencionesLogica';
import type { OrganizationTax } from './useImpuestosOrganizacion';

interface RetencionesTableProps {
  retenciones: OrganizationTax[];
  loading: boolean;
  error: boolean;
  organizationId: number | null;
  onRefresh: () => void | Promise<void>;
}

/**
 * Pestaña «Retenciones» de Finanzas › Impuestos (Figma 1012:87187, B-I2).
 *
 * Las retenciones (kind = 'withholding') no son impuestos de venta: no se
 * ofrecen al configurar el producto, ni en el POS, ni en facturas o
 * cotizaciones, y nunca se suman al precio. Aquí se consultan, se activan y se
 * editan; la escritura va por las mismas RPC con permiso de finanzas.
 */
export default function RetencionesTable({ retenciones, loading, error, organizationId, onRefresh }: RetencionesTableProps) {
  const t = useTranslations('impuestosRetenciones');
  const locale = useLocale();
  const { toast } = useToast();
  const [formulario, setFormulario] = useState<{ abierto: boolean; retencion: OrganizationTax | null }>({
    abierto: false,
    retencion: null,
  });
  const [aEliminar, setAEliminar] = useState<OrganizationTax | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const alternarActiva = async (fila: OrganizationTax) => {
    if (!organizationId) return;
    setCambiando(fila.id);
    try {
      const { error: rpcError } = await supabase.rpc('fn_impuesto_cambiar_activo', {
        p_organization_id: organizationId,
        p_id: fila.id,
        p_activo: !fila.is_active,
      });
      if (rpcError) throw rpcError;
      await onRefresh();
      toast({ description: t(fila.is_active ? 'toast.desactivada' : 'toast.activada', { nombre: fila.name }) });
    } catch (err) {
      console.error('Error al cambiar el estado de la retención:', err);
      toast({ title: t('toast.errorTitulo'), description: t('toast.errorEstado'), variant: 'destructive' });
    } finally {
      setCambiando(null);
    }
  };

  const columnas = useMemo<ColumnaTabla<OrganizationTax>[]>(
    () => [
      {
        id: 'nombre',
        encabezado: t('columnas.nombre'),
        celda: (fila) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{fila.name}</p>
            {fila.description && <p className="truncate text-xs text-fg-secondary">{fila.description}</p>}
          </div>
        ),
      },
      {
        id: 'tipo',
        encabezado: t('columnas.tipo'),
        celda: (fila) => (
          <Badge tono="neutro" tamano="sm">
            {t(`tipos.${tipoRetencion(null, fila.name)}`)}
          </Badge>
        ),
      },
      {
        id: 'tarifa',
        encabezado: t('columnas.tarifa'),
        alinear: 'derecha',
        celda: (fila) => (
          <span className="font-medium tabular-nums text-fg">{formatearTarifa(Number(fila.rate), locale) ?? '—'}</span>
        ),
      },
      {
        id: 'aplica',
        encabezado: t('columnas.aplicaA'),
        ocultarDebajo: 'md',
        celda: () => <span className="text-fg-secondary">{t('aplicaCompras')}</span>,
      },
      {
        id: 'estado',
        encabezado: t('columnas.estado'),
        celda: (fila) => (
          <div className="flex items-center gap-2">
            <Switch
              checked={fila.is_active}
              disabled={cambiando === fila.id}
              onCheckedChange={() => void alternarActiva(fila)}
              aria-label={t(fila.is_active ? 'desactivar' : 'activar', { nombre: fila.name })}
            />
            <span className="text-sm text-fg-secondary">{t(fila.is_active ? 'activa' : 'inactiva')}</span>
          </div>
        ),
      },
    ],
    // alternarActiva cambia en cada render; lo que decide el contenido es esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale, cambiando, organizationId],
  );

  const acciones = (fila: OrganizationTax): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setFormulario({ abierto: true, retencion: fila }) },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setAEliminar(fila) },
  ];

  return (
    <div className="space-y-4">
      <Tarjeta tono="informacion" icono={Info} titulo={t('aviso.titulo')} descripcion={t('aviso.texto')} />

      <div className="flex justify-end">
        <button
          type="button"
          className={clasesBoton({ variante: 'primario' })}
          onClick={() => setFormulario({ abierto: true, retencion: null })}
          disabled={!organizationId}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t('nueva')}
        </button>
      </div>

      <DataTable
        columnas={columnas}
        filas={retenciones}
        obtenerId={(fila) => fila.id}
        etiqueta={t('tablaEtiqueta')}
        estado={loading ? 'cargando' : error ? 'error' : 'listo'}
        acciones={acciones}
        etiquetaFila={(fila) => fila.name}
        onReintentar={() => void onRefresh()}
        filasEsqueleto={3}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          accion: { etiqueta: t('nueva'), icono: Plus, onClick: () => setFormulario({ abierto: true, retencion: null }) },
        }}
      />

      {formulario.abierto && organizationId && (
        <TaxForm
          open={formulario.abierto}
          onClose={(recargar) => {
            setFormulario({ abierto: false, retencion: null });
            if (recargar) void onRefresh();
          }}
          tax={formulario.retencion}
          editMode={!!formulario.retencion}
          organizationId={organizationId}
          clase="withholding"
        />
      )}

      {aEliminar && (
        <DeleteTaxDialog
          open={!!aEliminar}
          onClose={(eliminado) => {
            setAEliminar(null);
            if (eliminado) void onRefresh();
          }}
          tax={aEliminar}
        />
      )}
    </div>
  );
}
