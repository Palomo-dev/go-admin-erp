'use client';

/**
 * Anticipos a proveedores (Figma `2335:140495`, captura
 * `docs/design/figma/88-terceros-anticipos-proveedores.png`): pagos antes de la
 * factura, en la cuenta de anticipos (1330 o la configurada).
 *
 * Es el espejo del saldo a favor de clientes: los diálogos de registrar,
 * aplicar y devolver son LOS MISMOS (`components/finanzas/saldos-a-favor`) con
 * el adaptador del proveedor; anular usa `DialogoMotivo` del kit. Cada acción es
 * una ruta del servidor y una RPC (`/api/anticipos-proveedor/**`). Mientras la
 * migración no esté aplicada, la pantalla dice «pendiente de activar».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Download, FileText, HandCoins, Plus, Undo2, Wallet } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  DialogoMotivo,
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
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import {
  accionesAnticipo,
  filtrarAnticipos,
  totalesAnticipos,
  type EstadoAnticipo,
  type FilaAnticipoProveedor,
  type RespuestaListadoAnticipos,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import { AplicarSaldoDialog, DevolverSaldoDialog, RegistrarAnticipoDialog } from '@/components/finanzas/saldos-a-favor';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { ADAPTADOR_PROVEEDOR, anticiposProveedorService } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';
const BADGE: Readonly<Record<EstadoAnticipo, string>> = { disponible: 'activo', aplicado: 'aplicado', anulado: 'anulado' };

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
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

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

  const confirmarAnular = async (motivo: string) => {
    if (!anular) return;
    setAnulando(true);
    setErrorAnular(null);
    try {
      await anticiposProveedorService.anular(anular.id, motivo);
      toastSuccess(t('anular.exito', { proveedor: anular.proveedor }));
      setAnular(null);
      recargar();
    } catch (e) {
      setErrorAnular(textoErrorSaldo(t, e));
    } finally {
      setAnulando(false);
    }
  };

  const accionesDe = (f: FilaAnticipoProveedor): AccionFila[] => {
    const a = accionesAnticipo(f, permisosFila);
    const lista: AccionFila[] = [];
    if (a.aplicar) lista.push({ id: 'aplicar', etiqueta: t('acciones.aplicar'), icono: FileText, onSelect: () => setAplicar(f) });
    if (a.devolver) lista.push({ id: 'devolver', etiqueta: t('acciones.devolver'), icono: Undo2, onSelect: () => setDevolver(f) });
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
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'centro', ocultarDebajo: 'xl', celda: badge },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (texto || estado !== 'todos' ? 'sinResultados' : 'vacio') : 'listo';

  const puedeCrear = permisos.crear && !pendiente;
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
            {permisos.crear && (
              <button type="button" onClick={() => setNuevo(true)} disabled={pendiente} className={clasesBoton({ variante: 'primario' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.nuevo')}
              </button>
            )}
          </>
        }
        movil={{
          subtitulo,
          accion: puedeCrear ? (
            <button
              type="button"
              onClick={() => setNuevo(true)}
              aria-label={t('acciones.nuevo')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {pendiente && <AvisoTonal tono="advertencia" rol="status" titulo={t('pendiente.titulo')} descripcion={t('pendiente.descripcion')} />}

      {!pendiente && (
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard etiqueta={t('kpis.saldo')} icono={Wallet} cargando={!datos} valor={fmt(totales.saldo)} detalle={t('kpis.proveedores', { count: totales.proveedores })} />
          <StatCard etiqueta={t('kpis.anticipado')} icono={HandCoins} cargando={!datos} valor={fmt(totales.valor)} />
          <StatCard etiqueta={t('kpis.aplicado')} icono={FileText} cargando={!datos} valor={fmt(totales.aplicado)} />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={texto} onChange={setTexto} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <SegmentedControl
            aria-label={t('filtros.estado')}
            valor={estado}
            onValorChange={(v) => setEstado(v as EstadoAnticipo | 'todos')}
            opciones={[
              { valor: 'todos', etiqueta: t('filtros.todos') },
              { valor: 'disponible', etiqueta: t('estados.disponible') },
              { valor: 'aplicado', etiqueta: t('estados.aplicado') },
              { valor: 'anulado', etiqueta: t('estados.anulado') },
            ]}
          />
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

      <RegistrarAnticipoDialog abierto={nuevo} onAbiertoChange={setNuevo} adaptador={ADAPTADOR_PROVEEDOR} onRegistrado={recargar} />
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
        onDevuelto={recargar}
      />
      <DialogoMotivo
        abierto={!!anular}
        onAbiertoChange={(v) => {
          if (anulando) return;
          setErrorAnular(null);
          if (!v) setAnular(null);
        }}
        titulo={t('anular.titulo')}
        descripcion={anular ? t('anular.descripcion', { proveedor: anular.proveedor, monto: fmt(anular.valor), recibo: anular.recibo ?? '—' }) : undefined}
        textoConfirmar={t('anular.confirmar')}
        onConfirmar={confirmarAnular}
        tituloConsecuencias={t('anular.consecuenciasTitulo')}
        consecuencias={[t('anular.consecuencias.pago'), t('anular.consecuencias.saldo'), t('anular.consecuencias.asiento')]}
        motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.duplicado'), t('anular.rapidos.proveedor')]}
        cargando={anulando}
        error={errorAnular}
      />
    </div>
  );
}
