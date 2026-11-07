'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { QrCode } from 'lucide-react';
import { ChipsOpcion, DataTable, ListCard, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  ESTADOS_SESION_QR,
  esEstadoQrConocido,
  esOrigenQrConocido,
  estadoTablaQr,
  filtrarSesionesQr,
  nombreProveedorQr,
  type EstadoSesionQr,
  type SesionQr,
} from './metodosPagoLogica';

/**
 * Pestaña «Cobros QR» de Métodos de pago (A11, captura 82-finanzas-r2-11).
 * Antes era la página suelta `/metodos-pago/qr-sessions` (que sigue abriendo
 * esta pestaña). Solo lectura: las sesiones las escribe el servidor.
 * Un error de carga tiene su propio estado; antes se veía como «No hay sesiones QR».
 */
export function CobrosQrPestana({
  organizationId,
  recarga = 0,
  busqueda,
  onLimpiarBusqueda,
}: {
  organizationId: number | undefined;
  /** Cambia para volver a leer (menú ⋯ «Actualizar» de la cabecera). */
  recarga?: number;
  busqueda: string;
  onLimpiarBusqueda: () => void;
}) {
  const t = useTranslations('finanzasCobrosR2');
  const { branchFilter } = useBranch();
  const { formatDateTime } = useFormatDate();
  const monedaOrg = useMonedaOrganizacion();
  const [sesiones, setSesiones] = useState<SesionQr[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoSesionQr | 'todos'>('todos');

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setError(null);
    try {
      let consulta = supabase
        .from('payment_qr_sessions')
        .select('id, branch_id, provider_code, reference, amount, currency, source, source_id, status, paid_at, created_at')
        .eq('organization_id', organizationId);
      if (branchFilter != null) consulta = consulta.eq('branch_id', branchFilter);
      const { data, error: e } = await consulta.order('created_at', { ascending: false }).limit(100);
      if (e) throw e;
      setSesiones((data ?? []) as SesionQr[]);
    } catch (e) {
      console.error('Error al cargar sesiones QR:', e);
      setError(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    } finally {
      setCargando(false);
    }
  }, [organizationId, branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  const visibles = useMemo(
    () => filtrarSesionesQr(sesiones, { estado: estado === 'todos' ? null : estado, texto: busqueda }),
    [sesiones, estado, busqueda],
  );

  const etiquetaEstado = (s: string) => (esEstadoQrConocido(s) ? t(`qr.estados.${s}`) : s);
  const importe = (s: SesionQr) => (s.amount == null ? '—' : crearFormateadorMoneda(s.currency?.trim() || monedaOrg.code)(s.amount));
  const origen = (s: SesionQr) => {
    const base = esOrigenQrConocido(s.source) ? t(`qr.origenes.${s.source}`) : s.source ?? '—';
    return s.source_id && s.source_id.length <= 16 ? `${base} · ${s.source_id}` : base;
  };

  const columnas: ColumnaTabla<SesionQr>[] = [
    { id: 'referencia', encabezado: t('qr.columnas.referencia'), celda: (s) => <span className="font-medium text-fg">{s.reference ?? '—'}</span>, variante: 'mono' },
    { id: 'proveedor', encabezado: t('qr.columnas.proveedor'), celda: (s) => nombreProveedorQr(s.provider_code), ocultarDebajo: 'md' },
    { id: 'monto', encabezado: t('qr.columnas.monto'), celda: importe, variante: 'importe' },
    { id: 'estado', encabezado: t('qr.columnas.estado'), celda: (s) => <StatusBadge estado={s.status} etiqueta={etiquetaEstado(s.status)} tamano="sm" /> },
    { id: 'origen', encabezado: t('qr.columnas.origen'), celda: origen, ocultarDebajo: 'lg' },
    { id: 'creado', encabezado: t('qr.columnas.creado'), celda: (s) => formatDateTime(s.created_at), ocultarDebajo: 'md' },
    { id: 'pagado', encabezado: t('qr.columnas.pagado'), celda: (s) => (s.paid_at ? formatDateTime(s.paid_at) : '—'), ocultarDebajo: 'lg' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ChipsOpcion
        etiqueta={t('qr.filtroEstado')}
        valor={estado}
        onValorChange={setEstado}
        opciones={[
          { valor: 'todos' as const, etiqueta: t('qr.filtros.todos') },
          ...ESTADOS_SESION_QR.map((e) => ({ valor: e, etiqueta: t(`qr.filtros.${e}`) })),
        ]}
      />
      <DataTable
        etiqueta={t('qr.tabla')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(s) => s.id}
        estado={estadoTablaQr({ cargando, error, total: sesiones.length, visibles: visibles.length })}
        etiquetaFila={(s) => s.reference ?? s.id}
        vacio={{ titulo: t('qr.vacio.titulo'), descripcion: t('qr.vacio.descripcion'), icono: QrCode }}
        error={{ titulo: t('qr.error.titulo'), descripcion: t('qr.error.descripcion') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          setEstado('todos');
          onLimpiarBusqueda();
        }}
        termino={busqueda.trim() || undefined}
        tarjetaMovil={(s) => (
          <ListCard
            icono={QrCode}
            titulo={s.reference ?? '—'}
            subtitulo={`${nombreProveedorQr(s.provider_code)} · ${origen(s)}`}
            meta={formatDateTime(s.created_at)}
            valor={importe(s)}
            estado={<StatusBadge estado={s.status} etiqueta={etiquetaEstado(s.status)} tamano="sm" />}
          />
        )}
      />
    </div>
  );
}
