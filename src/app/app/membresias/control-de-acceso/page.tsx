'use client';

/**
 * Membresías › Control de acceso (antes /app/gym/dispositivos, fuera del
 * menú): torniquetes, kioscos, tabletas, escáneres y cerraduras por sede. El
 * kiosco se abre en /membresias-kiosco/[deviceId].
 *
 * Permisos: ver = memberships.view; crear, editar, activar y eliminar =
 * memberships.devices.manage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Cpu, ExternalLink, Pencil, Plus, Power, QrCode, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  Dialogo,
  EmptyState,
  FilterChips,
  FilterPanel,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { usePermisosMembresias } from '@/lib/services/membresias/clienteMembresias';
import { GymDevicesService, type CreateDeviceData, type GymAccessDevice } from '@/lib/services/gymDevicesService';
import { DialogoDispositivo } from '@/components/membresias/operacion/acceso/DialogoDispositivo';
import { FiltroSelect } from '@/components/membresias/operacion/FiltroSelect';
import { TIPOS_DISPOSITIVO, coincide, contenidoQrDispositivo, type TipoDispositivo } from '@/components/membresias/operacion/logica';
import { useFechasOrg } from '@/components/membresias/operacion/useFechasOrg';

const TODOS = 'todos';
type FiltroEstado = typeof TODOS | 'activos' | 'inactivos';

export default function ControlDeAccesoPage() {
  const t = useTranslations('membresias.acceso');
  const tm = useTranslations('membresias');
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const { branches, branchFilter, selectedBranchId } = useBranch();
  const permisos = usePermisosMembresias();
  const fechas = useFechasOrg();
  const entero = useFormatoEntero();
  const servicio = useMemo(() => (orgId ? new GymDevicesService(orgId) : null), [orgId]);

  const [dispositivos, setDispositivos] = useState<GymAccessDevice[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<TipoDispositivo | typeof TODOS>(TODOS);
  const [estado, setEstado] = useState<FiltroEstado>(TODOS);

  const [editar, setEditar] = useState<{ dispositivo: GymAccessDevice | null } | null>(null);
  const [eliminar, setEliminar] = useState<GymAccessDevice | null>(null);
  const [qr, setQr] = useState<GymAccessDevice | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    if (!servicio || !permisos.ver) return;
    setCargando(true);
    setError(null);
    try {
      setDispositivos(await servicio.getDevices(branchFilter ?? undefined));
    } catch {
      setError(t('errores.cargar'));
    } finally {
      setCargando(false);
    }
  }, [servicio, permisos.ver, branchFilter, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sucursales = useMemo(
    () => branches.filter((b): b is typeof b & { id: number } => typeof b.id === 'number').map((b) => ({ id: b.id, nombre: b.name })),
    [branches],
  );

  const visibles = useMemo(
    () =>
      dispositivos.filter((d) => {
        if (tipo !== TODOS && d.device_type !== tipo) return false;
        if (estado === 'activos' && !d.is_active) return false;
        if (estado === 'inactivos' && d.is_active) return false;
        return !busqueda || coincide(d.device_name, busqueda) || coincide(d.serial_number, busqueda) || coincide(d.location_description, busqueda);
      }),
    [dispositivos, tipo, estado, busqueda],
  );

  const kpi = useMemo(
    () => ({ total: dispositivos.length, activos: dispositivos.filter((d) => d.is_active).length }),
    [dispositivos],
  );

  const gestiona = permisos.dispositivos;

  const correr = async (accion: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await accion();
      toast.success(ok);
      await cargar();
      return true;
    } catch {
      toast.error(t('errores.guardar'));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async (datos: CreateDeviceData) => {
    if (!servicio) return;
    const id = editar?.dispositivo?.id;
    const ok = await correr(
      () => (id ? servicio.updateDevice(id, datos) : servicio.createDevice(datos)),
      id ? t('toasts.actualizado') : t('toasts.creado'),
    );
    if (!ok) throw new Error('guardar');
  };

  const verQr = async (d: GymAccessDevice) => {
    if (!servicio) return;
    const vencido = !d.current_qr_token || !d.qr_token_expires_at || new Date(d.qr_token_expires_at).getTime() < Date.now();
    if (vencido && gestiona) {
      const nuevo = await servicio.generateQRToken(d.id);
      setQr(nuevo ? { ...d, current_qr_token: nuevo.token, qr_token_expires_at: nuevo.expires_at } : d);
      return;
    }
    setQr(d);
  };

  const abrirKiosco = (d: GymAccessDevice) => window.open(`/membresias-kiosco/${d.id}`, '_blank', 'noopener');

  const accionesDe = (d: GymAccessDevice): AccionFila[] => [
    { id: 'qr', etiqueta: t('acciones.qr'), icono: QrCode, onSelect: () => void verQr(d), oculta: !d.configuration?.qr_enabled },
    { id: 'kiosco', etiqueta: t('acciones.kiosco'), icono: ExternalLink, onSelect: () => abrirKiosco(d) },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setEditar({ dispositivo: d }), oculta: !gestiona, separadorAntes: true },
    {
      id: 'activar',
      etiqueta: d.is_active ? t('acciones.desactivar') : t('acciones.activar'),
      icono: Power,
      onSelect: () => servicio && void correr(() => servicio.toggleDeviceStatus(d.id, !d.is_active), d.is_active ? t('toasts.desactivado') : t('toasts.activado')),
      oculta: !gestiona,
    },
    { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, onSelect: () => setEliminar(d), oculta: !gestiona, destructiva: true },
  ];

  const insignia = (d: GymAccessDevice) => (
    <StatusBadge estado={d.is_active ? 'active' : 'inactive'} etiqueta={d.is_active ? t('estados.activo') : t('estados.inactivo')} icono={d.is_active ? CheckCircle2 : XCircle} />
  );
  const metodos = (d: GymAccessDevice) =>
    [d.configuration?.qr_enabled ? t('metodos.qr') : null, d.configuration?.fingerprint_enabled ? t('metodos.huella') : null].filter(Boolean).join(' · ') || '—';

  const columnas: ColumnaTabla<GymAccessDevice>[] = [
    {
      id: 'nombre',
      encabezado: t('tabla.dispositivo'),
      celda: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{d.device_name}</p>
          <p className="truncate text-xs text-fg-secondary">{d.serial_number || d.location_description || ''}</p>
        </div>
      ),
    },
    { id: 'tipo', encabezado: t('tabla.tipo'), celda: (d) => t(`tipos.${d.device_type}`) },
    { id: 'sede', encabezado: t('tabla.sede'), celda: (d) => d.branches?.name ?? '—', ocultarDebajo: 'md' },
    { id: 'metodos', encabezado: t('tabla.metodos'), celda: metodos, ocultarDebajo: 'lg' },
    { id: 'sync', encabezado: t('tabla.ultimaSync'), celda: (d) => (d.last_sync_at ? fechas.fechaHora(d.last_sync_at) : t('tabla.nunca')), ocultarDebajo: 'xl' },
    { id: 'estado', encabezado: t('tabla.estado'), celda: insignia },
  ];

  const chips: ChipFiltro[] = [
    ...(tipo !== TODOS ? [{ clave: 'tipo', etiqueta: `${t('filtros.tipo')}: ${t(`tipos.${tipo}`)}` }] : []),
    ...(estado !== TODOS ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`filtros.${estado}`)}` }] : []),
  ];
  const limpiar = () => {
    setTipo(TODOS);
    setEstado(TODOS);
  };

  const estadoTabla: EstadoTabla = error
    ? 'error'
    : cargando || permisos.cargando
      ? 'cargando'
      : visibles.length === 0
        ? chips.length || busqueda
          ? 'sinResultados'
          : 'vacio'
        : 'listo';

  const migas = [{ etiqueta: tm('modulo'), href: '/app/membresias' }, { etiqueta: t('cabecera.titulo') }];
  if (!permisos.cargando && !permisos.ver) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
        <PageHeader titulo={t('cabecera.titulo')} icono={QrCode} migas={migas} />
        <EmptyState variante="forbidden" descripcion={t('sinPermiso')} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={t('cabecera.subtitulo')}
        icono={QrCode}
        migas={migas}
        cargando={cargando}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={() => void cargar()} disabled={cargando} aria-label={t('cabecera.actualizar')} title={t('cabecera.actualizar')}>
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            {gestiona && (
              <Button className="h-10" onClick={() => setEditar({ dispositivo: null })}>
                <Plus aria-hidden="true" className="mr-2 size-4" />
                {t('cabecera.nuevo')}
              </Button>
            )}
          </>
        }
        movil={{
          accion: gestiona ? (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setEditar({ dispositivo: null })} aria-label={t('cabecera.nuevo')}>
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={3} className="hidden lg:grid">
        <StatCard etiqueta={t('kpi.total')} valor={entero(kpi.total)} icono={Cpu} cargando={cargando} />
        <StatCard etiqueta={t('kpi.activos')} valor={entero(kpi.activos)} tono="exito" cargando={cargando} onClick={() => setEstado('activos')} />
        <StatCard etiqueta={t('kpi.inactivos')} valor={entero(kpi.total - kpi.activos)} cargando={cargando} onClick={() => setEstado('inactivos')} />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('filtros.ver', { n: visibles.length })}>
            <FiltroSelect
              etiqueta={t('filtros.tipo')}
              valor={tipo}
              onValor={(v) => setTipo(v as TipoDispositivo | typeof TODOS)}
              opciones={[{ v: TODOS, e: t('filtros.todos') }, ...TIPOS_DISPOSITIVO.map((x) => ({ v: x, e: t(`tipos.${x}`) }))]}
            />
            <FiltroSelect
              etiqueta={t('filtros.estado')}
              valor={estado}
              onValor={(v) => setEstado(v as FiltroEstado)}
              opciones={[
                { v: TODOS, e: t('filtros.todos') },
                { v: 'activos', e: t('filtros.activos') },
                { v: 'inactivos', e: t('filtros.inactivos') },
              ]}
            />
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => (c === 'tipo' ? setTipo(TODOS) : setEstado(TODOS))} onLimpiarTodo={limpiar} />}
      />

      <DataTable
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(d) => d.id}
        estado={estadoTabla}
        etiquetaFila={(d) => d.device_name}
        acciones={accionesDe}
        onFilaClick={gestiona ? (d) => setEditar({ dispositivo: d }) : undefined}
        tarjetaMovil={(d) => (
          <ListCard
            icono={Cpu}
            titulo={d.device_name}
            subtitulo={`${t(`tipos.${d.device_type}`)} · ${d.branches?.name ?? ''}`}
            meta={metodos(d)}
            estado={insignia(d)}
            acciones={accionesDe(d)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Cpu,
          accion: gestiona ? { etiqueta: t('cabecera.nuevo'), onClick: () => setEditar({ dispositivo: null }), icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('vacio.sinResultados') }}
        error={{ descripcion: error ?? undefined }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          limpiar();
          setBusqueda('');
        }}
        termino={busqueda}
      />

      <DialogoDispositivo
        abierto={!!editar}
        onAbiertoChange={(v) => !v && setEditar(null)}
        dispositivo={editar?.dispositivo ?? null}
        sucursales={sucursales}
        sucursalPorDefecto={selectedBranchId}
        onGuardar={guardar}
      />

      <Dialogo
        abierto={!!eliminar}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={eliminar ? t('eliminar.descripcion', { nombre: eliminar.device_name }) : undefined}
        icono={Trash2}
        primario={{
          etiqueta: t('eliminar.confirmar'),
          destructiva: true,
          cargando: ocupado,
          onClick: async () => {
            if (!eliminar || !servicio) return;
            const d = eliminar;
            if (await correr(() => servicio.deleteDevice(d.id), t('toasts.eliminado'))) setEliminar(null);
          },
        }}
        textoCancelar={t('dialogo.cancelar')}
      />

      <Dialogo
        abierto={!!qr}
        onAbiertoChange={(v) => !v && setQr(null)}
        titulo={t('qr.titulo')}
        descripcion={qr?.device_name}
        icono={QrCode}
        primario={{ etiqueta: t('qr.abrirKiosco'), onClick: () => qr && abrirKiosco(qr) }}
        textoCancelar={t('qr.cerrar')}
      >
        {qr?.current_qr_token ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="rounded-lg border border-line bg-surface p-4">
              <QRCodeSVG value={contenidoQrDispositivo(qr.id, qr.current_qr_token)} size={200} level="H" role="img" aria-label={t('qr.alt', { nombre: qr.device_name })} />
            </div>
            {qr.qr_token_expires_at && <p className="text-xs text-fg-secondary">{t('qr.expira', { fecha: fechas.fechaHora(qr.qr_token_expires_at) })}</p>}
          </div>
        ) : (
          <p className="text-sm text-fg-secondary">{t('qr.sinToken')}</p>
        )}
      </Dialogo>
    </div>
  );
}
