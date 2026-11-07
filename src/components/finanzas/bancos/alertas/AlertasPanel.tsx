'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AvisoTonal, DataTable, KpiStrip, StatCard, StatusBadge, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { FilaAlerta, SeveridadAlerta } from '@/lib/services/integrations/openFinance/alertasBancarias';
import type { AlertasBancarias } from './useAlertasBancarias';
import { RevisarAlertaDialogo } from './RevisarAlertaDialogo';

/**
 * Pestaña «Alertas» de Cuentas de dinero (Figma 82-finanzas-r2-01). Reemplaza
 * la página suelta /finanzas/bancos/anomalias (AnomalyPanel), que no tenía
 * enlace desde Bancos y cuyo «Resolver» no guardaba nada.
 *
 * Lo que hacía AnomalyPanel y dónde quedó:
 * - Actualizar → botón «Actualizar» de la cabecera de Bancos (recarga también las alertas).
 * - 4 cifras (total, alta severidad, duplicados, discrepancias) → 4 cifras de arriba (solo abiertas).
 * - Pestañas Duplicados · Montos · Patrones · Saldos → una sola tabla con columna «Alerta».
 * - Monto, fecha, descripción, ids, esperado vs. actual, saldos → columnas y diálogo «Revisar».
 * - Resolver (texto) → «Revisar» (motivo obligatorio, se guarda con autor y fecha).
 */
export interface AlertasPanelProps {
  alertas: AlertasBancarias;
  /** Tras anular un movimiento duplicado: saldos y cuentas cambian. */
  onMovimientoAnulado?: () => void;
}

const TONO_SEVERIDAD: Record<SeveridadAlerta, 'peligro' | 'advertencia' | 'neutro'> = {
  high: 'peligro',
  medium: 'advertencia',
  low: 'neutro',
};

export function AlertasPanel({ alertas, onMovimientoAnulado }: AlertasPanelProps) {
  const t = useTranslations('finanzasBancosR2');
  const { formatear } = useMonedaOrganizacion();
  const { formatPlain, formatDate } = useFormatDate();
  const { filas, cifras, estado, revisionesDisponibles, recargar, guardarRevision } = alertas;
  const [abierta, setAbierta] = useState<FilaAlerta | null>(null);

  const etiquetaTipo = useCallback((f: FilaAlerta) => t(`alertas.tipos.${f.tipo}`), [t]);
  const etiquetaCuenta = useCallback((f: FilaAlerta) => f.cuentaNombre ?? t('alertas.sinCuenta'), [t]);

  const detalle = useCallback(
    (f: FilaAlerta): string => {
      const fecha = f.fecha ? (f.fecha.tipo === 'dia' ? formatPlain(f.fecha.valor) : formatDate(f.fecha.valor)) : null;
      switch (f.tipo) {
        case 'duplicate':
          return fecha
            ? t('alertas.detalle.duplicate', { conteo: f.datos.conteo ?? f.movimientos.length, fecha })
            : t('alertas.detalle.duplicateSinFecha', { conteo: f.datos.conteo ?? f.movimientos.length });
        case 'unusual_amount':
          return f.datos.veces !== undefined
            ? t('alertas.detalle.unusual_amount', { veces: f.datos.veces })
            : t('alertas.detalle.unusual_amountSinPromedio');
        case 'balance_discrepancy':
          return f.datos.saldoReal !== null && f.datos.saldoReal !== undefined
            ? t('alertas.detalle.balance_discrepancyBanco')
            : t('alertas.detalle.balance_discrepancyMovimientos');
        case 'fragmentation':
          return t('alertas.detalle.fragmentation');
        case 'unusual_time':
          return fecha ? t('alertas.detalle.unusual_time', { fecha }) : t('alertas.tipos.unusual_time');
        case 'weekend_high_amount':
          return fecha ? t('alertas.detalle.weekend_high_amount', { fecha }) : t('alertas.tipos.weekend_high_amount');
        default:
          return '';
      }
    },
    [formatDate, formatPlain, t],
  );

  const estadoBadge = (f: FilaAlerta) =>
    f.revision ? (
      <StatusBadge
        estado="revisada"
        tono="exito"
        tamano="sm"
        etiqueta={
          f.revision.revisadoPorNombre
            ? t('alertas.estado.revisada', { nombre: f.revision.revisadoPorNombre })
            : t('alertas.estado.revisadaSinNombre')
        }
      />
    ) : (
      // El diseño pinta «Abierta» en ámbar (pendiente de revisar), no en verde como un registro abierto.
      <StatusBadge estado="abierta" tono="advertencia" tamano="sm" etiqueta={t('alertas.estado.abierta')} />
    );

  const columnas: ColumnaTabla<FilaAlerta>[] = [
    {
      id: 'alerta',
      encabezado: t('alertas.tabla.alerta'),
      celda: (f) => <span className="font-medium text-fg">{etiquetaTipo(f)}</span>,
    },
    { id: 'cuenta', encabezado: t('alertas.tabla.cuenta'), celda: (f) => etiquetaCuenta(f), ocultarDebajo: 'md' },
    { id: 'detalle', encabezado: t('alertas.tabla.detalle'), celda: (f) => detalle(f), ocultarDebajo: 'lg' },
    {
      id: 'monto',
      encabezado: t('alertas.tabla.monto'),
      variante: 'importe',
      celda: (f) => (
        <span className={f.revision ? 'text-fg-muted' : undefined}>{f.monto === null ? '—' : formatear(f.monto)}</span>
      ),
    },
    {
      id: 'severidad',
      encabezado: t('alertas.tabla.severidad'),
      celda: (f) => (
        <StatusBadge estado={f.severidad} tono={TONO_SEVERIDAD[f.severidad]} tamano="sm" etiqueta={t(`alertas.severidad.${f.severidad}`)} />
      ),
    },
    { id: 'estado', encabezado: t('alertas.tabla.estado'), celda: estadoBadge, ocultarDebajo: 'sm' },
    {
      id: 'accion',
      encabezado: '',
      alinear: 'derecha',
      celda: (f) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAbierta(f);
          }}
          className="rounded text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {f.revision ? t('alertas.tabla.ver') : t('alertas.tabla.revisar')}
        </button>
      ),
    },
  ];

  const estadoTabla: EstadoTabla = estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : 'listo';

  return (
    <div className="flex flex-col gap-4">
      <AvisoTonal tono="informacion" titulo={t('alertas.aviso.titulo')} descripcion={t('alertas.aviso.descripcion')} />

      {estado === 'listo' && !revisionesDisponibles && (
        <AvisoTonal tono="advertencia" titulo={t('alertas.avisoSinHistorial.titulo')} descripcion={t('alertas.avisoSinHistorial.descripcion')} />
      )}

      <KpiStrip columnas={4} etiqueta={t('alertas.cifras.etiqueta')}>
        <StatCard etiqueta={t('alertas.cifras.abiertas')} valor={cifras.abiertas} cargando={estado === 'cargando'} tamano="sm" />
        <StatCard
          etiqueta={t('alertas.cifras.severidadAlta')}
          valor={cifras.severidadAlta}
          tono={cifras.severidadAlta > 0 ? 'peligro' : 'neutro'}
          cargando={estado === 'cargando'}
          tamano="sm"
        />
        <StatCard etiqueta={t('alertas.cifras.posiblesDuplicados')} valor={cifras.posiblesDuplicados} cargando={estado === 'cargando'} tamano="sm" />
        <StatCard etiqueta={t('alertas.cifras.diferenciasSaldo')} valor={cifras.diferenciasSaldo} cargando={estado === 'cargando'} tamano="sm" />
      </KpiStrip>

      <DataTable
        etiqueta={t('alertas.tabla.etiqueta')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.clave}
        estado={estadoTabla}
        onFilaClick={(f) => setAbierta(f)}
        onReintentar={() => void recargar()}
        vacio={{ titulo: t('alertas.tabla.vacioTitulo'), descripcion: t('alertas.tabla.vacioDescripcion'), icono: ShieldCheck }}
        error={{ titulo: t('alertas.tabla.errorTitulo'), descripcion: t('alertas.tabla.errorDescripcion') }}
        tarjetaMovil={(f) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-fg">{etiquetaTipo(f)}</span>
              <span className="tabular-nums text-fg">{f.monto === null ? '—' : formatear(f.monto)}</span>
            </div>
            <span className="text-sm text-fg-secondary">
              {etiquetaCuenta(f)} · {detalle(f)}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge estado={f.severidad} tono={TONO_SEVERIDAD[f.severidad]} tamano="sm" etiqueta={t(`alertas.severidad.${f.severidad}`)} />
              {estadoBadge(f)}
            </div>
          </div>
        )}
      />

      <RevisarAlertaDialogo
        fila={abierta}
        onCerrar={() => setAbierta(null)}
        revisionesDisponibles={revisionesDisponibles}
        etiquetaTipo={etiquetaTipo}
        etiquetaCuenta={etiquetaCuenta}
        guardar={async (fila, peticion) => {
          const r = await guardarRevision(fila, peticion);
          if (r.ok) {
            toast.success(peticion.resultado === 'duplicado_anulado' ? t('anular.anulado') : t('revisar.guardada'));
          }
          return r;
        }}
        onMovimientoAnulado={() => {
          onMovimientoAnulado?.();
        }}
      />
    </div>
  );
}
