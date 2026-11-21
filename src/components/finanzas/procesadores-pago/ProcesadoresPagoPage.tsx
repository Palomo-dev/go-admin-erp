'use client';

/**
 * Procesadores de pago — tablero de saldos, abonos y alertas (Figma «07 Finanzas»
 * 2704:150136 escritorio y 2706:150980 móvil; aprobado por el dueño el 2026-11-21).
 *
 * Por procesador: lo cobrado y lo abonado del mes, el saldo pendiente y el cobro
 * más viejo sin abonar (días hábiles, sin festivos). Alerta a los 5 días hábiles;
 * si el procesador retiene saldo a propósito, muestra «Saldo retenido en el
 * procesador» y alerta a los 30 días sin ningún retiro al banco. Todo lo calcula
 * `fn_procesadores_pago_saldos`; esta pantalla solo lo muestra.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle, ChevronLeft, ChevronRight, CreditCard, RefreshCw, Settings2, Undo2, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  DialogoMotivo,
  ListCard,
  PageHeader,
  StatCard,
  TabBar,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import {
  moverMes,
  ordenarSaldos,
  totalesSaldos,
  type AbonoProcesador,
  type CodigoProcesador,
  type RespuestaProcesadores,
  type SaldoProcesador,
} from '@/lib/finanzas/procesadoresPago/procesadoresLogica';
import { AbonoProcesadorDialog } from './AbonoProcesadorDialog';
import { DatosProcesadoresDialog } from './DatosProcesadoresDialog';

const NS = 'finanzasProcesadores';
export const RUTA_API_PROCESADORES = '/api/finanzas/procesadores-pago';
type Pestana = 'saldos' | 'abonos' | 'alertas';
type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(org > 0 ? { 'x-organization-id': String(org) } : {}) };
}

export function ProcesadoresPagoPage() {
  const t = useTranslations(NS);
  const permisos = usePermisosFinanzas();
  const fmt = useMonedaOrganizacion().formatear;
  const { getToday } = useFormatDate();
  const hoy = getToday();

  const [mes, setMes] = useState<string | null>(null);
  const [datos, setDatos] = useState<RespuestaProcesadores | null>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [recarga, setRecarga] = useState(0);
  const [pestana, setPestana] = useState<Pestana>('saldos');
  const [abono, setAbono] = useState<{ procesador: CodigoProcesador | null } | null>(null);
  const [datosAbiertos, setDatosAbiertos] = useState(false);
  const [anular, setAnular] = useState<AbonoProcesador | null>(null);
  const [anulando, setAnulando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    const q = mes ? `?mes=${mes.slice(0, 7)}` : '';
    fetch(`${RUTA_API_PROCESADORES}${q}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() })
      .then(async (r) => {
        if (!vigente) return;
        if (r.status === 403) return setEstado('sinPermiso');
        if (!r.ok) return setEstado('error');
        setDatos((await r.json()) as RespuestaProcesadores);
        setEstado('listo');
      })
      .catch(() => vigente && setEstado('error'));
    return () => {
      vigente = false;
    };
  }, [mes, recarga]);

  const mesActual = datos?.mes ?? mes ?? `${hoy.slice(0, 7)}-01`;
  const nombreMes = formatPlainDate(mesActual, { month: 'long', year: 'numeric' });
  const saldos = useMemo(() => ordenarSaldos(datos?.saldos ?? []), [datos]);
  const alertas = saldos.filter((s) => s.alerta);
  const tot = totalesSaldos(saldos);
  const esMesActual = mesActual.slice(0, 7) >= hoy.slice(0, 7);

  const fecha = (d: string | null) => (d ? formatPlainDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  const insignia = (s: SaldoProcesador) => {
    if (s.estado === 'alerta') {
      const clave = s.motivo_alerta === 'saldo_retenido_sin_retiro' ? 'sinRetiro' : s.motivo_alerta === 'saldo_negativo' ? 'negativo' : 'sinAbono';
      return (
        <Badge tono="peligro" apariencia="suave" tamano="sm">
          {t(`estado.${clave}`)}
        </Badge>
      );
    }
    if (!s.nit && s.saldo > 0)
      return (
        <Badge tono="advertencia" apariencia="suave" tamano="sm">
          {t('estado.faltaNit')}
        </Badge>
      );
    if (s.estado === 'saldo_retenido')
      return (
        <Badge tono="informacion" apariencia="suave" tamano="sm">
          {t('estado.retenido')}
        </Badge>
      );
    return (
      <Badge tono="exito" apariencia="suave" tamano="sm">
        {t('estado.alDia')}
      </Badge>
    );
  };

  const pendienteDesde = (s: SaldoProcesador) => {
    if (s.retiene_saldo) {
      const d = s.ultimo_abono ?? s.cobro_pendiente_desde;
      return { fecha: fecha(d), detalle: s.dias_sin_retiro === null ? '' : t('diasSinRetiro', { count: s.dias_sin_retiro }) };
    }
    return {
      fecha: fecha(s.cobro_pendiente_desde),
      detalle: s.dias_habiles_sin_abono === null ? '' : t('diasHabiles', { count: s.dias_habiles_sin_abono }),
    };
  };

  const botonAbonar = (s: SaldoProcesador) =>
    permisos.crear ? (
      !s.nit ? (
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setDatosAbiertos(true)}>
          {t('acciones.completar')}
        </button>
      ) : (
        <button
          type="button"
          className={clasesBoton({ variante: s.alerta ? 'primario' : 'secundario', tamano: 'sm' })}
          onClick={() => setAbono({ procesador: s.procesador })}
          disabled={s.saldo <= 0}
        >
          {t('acciones.abonar')}
        </button>
      )
    ) : null;

  const columnasSaldos: ColumnaTabla<SaldoProcesador>[] = [
    {
      id: 'procesador',
      encabezado: t('columnas.procesador'),
      celda: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{s.nombre}</span>
          <span className="truncate text-xs text-fg-muted">{[s.nit ? t('nitCorto', { nit: s.nit }) : t('sinNit'), s.cuenta].join(' · ')}</span>
        </div>
      ),
    },
    {
      id: 'origen',
      encabezado: t('columnas.origen'),
      ocultarDebajo: 'lg',
      celda: (s) => (
        <Badge tono={s.origen === 'exterior' ? 'informacion' : 'neutro'} apariencia="suave" tamano="sm">
          {t(`origen.${s.origen}`)}
        </Badge>
      ),
    },
    { id: 'cobrado', encabezado: t('columnas.cobrado'), variante: 'importe', celda: (s) => fmt(s.cobrado_mes) },
    { id: 'abonado', encabezado: t('columnas.abonado'), variante: 'importe', celda: (s) => <span className={s.abonado_mes === 0 ? 'text-fg-muted' : undefined}>{fmt(s.abonado_mes)}</span> },
    {
      id: 'saldo',
      encabezado: t('columnas.saldo'),
      variante: 'importe',
      celda: (s) => <span className={`font-semibold ${s.alerta ? 'text-danger-text' : 'text-fg'}`}>{fmt(s.saldo)}</span>,
    },
    {
      id: 'pendiente',
      encabezado: t('columnas.pendienteDesde'),
      ocultarDebajo: 'md',
      celda: (s) => {
        const p = pendienteDesde(s);
        return (
          <div className="flex flex-col whitespace-nowrap">
            <span className="text-fg">{p.fecha}</span>
            {p.detalle && <span className={`text-xs ${s.alerta ? 'text-danger-text' : 'text-fg-secondary'}`}>{p.detalle}</span>}
          </div>
        );
      },
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: insignia },
  ];

  const columnasAbonos: ColumnaTabla<AbonoProcesador>[] = [
    { id: 'fecha', encabezado: t('abonos.columnas.fecha'), celda: (a) => <span className="whitespace-nowrap">{fecha(a.fecha)}</span> },
    {
      id: 'procesador',
      encabezado: t('columnas.procesador'),
      celda: (a) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{datos?.procesadores.find((p) => p.codigo === a.procesador)?.etiqueta ?? a.procesador}</span>
          {a.referencia && <span className="truncate text-xs text-fg-muted">{a.referencia}</span>}
        </div>
      ),
    },
    { id: 'bruto', encabezado: t('abonos.columnas.bruto'), variante: 'importe', celda: (a) => fmt(a.bruto) },
    { id: 'descuentos', encabezado: t('abonos.columnas.descuentos'), variante: 'importe', ocultarDebajo: 'md', celda: (a) => fmt(a.comision + a.ivaComision + a.retenciones) },
    { id: 'neto', encabezado: t('abonos.columnas.neto'), variante: 'importe', celda: (a) => <span className="font-semibold">{fmt(a.neto)}</span> },
    { id: 'factura', encabezado: t('abonos.columnas.factura'), ocultarDebajo: 'lg', celda: (a) => a.factura ?? '—' },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (a) => (
        <Badge tono={a.estado === 'anulado' ? 'peligro' : 'exito'} apariencia="suave" tamano="sm">
          {t(`abonos.estado.${a.estado}`)}
        </Badge>
      ),
    },
  ];

  const accionesAbono = (a: AbonoProcesador): AccionFila[] =>
    permisos.anular && a.estado === 'registrado' ? [{ id: 'anular', etiqueta: t('abonos.anular'), icono: Undo2, destructiva: true, onSelect: () => setAnular(a) }] : [];

  const confirmarAnular = async (motivo: string) => {
    if (!anular) return;
    setAnulando(true);
    try {
      const r = await fetch(`${RUTA_API_PROCESADORES}/abonos/${anular.id}/anular`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: cabeceras(true),
        body: JSON.stringify({ motivo }),
      });
      if (!r.ok) {
        const { codigo } = (await r.json().catch(() => ({}))) as { codigo?: string };
        toastError(t(`errores.${codigo && t.has(`errores.${codigo}`) ? codigo : 'DESCONOCIDO'}`));
        return;
      }
      toastSuccess(t('abonos.anulado'));
      setAnular(null);
      recargar();
    } finally {
      setAnulando(false);
    }
  };

  const estadoTabla = (n: number) =>
    estado === 'sinPermiso' ? 'sinPermiso' : estado === 'error' ? 'error' : estado === 'cargando' && !datos ? 'cargando' : n === 0 ? 'vacio' : 'listo';

  const tarjetaSaldo = (s: SaldoProcesador) => {
    const p = pendienteDesde(s);
    return (
      <ListCard
        icono={CreditCard}
        titulo={s.nombre}
        insignia={
          <Badge tono={s.origen === 'exterior' ? 'informacion' : 'neutro'} apariencia="suave" tamano="sm">
            {t(`origen.${s.origen}`)}
          </Badge>
        }
        subtitulo={p.detalle ? `${t('columnas.pendienteDesde')}: ${p.fecha} · ${p.detalle}` : undefined}
        valor={<span className={s.alerta ? 'text-danger-text' : undefined}>{fmt(s.saldo)}</span>}
        estado={insignia(s)}
        onClick={permisos.crear && s.nit && s.saldo > 0 ? () => setAbono({ procesador: s.procesador }) : undefined}
      />
    );
  };

  const tablaSaldos = (filas: SaldoProcesador[], vacio: { titulo: string; descripcion: string }) => (
    <DataTable
      etiqueta={t('titulo')}
      columnas={columnasSaldos}
      filas={filas}
      obtenerId={(s) => s.procesador}
      estado={estadoTabla(filas.length)}
      etiquetaFila={(s) => t('etiquetaFila', { procesador: s.nombre, saldo: fmt(s.saldo) })}
      tonoFila={(s) => (s.alerta ? 'peligro' : undefined)}
      accionesRapidas={botonAbonar}
      tarjetaMovil={tarjetaSaldo}
      vacio={vacio}
      error={{ titulo: t('errorCarga') }}
      sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
      onReintentar={recargar}
      pie={
        filas.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold text-fg">{t('total')}</span>
            <span className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums text-fg-secondary">
              <span>
                {t('columnas.cobrado')}: <strong className="text-fg">{fmt(tot.cobrado)}</strong>
              </span>
              <span>
                {t('columnas.abonado')}: <strong className="text-fg">{fmt(tot.abonado)}</strong>
              </span>
              <span>
                {t('columnas.saldo')}: <strong className="text-fg">{fmt(tot.saldo)}</strong>
              </span>
            </span>
          </div>
        ) : undefined
      }
    />
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo', { mes: nombreMes })}
        icono={Wallet}
        cargando={estado === 'cargando'}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.tesoreria') }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={recargar} aria-label={t('acciones.actualizar')} title={t('acciones.actualizar')}>
              <RefreshCw aria-hidden="true" className={`size-4 ${estado === 'cargando' ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </button>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setDatosAbiertos(true)} disabled={!datos}>
              <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.datos')}
            </button>
            {permisos.crear && (
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setAbono({ procesador: null })} disabled={!datos}>
                <ArrowDownCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.registrarAbono')}
              </button>
            )}
          </>
        }
        movil={{ accionesEnFila: true, subtitulo: t('subtitulo', { mes: nombreMes }) }}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <TabBar
          id="procesadores-pago"
          etiqueta={t('titulo')}
          valor={pestana}
          onValorChange={setPestana}
          pestanas={[
            { valor: 'saldos', etiqueta: t('pestanas.saldos'), contador: saldos.length },
            { valor: 'abonos', etiqueta: t('pestanas.abonos') },
            { valor: 'alertas', etiqueta: t('pestanas.alertas'), contador: alertas.length },
          ]}
        />
        <div className="flex items-center gap-1" role="group" aria-label={t('mes.etiqueta')}>
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-8 px-0' })} onClick={() => setMes(moverMes(mesActual, -1))} aria-label={t('mes.anterior')}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize text-fg">{nombreMes}</span>
          <button
            type="button"
            className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-8 px-0' })}
            onClick={() => setMes(moverMes(mesActual, 1))}
            disabled={esMesActual}
            aria-label={t('mes.siguiente')}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard etiqueta={t('kpi.porCobrar')} valor={fmt(tot.saldo)} detalle={t('kpi.porCobrarDetalle')} cargando={!datos && estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.cobrado', { mes: nombreMes })} valor={fmt(tot.cobrado)} detalle={t('kpi.cobradoDetalle')} cargando={!datos && estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.abonado', { mes: nombreMes })} valor={fmt(tot.abonado)} detalle={t('kpi.abonadoDetalle')} cargando={!datos && estado === 'cargando'} />
        <StatCard
          etiqueta={t('kpi.alertas')}
          valor={String(tot.alertas)}
          detalle={alertas.length > 0 ? alertas.map((s) => s.nombre).join(' · ') : t('kpi.sinAlertas')}
          tono={alertas.length > 0 ? 'peligro' : 'neutro'}
          cargando={!datos && estado === 'cargando'}
        />
      </div>

      {alertas.length > 0 && pestana !== 'abonos' && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('aviso.titulo', { count: alertas.length })}
          descripcion={alertas
            .map((s) =>
              s.motivo_alerta === 'saldo_retenido_sin_retiro'
                ? t('aviso.sinRetiro', { procesador: s.nombre, saldo: fmt(s.saldo), dias: s.dias_sin_retiro ?? 0 })
                : s.motivo_alerta === 'saldo_negativo'
                  ? t('aviso.negativo', { procesador: s.nombre, saldo: fmt(s.saldo) })
                  : t('aviso.sinAbono', { procesador: s.nombre, dias: s.dias_habiles_sin_abono ?? 0, fecha: fecha(s.cobro_pendiente_desde), saldo: fmt(s.saldo) }),
            )
            .join(' ')}
          accion={pestana === 'saldos' ? { etiqueta: t('aviso.verAlertas'), onClick: () => setPestana('alertas') } : undefined}
        />
      )}

      {pestana === 'saldos' && tablaSaldos(saldos, { titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') })}
      {pestana === 'alertas' && tablaSaldos(alertas, { titulo: t('vacio.sinAlertasTitulo'), descripcion: t('vacio.sinAlertasDescripcion') })}
      {pestana === 'abonos' && (
        <DataTable
          etiqueta={t('pestanas.abonos')}
          columnas={columnasAbonos}
          filas={datos?.abonos ?? []}
          obtenerId={(a) => a.id}
          estado={estadoTabla(datos?.abonos.length ?? 0)}
          etiquetaFila={(a) => t('abonos.etiquetaFila', { fecha: fecha(a.fecha), neto: fmt(a.neto) })}
          tonoFila={(a) => (a.estado === 'anulado' ? 'peligro' : undefined)}
          acciones={accionesAbono}
          tarjetaMovil={(a) => (
            <ListCard
              icono={ArrowDownCircle}
              titulo={datos?.procesadores.find((p) => p.codigo === a.procesador)?.etiqueta ?? a.procesador}
              subtitulo={fecha(a.fecha)}
              valor={fmt(a.neto)}
              estado={
                <Badge tono={a.estado === 'anulado' ? 'peligro' : 'exito'} apariencia="suave" tamano="sm">
                  {t(`abonos.estado.${a.estado}`)}
                </Badge>
              }
              acciones={accionesAbono(a)}
            />
          )}
          vacio={{ titulo: t('abonos.vacioTitulo'), descripcion: t('abonos.vacioDescripcion') }}
          error={{ titulo: t('errorCarga') }}
          sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
          onReintentar={recargar}
        />
      )}

      <p className="text-xs text-fg-muted">{t('pie')}</p>

      {datos && abono && (
        <AbonoProcesadorDialog
          abierto={!!abono}
          onAbiertoChange={(v) => !v && setAbono(null)}
          datos={datos}
          hoy={hoy}
          procesadorInicial={abono.procesador}
          onRegistrado={recargar}
        />
      )}
      {datos && (
        <DatosProcesadoresDialog
          abierto={datosAbiertos}
          onAbiertoChange={setDatosAbiertos}
          procesadores={datos.procesadores}
          puedeEditar={permisos.crear}
          onGuardado={recargar}
        />
      )}
      <DialogoMotivo
        abierto={!!anular}
        onAbiertoChange={(v) => !v && setAnular(null)}
        titulo={t('abonos.anularTitulo')}
        descripcion={anular ? t('abonos.anularDescripcion', { neto: fmt(anular.neto), fecha: fecha(anular.fecha) }) : undefined}
        textoConfirmar={t('abonos.anular')}
        onConfirmar={confirmarAnular}
        destructiva
        cargando={anulando}
        minimo={3}
      />
    </div>
  );
}
