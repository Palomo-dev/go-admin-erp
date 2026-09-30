"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable, Tarjeta, clasesBoton, formatearTarifa, type ColumnaTabla, type AccionFila } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { baseMinimaEnMoneda } from '@/lib/services/compras/logica';
import {
  cargarPlantillaRetenciones,
  leerConfiguracionRetenciones,
  monedaDePais,
  type ConfiguracionRetenciones,
  type RetencionConfigurada,
} from '@/lib/services/compras/retenciones';
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
 * Pestaña «Retenciones» de Finanzas › Impuestos (Figma «config-retenciones»,
 * D4 fase 3 del plan de compras).
 *
 * Las retenciones (kind = 'withholding') no son impuestos de venta: no se
 * ofrecen al configurar el producto, ni en el POS, ni en facturas o
 * cotizaciones, y nunca se suman al precio. Aquí se consultan, se activan y se
 * editan, con su cuenta contable (la misma que usa el asiento de la compra) y
 * su base mínima en UVT. Tipo y cuenta los resuelve la base
 * (`fn_retenciones_configuracion`); la escritura va por RPC con permiso.
 */
export default function RetencionesTable({ retenciones, loading, error, organizationId, onRefresh }: RetencionesTableProps) {
  const t = useTranslations('impuestosRetenciones');
  const locale = useLocale();
  const { toast } = useToast();
  const moneda = useMonedaOrganizacion();
  const [formulario, setFormulario] = useState<{ abierto: boolean; retencion: OrganizationTax | null }>({
    abierto: false,
    retencion: null,
  });
  const [aEliminar, setAEliminar] = useState<OrganizationTax | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfiguracionRetenciones | null>(null);
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);

  const leerConfig = useCallback(async () => {
    if (!organizationId) return;
    try {
      setConfig(await leerConfiguracionRetenciones(organizationId));
    } catch (err) {
      console.error('Error al leer la configuración de retenciones:', err);
      setConfig(null);
      toast({ title: t('toast.errorTitulo'), description: t('toast.errorConfiguracion'), variant: 'destructive' });
    }
  }, [organizationId, t, toast]);

  useEffect(() => {
    void leerConfig();
  }, [leerConfig]);

  const recargar = useCallback(async () => {
    await Promise.all([onRefresh(), leerConfig()]);
  }, [onRefresh, leerConfig]);

  const porId = useMemo(() => new Map((config?.retenciones ?? []).map((r) => [r.id, r])), [config]);

  // El equivalente de la UVT va en la moneda de su país (`countries`), no en la de la organización.
  const [monedaUvt, setMonedaUvt] = useState<string | null>(null);
  useEffect(() => {
    if (!config?.pais) return;
    let vigente = true;
    monedaDePais(config.pais)
      .then((m) => vigente && setMonedaUvt(m))
      .catch((err) => console.error('Error al leer la moneda del país de la UVT:', err));
    return () => {
      vigente = false;
    };
  }, [config?.pais]);
  const formatearUvt = useMemo(
    () => (monedaUvt ? crearFormateadorMoneda(monedaUvt, { decimals: 0 }) : moneda.formatear),
    [monedaUvt, moneda.formatear],
  );

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
      await recargar();
      toast({ description: t(fila.is_active ? 'toast.desactivada' : 'toast.activada', { nombre: fila.name }) });
    } catch (err) {
      console.error('Error al cambiar el estado de la retención:', err);
      toast({ title: t('toast.errorTitulo'), description: t('toast.errorEstado'), variant: 'destructive' });
    } finally {
      setCambiando(null);
    }
  };

  const cargarPlantilla = async () => {
    if (!organizationId) return;
    setCargandoPlantilla(true);
    try {
      const creadas = await cargarPlantillaRetenciones(organizationId);
      await recargar();
      toast({ description: t('plantilla.cargada', { creadas, pais: config?.paisNombre ?? config?.pais ?? '' }) });
    } catch (err) {
      console.error('Error al cargar la plantilla de retenciones:', err);
      toast({ title: t('toast.errorTitulo'), description: t('plantilla.error'), variant: 'destructive' });
    } finally {
      setCargandoPlantilla(false);
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
            {t(`tipos.${porId.get(fila.id)?.clase ?? tipoRetencion(null, fila.name)}`)}
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
        id: 'baseMinima',
        encabezado: t('columnas.baseMinima'),
        alinear: 'derecha',
        ocultarDebajo: 'md',
        celda: (fila) => <CeldaBaseMinima retencion={porId.get(fila.id)} config={config} formatear={formatearUvt} />,
      },
      {
        id: 'aplica',
        encabezado: t('columnas.aplicaA'),
        ocultarDebajo: 'lg',
        celda: () => <span className="text-fg-secondary">{t('aplicaCompras')}</span>,
      },
      {
        id: 'cuenta',
        encabezado: t('columnas.cuenta'),
        ocultarDebajo: 'md',
        celda: (fila) => <CeldaCuenta retencion={porId.get(fila.id)} />,
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
    [t, locale, cambiando, organizationId, porId, config, formatearUvt],
  );

  const acciones = (fila: OrganizationTax): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setFormulario({ abierto: true, retencion: fila }) },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setAEliminar(fila) },
  ];

  const pais = config?.paisNombre ?? config?.pais ?? '';
  const sinPendientes = !!config && config.plantillasPendientes === 0;

  return (
    <div className="space-y-4">
      <Tarjeta tono="informacion" icono={Info} titulo={t('aviso.titulo')} descripcion={t('aviso.texto')} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-secondary">
          {config?.uvt
            ? t('uvtVigente', { anio: config.uvt.anio, valor: formatearUvt(config.uvt.valor), norma: config.uvt.norma ?? '' })
            : config
              ? t('uvtSinDato')
              : null}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {config && pais && (
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario' })}
              onClick={() => void cargarPlantilla()}
              disabled={!organizationId || cargandoPlantilla || sinPendientes}
              title={sinPendientes ? t('plantilla.alDia', { pais }) : undefined}
            >
              <Download className="size-4" aria-hidden="true" />
              {t('plantilla.cargar', { pais })}
            </button>
          )}
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
      </div>

      <DataTable
        columnas={columnas}
        filas={retenciones}
        obtenerId={(fila) => fila.id}
        etiqueta={t('tablaEtiqueta')}
        estado={loading ? 'cargando' : error ? 'error' : 'listo'}
        acciones={acciones}
        etiquetaFila={(fila) => fila.name}
        onReintentar={() => void recargar()}
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
          onClose={(recargarDatos) => {
            setFormulario({ abierto: false, retencion: null });
            if (recargarDatos) void recargar();
          }}
          tax={formulario.retencion}
          editMode={!!formulario.retencion}
          organizationId={organizationId}
          clase="withholding"
          retencion={formulario.retencion ? porId.get(formulario.retencion.id) ?? null : null}
          uvt={config?.uvt ?? null}
          formatearUvt={formatearUvt}
        />
      )}

      {aEliminar && (
        <DeleteTaxDialog
          open={!!aEliminar}
          onClose={(eliminado) => {
            setAEliminar(null);
            if (eliminado) void recargar();
          }}
          tax={aEliminar}
        />
      )}
    </div>
  );
}

function CeldaBaseMinima({
  retencion,
  config,
  formatear,
}: {
  retencion: RetencionConfigurada | undefined;
  config: ConfiguracionRetenciones | null;
  formatear: (valor: number) => string;
}) {
  const t = useTranslations('impuestosRetenciones');
  const locale = useLocale();
  if (!retencion) return <span className="text-fg-muted">—</span>;
  if (retencion.baseMinimaUvt === null) return <span className="text-fg-secondary">{t('baseMinima.sin')}</span>;
  const enMoneda = baseMinimaEnMoneda(retencion.baseMinimaUvt, config?.uvt?.valor ?? null);
  return (
    <div className="text-right">
      <p className="font-medium tabular-nums text-fg">
        {t('baseMinima.uvt', { uvt: retencion.baseMinimaUvt.toLocaleString(locale) })}
      </p>
      {enMoneda !== null && config?.uvt && (
        <p className="text-xs tabular-nums text-fg-secondary">
          {t('baseMinima.equivalente', { valor: formatear(enMoneda), anio: config.uvt.anio })}
        </p>
      )}
    </div>
  );
}

function CeldaCuenta({ retencion }: { retencion: RetencionConfigurada | undefined }) {
  const t = useTranslations('impuestosRetenciones');
  if (!retencion) return <span className="text-fg-muted">—</span>;
  return (
    <div className="min-w-0">
      <p className="truncate text-fg">
        <span className="font-medium tabular-nums">{retencion.cuenta}</span>
        {retencion.cuentaNombre && <span className="text-fg-secondary"> · {retencion.cuentaNombre}</span>}
      </p>
      {!retencion.cuentaPropia && <p className="text-xs text-fg-secondary">{t('cuenta.automatica')}</p>}
    </div>
  );
}
