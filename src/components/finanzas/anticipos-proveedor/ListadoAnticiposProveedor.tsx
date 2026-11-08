'use client';

/**
 * Anticipos a proveedores (Figma `2335:140495`, captura
 * `docs/design/figma/88-terceros-anticipos-proveedores.png`): pagos antes de la
 * factura, en la cuenta de anticipos (1330 o la configurada).
 *
 * Es el espejo del saldo a favor de clientes: los diálogos de registrar,
 * aplicar y devolver son LOS MISMOS (`components/finanzas/saldos-a-favor`) con
 * el adaptador del proveedor; el de registrar lleva el complemento de naturaleza
 * y retenciones (P1 del Contador). Anular pregunta primero si el desembolso
 * ocurrió (P7): solo se anula una salida que nunca ocurrió; si el dinero salió,
 * se registra la devolución o se mantiene el derecho. Sin cuenta de detalle
 * configurada (P6) la pantalla lo muestra como pendiente contable y no deja
 * registrar. Cada acción es una ruta del servidor y una RPC
 * (`/api/anticipos-proveedor/**`). Mientras la migración no esté aplicada, la
 * pantalla dice «pendiente de activar».
 *
 * Ronda 2 del Contador: «Vincular a factura» (antes de causarla, para que la
 * factura no retenga otra vez sobre la base del anticipo), devolución con las
 * retenciones identificadas por impuesto, pendientes contables visibles hasta
 * resolverse y equivalencia aprobada para una cuenta fuera de 133005xx.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Download, FileSpreadsheet, FileText, HandCoins, Link2, Plus, Scale, Undo2, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import {
  accionesAnticipo,
  anticiposConRetencionPendiente,
  filasCsvConciliacion,
  filtrarAnticipos,
  totalesAnticipos,
  type EstadoAnticipo,
  type FilaAnticipoProveedor,
  type RespuestaListadoAnticipos,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import { AplicarSaldoDialog, DevolverSaldoDialog, RegistrarAnticipoDialog } from '@/components/finanzas/saldos-a-favor';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import type { ComplementoDevolver, ComplementoRegistro } from '@/components/finanzas/saldos-a-favor';
import { ADAPTADOR_PROVEEDOR, anticiposProveedorService } from './anticiposProveedorService';
import { AnularAnticipoDialog } from './AnularAnticipoDialog';
import { SeccionRetencionesAnticipo } from './SeccionRetencionesAnticipo';
import { SeccionRetencionesDevolucion } from './SeccionRetencionesDevolucion';
import { VincularFacturaDialog } from './VincularFacturaDialog';
import { PendientesAnticipos } from './PendientesAnticipos';
import { EquivalenciaCuentaDialog } from './EquivalenciaCuentaDialog';
import { ExcesoRetencionDialog } from './ExcesoRetencionDialog';

const NS = 'finanzasTercerosR4.anticipos';
const BADGE: Readonly<Record<EstadoAnticipo, string>> = { disponible: 'activo', aplicado: 'aplicado', anulado: 'anulado' };
const RUTA_CONFIGURACION_CONTABLE = '/app/finanzas/configuracion-contable';

/** Naturaleza y retenciones del anticipo (P1): sección propia del proveedor en el diálogo compartido. */
const COMPLEMENTO_PROVEEDOR: ComplementoRegistro = {
  render: ({ terceroId, monto, tocado, onCambio }) => (
    <SeccionRetencionesAnticipo proveedorId={terceroId} monto={monto} tocado={tocado} onCambio={onCambio} />
  ),
};

/** Fila con la forma que esperan los diálogos compartidos (el tercero va en `cliente`). */
function comoSaldo(f: FilaAnticipoProveedor) {
  return { id: f.id, clienteId: f.proveedorId, cliente: f.proveedor, disponible: f.saldo, sucursalId: f.sucursalId };
}

export function ListadoAnticiposProveedor() {
  const t = useTranslations(NS);
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const fmt = moneda.formatear;
  const { formatDate } = useFormatDate();

  const [datos, setDatos] = useState<RespuestaListadoAnticipos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoAnticipo | 'todos'>('todos');
  const [nuevo, setNuevo] = useState(false);
  const [aplicar, setAplicar] = useState<FilaAnticipoProveedor | null>(null);
  const [devolver, setDevolver] = useState<FilaAnticipoProveedor | null>(null);
  const [anular, setAnular] = useState<FilaAnticipoProveedor | null>(null);
  const [vincular, setVincular] = useState<FilaAnticipoProveedor | null>(null);
  const [equivalencia, setEquivalencia] = useState<string | null>(null);
  const [exceso, setExceso] = useState<FilaAnticipoProveedor | null>(null);
  const [exportandoConciliacion, setExportandoConciliacion] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    anticiposProveedorService
      .listar()
      .then((r) => {
        if (!vigente) return;
        setDatos(r);
        setError(null);
      })
      .catch((e) => {
        if (!vigente) return;
        setError(e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : 'error_desconocido');
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [recarga]);

  const pendiente = datos?.pendiente === true;
  const todas = useMemo(() => datos?.filas ?? [], [datos]);
  const filas = useMemo(() => filtrarAnticipos(todas, { texto, estado: estado === 'todos' ? null : estado }), [todas, texto, estado]);
  const totales = useMemo(() => totalesAnticipos(todas), [todas]);
  const permisosFila = { crear: permisos.crear, anular: permisos.anular };
  const conRetencionPendiente = useMemo(() => anticiposConRetencionPendiente(todas), [todas]);
  const estadoCuenta = datos?.estadoCuenta ?? null;
  // P6: sin cuenta de detalle configurada no se registra (la base también lo bloquea).
  const cuentaPendiente = !!estadoCuenta && estadoCuenta.estado !== 'ok';

  const exportar = () => {
    const csv = aCsv([
      [t('columnas.proveedor'), t('columnas.nit'), t('columnas.fecha'), t('columnas.anticipo'), t('columnas.aplicado'), t('columnas.saldo'), t('columnas.estado'), t('columnas.comprobante')],
      ...filas.map((f) => [
        f.proveedor,
        f.proveedorNit ?? '',
        formatDate(f.fecha),
        formatNumeroMoneda(f.valor, moneda.code),
        formatNumeroMoneda(f.aplicado, moneda.code),
        formatNumeroMoneda(f.saldo, moneda.code),
        t(`estados.${f.estado}`),
        f.recibo ?? '',
      ]),
    ]);
    descargarCsv(t('archivoExportacion'), csv);
  };

  // P6: saldo por anticipo y por proveedor (tabla, libros y auxiliar por NIT).
  const exportarConciliacion = async () => {
    setExportandoConciliacion(true);
    try {
      const c = await anticiposProveedorService.conciliacion();
      const filasCsv = filasCsvConciliacion(
        c,
        {
          anticipos: [
            t('columnas.proveedor'), t('columnas.nit'), t('columnas.comprobante'), t('conciliacion.cuenta'), t('conciliacion.naturaleza'),
            t('columnas.anticipo'), t('columnas.retencion'), t('conciliacion.girado'), t('columnas.aplicado'), t('conciliacion.retencionDescontada'),
            t('conciliacion.devuelto'), t('conciliacion.anulado'), t('columnas.saldo'), t('conciliacion.saldoLibros'), t('conciliacion.cuadra'),
            t('conciliacion.pendientes'), t('conciliacion.cruzado'),
          ],
          proveedores: [t('columnas.proveedor'), t('columnas.nit'), t('conciliacion.anticipos'), t('columnas.saldo'), t('conciliacion.saldoLibros'), t('conciliacion.auxiliarNit')],
        },
        (v) => (v ? t('conciliacion.si') : t('conciliacion.no')),
      );
      descargarCsv(t('conciliacion.archivo'), aCsv(filasCsv));
      toastSuccess(t('conciliacion.exito', { anticipos: c.anticipos.length }));
    } catch (e) {
      toastError(textoErrorSaldo(t, e));
    } finally {
      setExportandoConciliacion(false);
    }
  };

  const accionesDe = (f: FilaAnticipoProveedor): AccionFila[] => {
    const a = accionesAnticipo(f, permisosFila);
    const lista: AccionFila[] = [];
    if (a.aplicar) lista.push({ id: 'aplicar', etiqueta: t('acciones.aplicar'), icono: FileText, onSelect: () => setAplicar(f) });
    // Ronda 2, ítem 5: el anticipo con retención se vincula a la factura en borrador antes de causarla.
    if (a.aplicar && (f.retencion ?? 0) > 0) lista.push({ id: 'vincular', etiqueta: t('acciones.vincular'), icono: Link2, onSelect: () => setVincular(f) });
    if (a.devolver) lista.push({ id: 'devolver', etiqueta: t('acciones.devolver'), icono: Undo2, onSelect: () => setDevolver(f) });
    // Ronda 3, causa (b): retención excesiva o indebida (reintegro del exceso al proveedor).
    if (permisosFila.anular && f.estado !== 'anulado' && (f.retenciones ?? []).some((r) => r.vigente > 0)) {
      lista.push({ id: 'exceso', etiqueta: t('acciones.exceso'), icono: Scale, onSelect: () => setExceso(f) });
    }
    if (a.anular) lista.push({ id: 'anular', etiqueta: t('acciones.anular'), icono: Ban, destructiva: true, separadorAntes: true, onSelect: () => setAnular(f) });
    return lista;
  };

  const badge = (f: FilaAnticipoProveedor) => <StatusBadge estado={BADGE[f.estado]} etiqueta={t(`estados.${f.estado}`)} />;

  const columnas: ColumnaTabla<FilaAnticipoProveedor>[] = [
    {
      id: 'proveedor',
      encabezado: t('columnas.proveedor'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.proveedor || t('sinProveedor')}</span>
          {f.proveedorNit && <span className="truncate text-xs text-fg-muted">{f.proveedorNit}</span>}
        </div>
      ),
    },
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (f) => <span className="whitespace-nowrap tabular-nums">{formatDate(f.fecha)}</span> },
    { id: 'anticipo', encabezado: t('columnas.anticipo'), variante: 'importe', celda: (f) => fmt(f.valor) },
    { id: 'aplicado', encabezado: t('columnas.aplicado'), variante: 'importe', ocultarDebajo: 'lg', celda: (f) => fmt(f.aplicado) },
    {
      id: 'saldo',
      encabezado: t('columnas.saldo'),
      variante: 'importe',
      celda: (f) => <span className={f.estado === 'disponible' ? 'font-semibold text-fg' : 'text-fg-muted'}>{fmt(f.saldo)}</span>,
    },
    {
      id: 'retencion',
      encabezado: t('columnas.retencion'),
      variante: 'importe',
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.retencionPendiente ? <StatusBadge estado="pendiente" etiqueta={t('retenciones.pendienteCorto')} /> : f.retencion ? fmt(f.retencion) : '—',
    },
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'centro', ocultarDebajo: 'xl', celda: badge },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (texto || estado !== 'todos' ? 'sinResultados' : 'vacio') : 'listo';

  const puedeCrear = permisos.crear && !pendiente && !cuentaPendiente;
  const pendientes = datos?.pendientes ?? [];

  // Ronda 3: la devolución va por procedimiento y causa; las retenciones afectadas salen del procedimiento.
  const retencionesDevolver = devolver?.retenciones;
  const saldoDevolver = devolver?.saldo ?? 0;
  const complementoDevolver: ComplementoDevolver = useMemo(
    () => ({
      render: ({ tocado, onCambio, dinero }) => (
        <SeccionRetencionesDevolucion retenciones={retencionesDevolver ?? []} saldo={saldoDevolver} dinero={dinero} tocado={tocado} onCambio={onCambio} />
      ),
    }),
    [retencionesDevolver, saldoDevolver],
  );
  const subtitulo = datos?.cuenta ? t('subtituloCuenta', { cuenta: datos.cuenta }) : t('subtitulo');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={HandCoins}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.cuentasPorPagar'), href: '/app/finanzas/cuentas-por-pagar' }, { etiqueta: t('migas.anticipos') }]}
        acciones={
          <>
            <button type="button" onClick={exportar} disabled={filas.length === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.exportar')}
            </button>
            <button
              type="button"
              onClick={() => void exportarConciliacion()}
              disabled={pendiente || todas.length === 0 || exportandoConciliacion}
              className={clasesBoton({ variante: 'secundario' })}
            >
              <FileSpreadsheet aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.conciliacion')}
            </button>
            {permisos.crear && (
              <button
                type="button"
                onClick={() => setNuevo(true)}
                disabled={pendiente || cuentaPendiente}
                title={cuentaPendiente ? t('cuentaPendiente.titulo') : undefined}
                className={clasesBoton({ variante: 'primario' })}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.nuevo')}
              </button>
            )}
          </>
        }
        movil={{
          subtitulo,
          menu: [
            { id: 'nuevo', etiqueta: t('acciones.nuevo'), icono: Plus, onSelect: () => setNuevo(true), oculta: !puedeCrear },
            { id: 'exportar', etiqueta: t('acciones.exportar'), icono: Download, onSelect: exportar, oculta: filas.length === 0 },
            {
              id: 'conciliacion',
              etiqueta: t('acciones.conciliacion'),
              icono: FileSpreadsheet,
              onSelect: () => void exportarConciliacion(),
              oculta: pendiente || todas.length === 0,
            },
          ],
        }}
      />

      {pendiente && <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />}

      {!pendiente && cuentaPendiente && estadoCuenta && (
        <AvisoTonal
          tono="advertencia"
          rol="status"
          titulo={t('cuentaPendiente.titulo')}
          descripcion={
            estadoCuenta.estado === 'sin_configurar'
              ? estadoCuenta.sugerida
                ? t('cuentaPendiente.sinConfigurarSugerida', { sugerida: estadoCuenta.sugerida })
                : t('cuentaPendiente.sinConfigurar')
              : estadoCuenta.estado === 'fuera_de_133005'
                ? t('cuentaPendiente.fuera133005', { cuenta: estadoCuenta.configurada ?? '—' })
                : t('cuentaPendiente.noDetalle', { cuenta: estadoCuenta.configurada ?? '—' })
          }
          accion={{ etiqueta: t('cuentaPendiente.configurar'), href: RUTA_CONFIGURACION_CONTABLE }}
          acciones={
            estadoCuenta.estado === 'fuera_de_133005' && permisos.aprobar && estadoCuenta.configurada
              ? [{ etiqueta: t('cuentaPendiente.aprobarEquivalencia'), onClick: () => setEquivalencia(estadoCuenta.configurada) }]
              : undefined
          }
        />
      )}

      {!pendiente && conRetencionPendiente > 0 && (
        <AvisoTonal
          tono="advertencia"
          rol="status"
          titulo={t('retenciones.pendienteListadoTitulo', { count: conRetencionPendiente })}
          descripcion={t('retenciones.pendienteListadoDescripcion')}
        />
      )}

      {!pendiente && <PendientesAnticipos pendientes={pendientes} puedeResolver={permisos.aprobar} onResuelto={recargar} />}

      {!pendiente && (
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard etiqueta={t('kpis.saldo')} icono={Wallet} cargando={!datos} valor={fmt(totales.saldo)} detalle={t('kpis.proveedores', { count: totales.proveedores })} />
          <StatCard etiqueta={t('kpis.anticipado')} icono={HandCoins} cargando={!datos} valor={fmt(totales.valor)} />
          <StatCard etiqueta={t('kpis.aplicado')} icono={FileText} cargando={!datos} valor={fmt(totales.aplicado)} />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={texto} onChange={setTexto} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        chips={
          // Fila propia bajo el buscador (en 390 px el control segmentado aplastaba el buscador) y
          // desplazamiento horizontal si las pestañas no caben.
          <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <SegmentedControl
              etiqueta={t('filtros.estado')}
              valor={estado}
              onValorChange={(v) => setEstado(v as EstadoAnticipo | 'todos')}
              className="w-max"
              opciones={[
                { valor: 'todos', etiqueta: t('filtros.todos') },
                { valor: 'disponible', etiqueta: t('estados.disponible') },
                { valor: 'aplicado', etiqueta: t('estados.aplicado') },
                { valor: 'anulado', etiqueta: t('estados.anulado') },
              ]}
            />
          </div>
        }
      />

      {!pendiente && (
        <DataTable
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={filas}
          obtenerId={(f) => f.id}
          estado={estadoTabla}
          etiquetaFila={(f) => t('etiquetaFila', { proveedor: f.proveedor, monto: fmt(f.saldo) })}
          acciones={accionesDe}
          accionesRapidas={(f) =>
            accionesAnticipo(f, permisosFila).aplicar ? (
              <button
                type="button"
                onClick={() => setAplicar(f)}
                aria-label={t('acciones.aplicarDe', { proveedor: f.proveedor })}
                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
              >
                {t('acciones.aplicar')}
              </button>
            ) : null
          }
          tarjetaMovil={(f) => (
            <ListCard
              icono={HandCoins}
              titulo={f.proveedor || t('sinProveedor')}
              subtitulo={[f.recibo, formatDate(f.fecha)].filter(Boolean).join(' · ')}
              valor={
                <span className="flex flex-col items-end">
                  <span>{fmt(f.saldo)}</span>
                  <span className="text-xs font-normal text-fg-muted">{t('deValor', { valor: fmt(f.valor) })}</span>
                </span>
              }
              estado={badge(f)}
              acciones={accionesDe(f)}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: HandCoins,
            accion: puedeCrear ? { etiqueta: t('acciones.nuevo'), onClick: () => setNuevo(true), icono: Plus } : undefined,
          }}
          sinResultados={{ descripcion: t('sinResultados') }}
          error={{ titulo: t('errorCarga'), descripcion: error && error !== 'error_desconocido' ? textoErrorSaldo(t, new ErrorPeticionSaldoFavor(error, 0)) : undefined }}
          sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
          onReintentar={recargar}
          termino={texto}
        />
      )}

      <RegistrarAnticipoDialog
        abierto={nuevo}
        onAbiertoChange={setNuevo}
        adaptador={ADAPTADOR_PROVEEDOR}
        complemento={COMPLEMENTO_PROVEEDOR}
        onRegistrado={recargar}
      />
      <AplicarSaldoDialog
        abierto={!!aplicar}
        onAbiertoChange={(v) => !v && setAplicar(null)}
        saldo={aplicar ? comoSaldo(aplicar) : null}
        adaptador={ADAPTADOR_PROVEEDOR}
        onAplicado={recargar}
      />
      <DevolverSaldoDialog
        abierto={!!devolver}
        onAbiertoChange={(v) => !v && setDevolver(null)}
        saldo={devolver ? comoSaldo(devolver) : null}
        adaptador={ADAPTADOR_PROVEEDOR}
        complemento={complementoDevolver}
        onDevuelto={recargar}
      />
      <VincularFacturaDialog abierto={!!vincular} onAbiertoChange={(v) => !v && setVincular(null)} anticipo={vincular} onVinculado={recargar} />
      <EquivalenciaCuentaDialog cuenta={equivalencia} onCerrar={() => setEquivalencia(null)} onAprobada={recargar} />
      <ExcesoRetencionDialog anticipo={exceso} onCerrar={() => setExceso(null)} onReintegrado={recargar} />
      <AnularAnticipoDialog
        anticipo={anular}
        onAbiertoChange={(v) => !v && setAnular(null)}
        onAnulado={recargar}
        onDevolver={setDevolver}
        puedeDevolver={permisos.anular}
      />
    </div>
  );
}
