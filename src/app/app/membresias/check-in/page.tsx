'use client';

/**
 * Membresías › Check-in (antes /app/gym/checkin).
 *
 * Búsqueda y registro en el servidor: `apiMembresias.buscarEntrada(q)` busca
 * por nombre, documento (customers.identification_number), correo, teléfono
 * o código de acceso; `apiMembresias.registrarEntrada` llama a
 * fn_membresia_registrar_checkin, que valida vigencia, gracia (deja entrar
 * con aviso, P5), sede, horario y tope diario, y registra la entrada o el
 * rechazo. La pantalla solo muestra lo que dice la base.
 *
 * Sede: la sucursal activa del usuario (BranchContext); con «Todas» se pide
 * elegir una. Método: `qr` solo si un lector leyó exactamente el código de
 * acceso; si no, `manual` (o el que elija el recepcionista).
 *
 * Permiso: memberships.checkin (sin él, estado «sin permiso»).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, LogIn, QrCode, RefreshCw, Search, UserX, Users, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyState,
  FormField,
  KpiStrip,
  PageHeader,
  ResultadoOperacion,
  SegmentedControl,
  StatCard,
  StatusBadge,
  Tarjeta,
  AvatarIniciales,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useHardwareBarcodeScanner } from '@/hooks/useHardwareBarcodeScanner';
import { apiMembresias, usePermisosMembresias, ErrorPeticionMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { ClienteResumen, MembresiaFila, ResultadoCheckin } from '@/lib/services/membresias/tipos';
import { listarEntradasDelDia, resumirEntradas, type EntradaDelDia } from '@/lib/services/gymCheckinService';
import {
  METODOS_ENTRADA,
  TONO_ESTADO_MEMBRESIA,
  esAvisoConocido,
  esMotivoConocido,
  metodoDeEntrada,
  tonoResultadoEntrada,
  type MetodoEntrada,
} from '@/components/membresias/operacion/logica';
import { useFechasOrg } from '@/components/membresias/operacion/useFechasOrg';
import { cn } from '@/utils/Utils';

type Encontrado = { cliente: ClienteResumen; vigente: MembresiaFila | null };
type FiltroHistorial = 'todas' | 'permitidas' | 'rechazadas';

export default function CheckInPage() {
  const t = useTranslations('membresias.checkin');
  const tm = useTranslations('membresias');
  const router = useRouter();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const { branches, selectedBranchId, isLoading: cargandoSedes } = useBranch();
  const permisos = usePermisosMembresias();
  const fechas = useFechasOrg();
  const entero = useFormatoEntero();

  const [sedeElegida, setSedeElegida] = useState<string>('');
  const sede = selectedBranchId ?? (sedeElegida ? Number(sedeElegida) : null);

  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState<{ q: string; origen: 'lector' | 'teclado' } | null>(null);
  const [resultados, setResultados] = useState<Encontrado[]>([]);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Encontrado | null>(null);
  const [metodo, setMetodo] = useState<MetodoEntrada>('manual');
  const [registrando, setRegistrando] = useState(false);
  const [resultado, setResultado] = useState<{ quien: Encontrado; r: ResultadoCheckin } | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const [entradas, setEntradas] = useState<EntradaDelDia[]>([]);
  const [cargandoEntradas, setCargandoEntradas] = useState(true);
  const [errorEntradas, setErrorEntradas] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroHistorial>('todas');

  const sucursales = useMemo(
    () => branches.filter((b): b is typeof b & { id: number } => typeof b.id === 'number').map((b) => ({ id: b.id, nombre: b.name })),
    [branches],
  );

  const cargarEntradas = useCallback(async () => {
    if (!orgId || !permisos.checkin) return;
    setErrorEntradas(null);
    try {
      setEntradas(await listarEntradasDelDia({ organizationId: orgId, dia: fechas.hoy, zona: fechas.zona, sucursalId: sede }));
    } catch {
      setErrorEntradas(t('errores.historial'));
    } finally {
      setCargandoEntradas(false);
    }
  }, [orgId, permisos.checkin, fechas.hoy, fechas.zona, sede, t]);

  useEffect(() => {
    void cargarEntradas();
    const id = setInterval(() => void cargarEntradas(), 30_000);
    return () => clearInterval(id);
  }, [cargarEntradas]);

  const elegir = useCallback((e: Encontrado, q: string, origen: 'lector' | 'teclado') => {
    setElegido(e);
    setResultado(null);
    setMetodo(metodoDeEntrada(origen, q, e.vigente?.codigo));
  }, []);

  const buscar = useCallback(
    async (q: string, origen: 'lector' | 'teclado') => {
      const limpio = q.trim();
      if (limpio.length < 2) {
        setErrorBusqueda(t('busqueda.minimo'));
        return;
      }
      setBuscando(true);
      setErrorBusqueda(null);
      setElegido(null);
      setResultado(null);
      setBuscado({ q: limpio, origen });
      try {
        const lista = await apiMembresias.buscarEntrada(limpio);
        setResultados(lista);
        if (lista.length === 1) elegir(lista[0], limpio, origen);
      } catch (e) {
        setResultados([]);
        setErrorBusqueda(e instanceof ErrorPeticionMembresias && e.codigo === 'sin_permiso' ? tm('errores.sin_permiso') : t('errores.buscar'));
      } finally {
        setBuscando(false);
      }
    },
    [elegir, t, tm],
  );

  // Lector de códigos (QR de la membresía o carné): busca solo y marca el origen.
  useHardwareBarcodeScanner({
    enabled: permisos.checkin && !registrando,
    onScan: (codigo) => {
      setTexto(codigo);
      void buscar(codigo, 'lector');
    },
  });

  const registrar = async () => {
    if (!elegido || !sede) return;
    setRegistrando(true);
    try {
      const r = await apiMembresias.registrarEntrada({
        clienteId: elegido.cliente.id,
        sucursalId: sede,
        metodo,
        membresiaId: elegido.vigente?.id ?? null,
      });
      setResultado({ quien: elegido, r });
      setElegido(null);
      setResultados([]);
      setTexto('');
      void cargarEntradas();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionMembresias ? e.codigo : 'error_interno';
      toast.error(tm.has(`errores.${codigo}`) ? tm(`errores.${codigo}`) : tm('errores.error_interno'));
    } finally {
      setRegistrando(false);
    }
  };

  const nuevaBusqueda = () => {
    setResultado(null);
    setElegido(null);
    setResultados([]);
    setBuscado(null);
    setTexto('');
    requestAnimationFrame(() => campoRef.current?.focus());
  };

  const insigniaMembresia = (m: MembresiaFila | null) =>
    m ? (
      <StatusBadge
        estado={m.estadoVisual}
        etiqueta={tm(`estados.${m.estadoVisual}`, { dias: m.dias ?? 0 })}
        tono={TONO_ESTADO_MEMBRESIA[m.estadoVisual] ?? 'neutro'}
      />
    ) : (
      <StatusBadge estado="sin_membresia" etiqueta={t('sinMembresia')} tono="neutro" />
    );

  const textoMotivo = (motivo: string | null) => (esMotivoConocido(motivo) ? t(`motivos.${motivo}`) : motivo ?? '');

  const resumen = useMemo(() => resumirEntradas(entradas), [entradas]);
  const historial = useMemo(
    () => entradas.filter((e) => (filtro === 'todas' ? true : filtro === 'permitidas' ? !e.motivoRechazo : !!e.motivoRechazo)),
    [entradas, filtro],
  );

  const migas = [{ etiqueta: tm('modulo'), href: '/app/membresias' }, { etiqueta: t('cabecera.titulo') }];

  if (permisos.cargando) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
        <PageHeader titulo={t('cabecera.titulo')} icono={LogIn} migas={migas} cargando />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (!permisos.checkin) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
        <PageHeader titulo={t('cabecera.titulo')} icono={LogIn} migas={migas} />
        <EmptyState variante="forbidden" descripcion={t('sinPermiso')} />
      </div>
    );
  }

  const r = resultado?.r;
  const tono = r ? tonoResultadoEntrada(r) : 'exito';

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={t('cabecera.subtitulo')}
        icono={LogIn}
        migas={migas}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={() => void cargarEntradas()} aria-label={t('cabecera.actualizar')} title={t('cabecera.actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" />
            </Button>
            {permisos.dispositivos && (
              <Button variant="outline" className="h-10" asChild>
                <Link href="/app/membresias/control-de-acceso">
                  <QrCode aria-hidden="true" className="mr-2 size-4" />
                  {t('cabecera.dispositivos')}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={3}>
        <StatCard etiqueta={t('kpi.permitidas')} valor={entero(resumen.permitidas)} icono={CheckCircle2} tono="exito" cargando={cargandoEntradas} onClick={() => setFiltro('permitidas')} />
        <StatCard etiqueta={t('kpi.rechazadas')} valor={entero(resumen.rechazadas)} icono={UserX} tono="peligro" cargando={cargandoEntradas} onClick={() => setFiltro('rechazadas')} />
        <StatCard etiqueta={t('kpi.miembros')} valor={entero(resumen.miembros)} icono={Users} cargando={cargandoEntradas} />
      </KpiStrip>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6">
        <div className="flex flex-col gap-4">
          <Tarjeta titulo={t('busqueda.titulo')} icono={Search}>
            <div className="flex flex-col gap-4">
              {selectedBranchId === null && (
                <FormField etiqueta={t('sede.etiqueta')} obligatorio ayuda={t('sede.ayuda')}>
                  {(campo) => (
                    <Select value={sedeElegida} onValueChange={setSedeElegida} disabled={cargandoSedes}>
                      <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                        <SelectValue placeholder={t('sede.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sucursales.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
              <form
                role="search"
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void buscar(texto, 'teclado');
                }}
              >
                <label htmlFor="checkin-busqueda" className="sr-only">
                  {t('busqueda.etiqueta')}
                </label>
                <Input
                  id="checkin-busqueda"
                  ref={campoRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={t('busqueda.placeholder')}
                  autoFocus
                  autoComplete="off"
                  aria-describedby="checkin-busqueda-ayuda"
                  className="h-11 flex-1"
                />
                <Button type="submit" className="h-11" disabled={buscando}>
                  <Search aria-hidden="true" className="mr-2 size-4" />
                  {buscando ? t('busqueda.buscando') : t('busqueda.buscar')}
                </Button>
              </form>
              <p id="checkin-busqueda-ayuda" className="text-xs text-fg-secondary">
                {t('busqueda.ayuda')}
              </p>
              {errorBusqueda && (
                <p role="alert" className="text-sm text-danger-text">
                  {errorBusqueda}
                </p>
              )}
            </div>
          </Tarjeta>

          {resultado && r && (
            <ResultadoOperacion
              tono={tono}
              icono={tono === 'peligro' ? XCircle : tono === 'advertencia' ? AlertTriangle : CheckCircle2}
              titulo={r.permitido ? t('resultado.permitido', { nombre: resultado.quien.cliente.nombre }) : t('resultado.rechazado', { nombre: resultado.quien.cliente.nombre })}
              descripcion={r.permitido ? (esAvisoConocido(r.aviso) ? t(`avisos.${r.aviso}`, { dias: r.diasGracia ?? 0 }) : t('resultado.bienvenida')) : textoMotivo(r.motivo)}
              referencia={r.membresia?.codigo ?? null}
              cifras={
                r.membresia
                  ? [
                      { etiqueta: t('resultado.plan'), valor: r.membresia.plan ?? '—' },
                      { etiqueta: t('resultado.vence'), valor: fechas.fecha(r.membresia.hasta) },
                      ...(r.membresia.graceUntil ? [{ etiqueta: t('resultado.graciaHasta'), valor: fechas.fecha(r.membresia.graceUntil) }] : []),
                    ]
                  : undefined
              }
              primaria={{ etiqueta: t('resultado.nueva'), onClick: nuevaBusqueda, icono: Search }}
              secundarias={
                r.membresia
                  ? [{ etiqueta: t('resultado.verMembresia'), onClick: () => router.push(`/app/membresias/membresias/${r.membresia?.id}`) }]
                  : []
              }
              onCerrar={nuevaBusqueda}
              textoCerrar={t('resultado.cerrar')}
            />
          )}

          {!resultado && buscado && !buscando && resultados.length === 0 && !errorBusqueda && (
            <Tarjeta>
              <EmptyState variante="search" termino={buscado.q} descripcion={t('busqueda.sinResultados')} onLimpiarFiltros={nuevaBusqueda} compacto />
            </Tarjeta>
          )}

          {!resultado && resultados.length > 1 && !elegido && (
            <Tarjeta titulo={t('resultados.titulo', { n: resultados.length })}>
              <ul className="flex flex-col gap-2">
                {resultados.map((e) => (
                  <li key={e.cliente.id}>
                    <button
                      type="button"
                      onClick={() => elegir(e, buscado?.q ?? '', buscado?.origen ?? 'teclado')}
                      className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <AvatarIniciales nombre={e.cliente.nombre} src={e.cliente.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{e.cliente.nombre}</span>
                        <span className="block truncate text-xs text-fg-secondary">
                          {[e.cliente.documento, e.vigente?.plan.nombre, e.vigente?.codigo].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {insigniaMembresia(e.vigente)}
                    </button>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          {!resultado && elegido && (
            <Tarjeta titulo={t('elegido.titulo')}>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <AvatarIniciales nombre={elegido.cliente.nombre} src={elegido.cliente.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{elegido.cliente.nombre}</p>
                    <p className="truncate text-xs text-fg-secondary">{[elegido.cliente.documento, elegido.cliente.telefono].filter(Boolean).join(' · ')}</p>
                  </div>
                  {insigniaMembresia(elegido.vigente)}
                </div>
                {elegido.vigente && (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-fg-secondary">{t('resultado.plan')}</dt>
                      <dd className="text-fg">{elegido.vigente.plan.nombre}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-secondary">{t('resultado.vence')}</dt>
                      <dd className="text-fg">{fechas.fecha(elegido.vigente.hasta)}</dd>
                    </div>
                    {elegido.vigente.codigo && (
                      <div>
                        <dt className="text-xs text-fg-secondary">{t('elegido.codigo')}</dt>
                        <dd className="font-mono text-fg">{elegido.vigente.codigo}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <FormField etiqueta={t('metodo.etiqueta')} ayuda={metodo === 'qr' ? t('metodo.ayudaQr') : undefined}>
                  {(campo) => (
                    <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoEntrada)}>
                      <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METODOS_ENTRADA.map((m) => (
                          <SelectItem key={m} value={m}>
                            {t(`metodos.${m}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                {!sede && (
                  <p role="alert" className="text-sm text-warning-text">
                    {t('sede.falta')}
                  </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={nuevaBusqueda} disabled={registrando}>
                    {t('elegido.cancelar')}
                  </Button>
                  <Button onClick={() => void registrar()} disabled={registrando || !sede}>
                    <LogIn aria-hidden="true" className="mr-2 size-4" />
                    {registrando ? t('elegido.registrando') : t('elegido.registrar')}
                  </Button>
                </div>
                <p className="text-xs text-fg-secondary">{t('elegido.nota')}</p>
              </div>
            </Tarjeta>
          )}
        </div>

        <Tarjeta
          titulo={t('historial.titulo')}
          descripcion={t('historial.descripcion', { dia: fechas.diaPlano(fechas.hoy, { weekday: 'long', day: 'numeric', month: 'long' }) })}
          accion={
            <SegmentedControl<FiltroHistorial>
              etiqueta={t('historial.filtro')}
              tamano="sm"
              valor={filtro}
              onValorChange={setFiltro}
              opciones={[
                { valor: 'todas', etiqueta: t('historial.todas') },
                { valor: 'permitidas', etiqueta: t('historial.permitidas'), contador: resumen.permitidas },
                { valor: 'rechazadas', etiqueta: t('historial.rechazadas'), contador: resumen.rechazadas },
              ]}
            />
          }
          sinRelleno
        >
          {cargandoEntradas ? (
            <div className="flex flex-col gap-2 p-4" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : errorEntradas ? (
            <EmptyState variante="error" descripcion={errorEntradas} onReintentar={() => void cargarEntradas()} compacto />
          ) : historial.length === 0 ? (
            <EmptyState variante={entradas.length ? 'search' : 'empty'} titulo={entradas.length ? t('historial.sinFiltro') : t('historial.vacio')} descripcion={entradas.length ? undefined : t('historial.vacioDescripcion')} icono={LogIn} onLimpiarFiltros={() => setFiltro('todas')} compacto />
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto" aria-live="polite">
              {historial.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 text-sm tabular-nums text-fg-secondary">{fechas.hora(e.fecha)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{e.cliente}</span>
                    <span className={cn('block truncate text-xs', e.motivoRechazo ? 'text-danger-text' : 'text-fg-secondary')}>
                      {e.motivoRechazo
                        ? textoMotivo(e.motivoRechazo)
                        : [e.plan, e.metodo ? t(`metodos.${METODOS_ENTRADA.includes(e.metodo as MetodoEntrada) ? e.metodo : 'manual'}`) : null, sede ? null : e.sucursal].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StatusBadge
                    estado={e.motivoRechazo ? 'rechazada' : 'permitida'}
                    etiqueta={e.motivoRechazo ? t('historial.rechazada') : t('historial.permitida')}
                    tono={e.motivoRechazo ? 'peligro' : 'exito'}
                    icono={e.motivoRechazo ? XCircle : CheckCircle2}
                  />
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
