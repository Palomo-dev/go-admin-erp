'use client';

/**
 * «Marcar turno» del empleado (Figma 20.9.1–20.9.11), en `/marcar`.
 *
 * - Marca SIEMPRE por el servidor (`POST /api/hrm/marcacion`): la hora, el tipo
 *   de evento y la validez de la ubicación o del QR los decide `fn_hr_marcar`.
 *   El token del QR nunca se compara en el navegador.
 * - Decisión 9: por defecto desde el celular, con la ubicación tomada solo en
 *   el momento de marcar y con autorización (`POST /api/hrm/marcacion/consentimiento`).
 *   El QR de la sede es opcional. Decisión 3: desde un computador no se toma
 *   ubicación; sin QR la marca queda para que el jefe la revise.
 * - Llegada tarde con motivo opcional; fuera de turno con motivo obligatorio:
 *   las dos quedan como novedad para el jefe.
 * - Sin señal: la marca se guarda en el celular y se envía al volver la señal.
 *   La hora sigue siendo la del servidor; la capturada viaja como dato para la revisión.
 * - Marcación M0, «Celular según la sede» (Figma 20.30): la pantalla ofrece los
 *   métodos que la sede tiene para la persona (`metodos_sede` del GET; sin ese
 *   dato, como antes). `?metodo=` abre uno directo (Inicio). La etiqueta NFC se
 *   lee con Web NFC y SIEMPRE va con la ubicación del momento; `?nfc=` (el
 *   celular abrió la etiqueta) marca una sola vez al cargar y se limpia de la URL.
 *   El QR es de un solo uso (20.30.11) y, si la sede lo pide, va con ubicación.
 *   El QR con PIN (20.30.10) llega con el kiosco (M1): aquí no existe.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, ArrowLeft, Coffee, Info, Laptop, LocateFixed, LogIn, MapPin, Nfc, ScanLine, ScanQrCode, TriangleAlert, WifiOff } from 'lucide-react';
import { AvisoTonal, Dialogo, EmptyState, FilaDato, FormField, SegmentedControl, Tarjeta, clasesBoton, useEsEscritorio } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import {
  CLAVE_COLA,
  descansoRestante,
  distanciaMetros,
  leerCola,
  metodoDeParametro,
  metodoInicial,
  metodosDisponibles,
  siguienteConCola,
  vistaMarcacion,
  type EstadoMarcacion,
  type MarcaPendiente,
  type MetodoPantalla,
  type TipoEvento,
} from '@/lib/hrm/jornada/marcarLogica';
import { diaIso } from '@/lib/hrm/turnos/programacion';
import { useFormatoHora } from '@/components/hrm/turnos/formatoHora';
import { ErrorEstructura, pedir, useCarga } from '@/components/hrm/estructura/comun';
import { QRScanner } from './QRScanner';
import { LectorNfc, nfcDisponible } from './LectorNfc';
import { PanelLector } from './PanelLector';
import { claveMetodoMarca, etiquetaDeUrl, sedeDelError } from './marcarMetodoLogica';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';

const MOTIVOS = ['transporte', 'salud', 'familiar', 'clima', 'otro'] as const;
const MOTIVOS_FUERA = ['cubrir', 'inventario', 'evento', 'otro'] as const;

type Posicion = { lat: number; lng: number; precision: number } | null;
type Ubicacion = { estado: 'pendiente' | 'ok' | 'denegada' | 'no_disponible'; pos: Posicion };
/** Error que reemplaza al lector (Figma 20.30.5 y 20.30.11): «No registramos nada». */
type ErrorLector = { tipo: 'qr_ya_usado' } | { tipo: 'etiqueta_otra_sede'; sede: string | null };

function leerColaLocal(): MarcaPendiente[] {
  try {
    return leerCola(window.localStorage.getItem(CLAVE_COLA));
  } catch {
    return [];
  }
}
function guardarColaLocal(c: MarcaPendiente[]) {
  try {
    window.localStorage.setItem(CLAVE_COLA, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: la marca se pierde y se avisa */
  }
}

export function MarcarTurno() {
  const t = useTranslations('hrmMarcacion');
  const f = useFormatoHora();
  const escritorio = useEsEscritorio();
  const { carga, recargar } = useCarga<EstadoMarcacion>('/api/hrm/marcacion');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const zona = datos?.zona ?? DEFAULT_TIMEZONE;
  const [ahora, setAhora] = useState(() => new Date());
  const [metodo, setMetodo] = useState<MetodoPantalla | null>(null);
  const [ubicacion, setUbicacion] = useState<Ubicacion>({ estado: 'pendiente', pos: null });
  const [pedirPermiso, setPedirPermiso] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
  const [motivo, setMotivo] = useState<string>('');
  const [pedidoPor, setPedidoPor] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const [fueraDeRango, setFueraDeRango] = useState<number | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  const [cola, setCola] = useState<MarcaPendiente[]>([]);
  const enviandoCola = useRef(false);
  // Marcación M0 (20.30): lector de QR o NFC, sus errores y la etiqueta abierta por URL.
  const parametros = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const pedido = metodoDeParametro(parametros?.get('metodo'));
  const nfcUrl = parametros?.get('nfc') ?? null;
  const [pausaLector, setPausaLector] = useState(false);
  const [errorLector, setErrorLector] = useState<ErrorLector | null>(null);
  const [tipoLector, setTipoLector] = useState<TipoEvento | null>(null);
  const [nfcSoportado, setNfcSoportado] = useState<boolean | null>(null);
  const pendienteNfc = useRef<string | null>(null);
  const nfcUrlUsada = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setCola(leerColaLocal());
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);

  const hoyIso = datos?.hoy ? diaIso(datos.hoy) : 1;
  const disponibles = useMemo(() => (datos ? metodosDisponibles(datos, hoyIso) : []), [datos, hoyIso]);
  useEffect(() => {
    if (!datos || metodo !== null) return;
    // `?metodo=` (Inicio abre directo el método de la sede) manda si la sede lo ofrece.
    if (pedido && disponibles.includes(pedido)) setMetodo(pedido);
    else setMetodo(escritorio ? (disponibles.includes('remoto') ? 'remoto' : disponibles.includes('qr') ? 'qr' : 'ubicacion') : metodoInicial(disponibles, datos.modalidad, datos.metodo_preferido));
  }, [datos, disponibles, escritorio, metodo, pedido]);
  useEffect(() => setNfcSoportado(nfcDisponible()), []);

  const vista = datos ? vistaMarcacion(datos, ahora) : null;
  const siguiente: TipoEvento = siguienteConCola(vista?.accion ?? datos?.siguiente ?? 'check_in', cola);
  const turno = datos?.turno && !datos.turno.dia_descanso ? datos.turno : null;
  const sede = datos?.sede ?? null;
  const distancia =
    ubicacion.pos && sede?.lat != null && sede?.lng != null ? Math.round(distanciaMetros(ubicacion.pos.lat, ubicacion.pos.lng, Number(sede.lat), Number(sede.lng))) : null;
  const usaUbicacion = metodo === 'ubicacion' && !escritorio;
  /** QR o etiqueta en pantalla (20.30.2, 20.30.6); tras marcar con ellos se vuelve a la vista del turno. */
  const modoLector = (metodo === 'qr' || metodo === 'nfc') && !pausaLector;
  /** La etiqueta exige ubicación siempre; el QR, si la sede lo pide. Nunca desde un computador (decisión 3). */
  const ubicacionLector = !escritorio && (metodo === 'nfc' || (metodo === 'qr' && datos?.reglas?.qr_exige_ubicacion === true));

  // Ubicación: solo con autorización y solo cuando la pantalla la necesita.
  const posicionAhora = useCallback(
    () =>
      new Promise<Posicion>((resolver) => {
        if (!('geolocation' in navigator)) {
          setUbicacion({ estado: 'no_disponible', pos: null });
          resolver(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) => {
            const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
            setUbicacion({ estado: 'ok', pos });
            resolver(pos);
          },
          (e) => {
            setUbicacion({ estado: e.code === e.PERMISSION_DENIED ? 'denegada' : 'no_disponible', pos: null });
            if (e.code === e.PERMISSION_DENIED) setBloqueada(true);
            resolver(null);
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
        );
      }),
    []
  );
  const tomarUbicacion = useCallback(() => void posicionAhora(), [posicionAhora]);
  useEffect(() => {
    if (!datos || !(usaUbicacion || ubicacionLector)) return;
    if (datos.ubicacion?.autorizada) tomarUbicacion();
  }, [datos, usaUbicacion, ubicacionLector, tomarUbicacion]);

  const autorizar = async (otorgar: boolean) => {
    setPedirPermiso(false);
    const etiqueta = pendienteNfc.current;
    pendienteNfc.current = null;
    try {
      await pedir('/api/hrm/marcacion/consentimiento', { metodo: 'POST', cuerpo: { otorgar } });
      await recargar();
      // La etiqueta que esperaba el permiso se marca ahora (su ubicación se toma al enviar).
      if (otorgar && etiqueta) void marcarRef.current({ nfc: etiqueta, consentido: true });
      else if (otorgar) tomarUbicacion();
    } catch {
      toast.error(t('errores.error_hrm'));
    }
  };
  const elegirMetodo = (m: MetodoPantalla) => {
    setMetodo(m);
    setPausaLector(false);
    setErrorLector(null);
    setTipoLector(null);
  };

  const enviarCola = useCallback(async () => {
    if (enviandoCola.current) return;
    const pendientes = leerColaLocal();
    if (!pendientes.length || !navigator.onLine) return;
    enviandoCola.current = true;
    const quedan: MarcaPendiente[] = [];
    for (const m of pendientes) {
      try {
        await pedir('/api/hrm/marcacion', {
          metodo: 'POST',
          cuerpo: { metodo: 'app', tipo: m.tipo, remoto: m.remoto, fuera_de_linea: { capturada: m.capturada }, dispositivo: { plataforma: 'movil' } },
        });
      } catch (e) {
        // Una marca repetida o rechazada no se reintenta para siempre.
        if (!(e instanceof ErrorEstructura) || e.status >= 500) quedan.push(m);
      }
    }
    guardarColaLocal(quedan);
    setCola(quedan);
    enviandoCola.current = false;
    if (quedan.length < pendientes.length) {
      toast.success(t('sinSenal.enviadas', { n: pendientes.length - quedan.length }));
      void recargar();
    }
  }, [recargar, t]);
  useEffect(() => {
    if (enLinea) void enviarCola();
  }, [enLinea, enviarCola]);

  const marcar = async (opciones: { tipo?: TipoEvento; qr?: string; nfc?: string; consentido?: boolean } = {}) => {
    if (!datos) return;
    const lector = opciones.qr ?? opciones.nfc;
    const tipo = opciones.tipo ?? (lector ? (tipoLector ?? siguiente) : siguiente);
    const remoto = metodo === 'remoto';
    if (usaUbicacion && !lector && !datos.ubicacion?.autorizada) {
      setPedirPermiso(true);
      return;
    }
    // La etiqueta exige la ubicación del momento; el QR, si la sede lo pide (reglas de la sede).
    const conUbicacion = !!lector && !escritorio && (opciones.nfc !== undefined || datos.reglas?.qr_exige_ubicacion === true);
    if (conUbicacion && !opciones.consentido && !datos.ubicacion?.autorizada) {
      if (opciones.nfc) pendienteNfc.current = opciones.nfc;
      setPedirPermiso(true);
      return;
    }
    if (!navigator.onLine && !lector) {
      const nueva: MarcaPendiente = { id: `${Date.now()}`, tipo, capturada: new Date().toISOString(), metodo: 'app', remoto };
      const c = [...leerColaLocal(), nueva];
      guardarColaLocal(c);
      setCola(c);
      toast.message(t('sinSenal.guardada'));
      return;
    }
    const fuera = vista?.fase === 'fueraDeTurno' && tipo === 'check_in';
    const nota =
      vista?.fase === 'tarde' && motivo
        ? { motivo: t(`motivos.${motivo}`) }
        : fuera && motivo
          ? { motivo: t(`motivosFuera.${motivo}`), pedido_por: pedidoPor || undefined, fuera_de_turno: true }
          : undefined;
    setEnviando(true);
    setFueraDeRango(null);
    setErrorLector(null);
    const pos = conUbicacion ? await posicionAhora() : null;
    const geo = pos ? { lat: pos.lat, lng: pos.lng, precision: pos.precision } : undefined;
    const cuerpo = opciones.nfc
      ? { nfc: opciones.nfc, tipo, ubicacion: geo, dispositivo: { plataforma: escritorio ? 'escritorio' : 'movil' }, nota }
      : opciones.qr
      ? { qr: opciones.qr, tipo, ubicacion: geo, dispositivo: { plataforma: escritorio ? 'escritorio' : 'movil' }, nota }
      : {
          metodo: 'app',
          tipo,
          remoto,
          ubicacion: usaUbicacion && ubicacion.pos ? { lat: ubicacion.pos.lat, lng: ubicacion.pos.lng, precision: ubicacion.pos.precision } : undefined,
          dispositivo: { plataforma: escritorio ? 'escritorio' : 'movil' },
          nota,
        };
    try {
      const r = await pedir<{ tipo: TipoEvento; hora: string; revisar?: string | null; ubicacion_guardada: boolean; reloj?: string | null }>('/api/hrm/marcacion', { metodo: 'POST', cuerpo });
      const como = opciones.qr ? t('como.qr') : remoto ? t('como.remoto') : r.revisar ? t(`revisar.${r.revisar}`) : t('como.ubicacion');
      // 20.30.4: «Con la etiqueta NFC de la Puerta principal · Sede Centro».
      const descripcion = opciones.nfc
        ? [r.reloj ? t('registradaNfc.conPunto', { punto: r.reloj }) : t('registradaNfc.sinPunto'), sede?.nombre].filter(Boolean).join(' · ')
        : [sede?.nombre, como].filter(Boolean).join(' · ');
      toast.success(t(`registrada.${r.tipo}`, { hora: f.hora(r.hora, zona) }), { description: descripcion });
      setMotivo('');
      setPedidoPor('');
      if (lector) {
        // Tras marcar con el lector se vuelve a la vista del turno (el mismo código no se relee).
        setPausaLector(true);
        setTipoLector(null);
      }
      if (opciones.qr) setMetodo(metodoInicial(disponibles, datos.modalidad, datos.metodo_preferido));
      await recargar();
    } catch (e) {
      const codigo = e instanceof ErrorEstructura ? e.codigo : 'error_hrm';
      if (codigo === 'fuera_de_rango' && !lector) setFueraDeRango(distancia);
      else if (codigo === 'qr_ya_usado' && opciones.qr) {
        setErrorLector({ tipo: 'qr_ya_usado' });
      } else if (codigo === 'etiqueta_otra_sede' && opciones.nfc && disponibles.includes('nfc')) {
        setMetodo('nfc');
        setPausaLector(false);
        setErrorLector({ tipo: 'etiqueta_otra_sede', sede: sedeDelError(e instanceof ErrorEstructura ? e.datos : null) });
      } else toast.error(t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_hrm'));
    } finally {
      setEnviando(false);
    }
  };
  const marcarRef = useRef(marcar);
  marcarRef.current = marcar;

  // `?nfc=`: el celular abrió la etiqueta. Se marca una sola vez y el parámetro se limpia.
  useEffect(() => {
    if (!datos?.vinculo) return;
    const accion = etiquetaDeUrl(nfcUrl, nfcUrlUsada.current);
    if (!accion) return;
    nfcUrlUsada.current = true;
    const resto = new URLSearchParams(parametros?.toString() ?? '');
    resto.delete('nfc');
    const consulta = resto.toString();
    router.replace(`${ruta ?? '/marcar'}${consulta ? `?${consulta}` : ''}`, { scroll: false });
    if ('contenido' in accion) void marcarRef.current({ nfc: accion.contenido });
    else toast.error(t('errores.etiqueta_invalida'));
  }, [datos, nfcUrl, parametros, router, ruta, t]);

  // ─── Estados de la pantalla ────────────────────────────────────────────────
  const subtitulo = [datos?.vinculo?.sede, turno ? `${turno.plantilla ?? t('turno')} ${f.hora(turno.inicio, zona)} – ${f.hora(turno.fin, zona)}` : null].filter(Boolean).join(' · ');
  const cabecera = (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <Link href="/app/inicio" aria-label={t('volver')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <ArrowLeft aria-hidden className="size-5" strokeWidth={1.5} />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-fg">{t('titulo')}</h1>
        {subtitulo && <p className="truncate text-xs text-fg-secondary">{subtitulo}</p>}
      </div>
    </header>
  );
  const marco = (contenido: React.ReactNode) => (
    <div className="min-h-dvh bg-canvas">
      {cabecera}
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 pb-24">{contenido}</main>
    </div>
  );

  if (carga.estado === 'cargando') {
    return marco(<div className="h-40 animate-pulse rounded-xl bg-subtle" aria-busy="true" aria-label={t('cargando')} />);
  }
  if (carga.estado === 'error' && (carga.codigo === 'unauthorized' || carga.codigo === 'no_autenticado')) {
    return marco(<EmptyState variante="forbidden" titulo={t('sinSesion.titulo')} descripcion={t('sinSesion.descripcion')} accion={{ etiqueta: t('sinSesion.entrar'), href: '/auth/login', icono: LogIn }} />);
  }
  if (carga.estado === 'error' || carga.estado === 'noExiste') {
    return marco(<EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />);
  }
  if (carga.estado === 'sinPermiso' || !datos?.vinculo) {
    return marco(<EmptyState variante="forbidden" titulo={t('sinVinculo.titulo')} descripcion={t('sinVinculo.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }} />);
  }
  if ((datos.mecanismos ?? []).length === 1 && datos.mecanismos?.[0] === 'sin_marcacion') {
    return marco(<EmptyState variante="forbidden" titulo={t('noMarca.titulo')} descripcion={t('noMarca.descripcion')} accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }} />);
  }

  const fase = cola.length ? (siguiente === 'check_in' ? 'cerrado' : siguiente === 'break_end' ? 'enDescanso' : 'enTurno') : vista!.fase;
  const entrada = cola.find((m) => m.tipo === 'check_in')?.capturada ?? vista!.entrada;
  const descansoDesde = vista!.descansoDesde;
  const restante = descansoRestante(descansoDesde, turno?.descanso_min ?? null, ahora);
  const metodoEntrada = datos.marcas?.find((m) => m.tipo === 'check_in');
  const descansoTexto = turno?.descanso_min ? t(turno.descanso_pagado ? 'descansoPagado' : 'descansoNoPagado', { min: turno.descanso_min }) : t('sinDescanso');
  const enCurso = fase === 'enTurno' || fase === 'enDescanso';

  const insignia =
    fase === 'enTurno' ? (
      <Badge tono="exito" apariencia="contorno" tamano="sm">{t('estado.enTurno')}</Badge>
    ) : fase === 'enDescanso' ? (
      <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('estado.enDescanso', { min: vista!.minutos })}</Badge>
    ) : fase === 'tarde' ? (
      <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('estado.tarde', { min: vista!.minutos })}</Badge>
    ) : fase === 'cerrado' ? (
      <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('estado.cerrado')}</Badge>
    ) : null;
  const detalle = (() => {
    const lugar = metodo === 'remoto' ? t('remoto') : (sede?.nombre ?? '');
    if (cola.length && entrada) return t('detalle.guardada', { hora: f.hora(entrada, zona) });
    if (fase === 'enTurno') return t('detalle.desde', { hora: f.hora(entrada, zona), lugar });
    if (fase === 'enDescanso') return t('detalle.descanso', { hora: f.hora(descansoDesde, zona), descanso: descansoTexto });
    if (fase === 'cerrado') return t('detalle.cerrado', { hora: f.hora(datos.marcas?.slice(-1)[0]?.hora, zona) });
    if (turno) return t('detalle.entrada', { hora: f.hora(turno.inicio, zona), lugar });
    return t('detalle.sinTurno');
  })();
  const etiquetaAccion = t(`accion.${siguiente}`);
  const tonoCaja = enCurso ? 'bg-success-subtle text-success-text' : fase === 'tarde' ? 'bg-warning-subtle text-warning-text' : 'bg-brand-tint text-brand';
  const bloqueadoFuera = fase === 'fueraDeTurno' && siguiente === 'check_in' && !motivo;
  /** Con el QR o la etiqueta elegidos, los botones del turno vuelven a abrir el lector. */
  const metodoLector = metodo === 'qr' || metodo === 'nfc';
  const IconoAccion = metodo === 'qr' ? ScanQrCode : metodo === 'nfc' ? Nfc : ScanLine;
  const abrirLector = (tipo: TipoEvento | null) => {
    setTipoLector(tipo);
    setErrorLector(null);
    setPausaLector(false);
  };
  const nombreSede = sede?.nombre ?? '';
  /** Fila «Ubicación · Autorizar» sobre el lector cuando la marca la exige y aún no hay permiso. */
  const autorizarLector =
    ubicacionLector && !datos.ubicacion?.autorizada ? (
      <Tarjeta>
        <FilaDato
          etiqueta={t('ubicacion.etiqueta')}
          valor={
            <button type="button" className="text-sm font-medium text-brand-deep underline-offset-2 hover:underline" onClick={() => setPedirPermiso(true)}>
              {t('ubicacion.autorizar')}
            </button>
          }
        />
      </Tarjeta>
    ) : null;
  const botonConQr = (variante: 'primario' | 'fantasma') =>
    disponibles.includes('qr') ? (
      <button type="button" className={clasesBoton({ variante, anchoCompleto: variante === 'primario' })} onClick={() => elegirMetodo('qr')}>
        <ScanQrCode aria-hidden className="size-4" strokeWidth={1.5} />
        {t('nfc.conQr')}
      </button>
    ) : null;

  const vistaQr =
    errorLector?.tipo === 'qr_ya_usado' ? (
      <>
        <PanelLector icono={TriangleAlert} rol="alert" titulo={t('qrUsado.titulo')} descripcion={t('qrUsado.descripcion')} />
        <p className="text-sm text-fg-secondary">{t('qrUsado.nota')}</p>
        <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => setErrorLector(null)}>
          <ScanQrCode aria-hidden className="size-4" strokeWidth={1.5} />
          {t('qrUsado.otraVez')}
        </button>
      </>
    ) : (
      <>
        {autorizarLector}
        <div className="overflow-hidden rounded-xl bg-tooltip p-2">
          <QRScanner onScan={(d) => void marcar({ qr: d })} isProcessing={enviando} />
        </div>
        <p className="text-sm text-fg-secondary">
          {!datos.metodos_sede ? t('qr.nota', { sede: nombreSede }) : disponibles.length === 1 ? t('qr.notaSolo', { sede: nombreSede }) : t('qr.notaSede', { sede: nombreSede })}
        </p>
        {disponibles.includes('ubicacion') && !escritorio && (
          <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => elegirMetodo('ubicacion')}>
            <LocateFixed aria-hidden className="size-4" strokeWidth={1.5} />
            {t('qr.volver')}
          </button>
        )}
      </>
    );

  const vistaNfc =
    errorLector?.tipo === 'etiqueta_otra_sede' ? (
      // 20.30.5: la etiqueta es de otra sede de la misma organización (también en iPhone, que abre la etiqueta por URL).
      <>
        <PanelLector
          icono={TriangleAlert}
          rol="alert"
          titulo={errorLector.sede ? t('nfc.otraSede.titulo', { sede: errorLector.sede }) : t('nfc.otraSede.tituloSinSede')}
          descripcion={t('nfc.otraSede.descripcion', { sede: nombreSede })}
        />
        <p className="text-sm text-fg-secondary">{errorLector.sede ? t('nfc.otraSede.nota', { sede: errorLector.sede }) : t('nfc.otraSede.notaSinSede')}</p>
        {botonConQr('fantasma')}
        <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => setErrorLector(null)}>
          <Nfc aria-hidden className="size-4" strokeWidth={1.5} />
          {t('nfc.otraVez')}
        </button>
      </>
    ) : nfcSoportado === false ? (
      // 20.30.3: iPhone u otro navegador sin Web NFC.
      <>
        <AvisoTonal tono="informacion" icono={Info} titulo={t('nfc.noDisponible.titulo')} descripcion={t('nfc.noDisponible.descripcion')} />
        {botonConQr('primario')}
        {disponibles.includes('ubicacion') && (
          <button type="button" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })} onClick={() => elegirMetodo('ubicacion')}>
            <LocateFixed aria-hidden className="size-4" strokeWidth={1.5} />
            {t('nfc.conUbicacion')}
          </button>
        )}
      </>
    ) : nfcSoportado ? (
      // 20.30.2: acercar el celular a la etiqueta.
      <>
        {autorizarLector}
        <LectorNfc
          onLeer={(c) => void marcar({ nfc: c })}
          onInvalida={() => toast.error(t('errores.etiqueta_invalida'))}
          onNoDisponible={() => setNfcSoportado(false)}
          procesando={enviando}
        />
        <p className="text-sm text-fg-secondary">{t('nfc.nota')}</p>
        {botonConQr('fantasma')}
      </>
    ) : (
      <div className="h-40 animate-pulse rounded-xl bg-subtle" aria-busy="true" aria-label={t('cargando')} />
    );

  const reloj = (
    <Tarjeta className="text-center">
      <p className="text-3xl font-semibold tabular-nums text-fg">{f.hora(ahora.toISOString(), zona)}</p>
      <p className="mt-1 text-sm text-fg-secondary">{t('horaDe', { dia: datos.hoy ? f.diaLargo(datos.hoy) : '', sede: sede?.nombre ?? '' })}</p>
    </Tarjeta>
  );

  return marco(
    <>
      {!enLinea && (
        <Badge tono="neutro" apariencia="contorno" tamano="sm" icono={WifiOff} className="self-start">
          {t('sinSenal.badge')}
        </Badge>
      )}
      {enLinea && !modoLector && reloj}

      {modoLector ? (
        <div className="flex flex-col gap-3">
          {/* 20.30.6: con un solo método no hay selector. */}
          {disponibles.length > 1 && (
            <SegmentedControl etiqueta={t('como.etiqueta')} anchoCompleto valor={metodo ?? disponibles[0]} onValorChange={elegirMetodo} opciones={opcionesMetodo(disponibles, t)} />
          )}
          {metodo === 'qr' ? vistaQr : vistaNfc}
        </div>
      ) : (
        <>
          {fase === 'fueraDeTurno' && siguiente === 'check_in' ? (
            <>
              <AvisoTonal
                tono="advertencia"
                icono={AlertTriangle}
                titulo={t('fuera.titulo')}
                descripcion={
                  datos.proximo_turno
                    ? t('fuera.conSiguiente', { dia: f.diaCorto(datos.proximo_turno.fecha).toLowerCase(), hora: f.hora(datos.proximo_turno.inicio, zona) })
                    : t('fuera.sinSiguiente')
                }
              />
              <FormField etiqueta={t('fuera.motivo')} obligatorio>
                {(c) => (
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_FUERA.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`motivosFuera.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('fuera.quien')}>
                {(c) => (
                  <Select value={pedidoPor} onValueChange={setPedidoPor}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {datos.jefe && <SelectItem value={datos.jefe.nombre}>{datos.jefe.nombre}</SelectItem>}
                      <SelectItem value={t('fuera.nadie')}>{t('fuera.nadie')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <button
                type="button"
                className={clasesBoton({ variante: 'primario', anchoCompleto: true })}
                disabled={bloqueadoFuera || enviando}
                onClick={() => void marcar({ tipo: 'check_in' })}
              >
                <LogIn aria-hidden className="size-4" strokeWidth={1.5} />
                {t('fuera.marcar')}
              </button>
            </>
          ) : (
            <Tarjeta>
              <div className="flex items-start gap-3">
                <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tonoCaja)}>
                  <ScanLine className="size-5" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-fg">{t('tuTurno')}</h2>
                    {insignia}
                  </div>
                  <p className="text-sm text-fg-secondary">{detalle}</p>
                </div>
              </div>
              <button
                type="button"
                className={clasesBoton({ variante: enCurso ? 'tinte' : 'primario', anchoCompleto: true, className: 'mt-4' })}
                disabled={enviando || (usaUbicacion && fueraDeRango !== null && !enCurso)}
                onClick={() =>
                  metodoLector ? abrirLector(siguiente === 'break_start' ? 'check_out' : null) : void marcar(siguiente === 'break_start' ? { tipo: 'check_out' } : {})
                }
              >
                <IconoAccion aria-hidden className="size-4" strokeWidth={1.5} />
                {siguiente === 'break_start' ? t('accion.check_out') : etiquetaAccion}
              </button>
            </Tarjeta>
          )}

          {fase === 'enTurno' && (
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}
              disabled={enviando}
              onClick={() => (metodoLector ? abrirLector('break_start') : void marcar({ tipo: 'break_start' }))}
            >
              <Coffee aria-hidden className="size-4" strokeWidth={1.5} />
              {t('iniciarDescanso')}
            </button>
          )}

          {enCurso && (
            <Tarjeta>
              <FilaDato
                etiqueta={t('filas.entrada')}
                valor={<span className="font-semibold">{[f.hora(entrada, zona), metodoEntrada ? t(`metodo.${claveMetodoMarca(metodoEntrada)}`) : null].filter(Boolean).join(' · ')}</span>}
              />
              <FilaDato
                etiqueta={t('filas.descanso')}
                valor={fase === 'enDescanso' && restante !== null ? t('filas.quedan', { hora: f.hora(descansoDesde, zona), min: restante }) : descansoTexto}
              />
              {turno && <FilaDato etiqueta={t('filas.salida')} valor={f.hora(turno.fin, zona)} />}
            </Tarjeta>
          )}

          {fase === 'tarde' && (
            <>
              <FormField etiqueta={t('tarde.motivo')}>
                {(c) => (
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`motivos.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <AvisoTonal tono="advertencia" icono={AlertTriangle} titulo={t('tarde.titulo')} descripcion={t('tarde.descripcion')} />
            </>
          )}

          {fueraDeRango !== null && usaUbicacion && (
            <>
              <AvisoTonal
                tono="peligro"
                icono={AlertCircle}
                titulo={fueraDeRango ? t('lejos.titulo', { m: fueraDeRango, sede: sede?.nombre ?? '' }) : t('lejos.tituloSinDistancia', { sede: sede?.nombre ?? '' })}
                descripcion={t('lejos.descripcion', { radio: sede?.radio_m ?? 150 })}
              />
              {disponibles.includes('qr') && (
                <button type="button" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })} onClick={() => elegirMetodo('qr')}>
                  <ScanQrCode aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('lejos.qr')}
                </button>
              )}
              <Link href="/app/inicio/mi-asistencia" className={clasesBoton({ variante: 'fantasma', anchoCompleto: true })}>
                {t('lejos.jefe')}
              </Link>
            </>
          )}

          {!enCurso && fase !== 'cerrado' && disponibles.length > 0 && cola.length === 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="como-marcas">
              <h2 id="como-marcas" className="text-base font-semibold text-fg">
                {datos.metodos_sede && nombreSede ? t('como.tituloSede', { sede: nombreSede }) : t('como.titulo')}
              </h2>
              {disponibles.length > 1 && (
                <SegmentedControl etiqueta={t('como.etiqueta')} anchoCompleto valor={metodo ?? disponibles[0]} onValorChange={elegirMetodo} opciones={opcionesMetodo(disponibles, t)} />
              )}
              {metodo === 'ubicacion' && escritorio && (
                <AvisoTonal tono="informacion" icono={Laptop} titulo={t('computador.titulo')} descripcion={t('computador.descripcion')} />
              )}
              {usaUbicacion && (
                <Tarjeta>
                  <FilaDato
                    etiqueta={t('ubicacion.etiqueta')}
                    valor={
                      !datos.ubicacion?.autorizada ? (
                        <button type="button" className="text-sm font-medium text-brand-deep underline-offset-2 hover:underline" onClick={() => setPedirPermiso(true)}>
                          {t('ubicacion.autorizar')}
                        </button>
                      ) : ubicacion.estado === 'pendiente' ? (
                        t('ubicacion.buscando')
                      ) : ubicacion.estado !== 'ok' ? (
                        t('ubicacion.noDisponible')
                      ) : distancia === null ? (
                        t('ubicacion.sinSede')
                      ) : distancia <= (sede?.radio_m ?? 150) ? (
                        <span className="font-medium text-success-text">{t('ubicacion.dentro', { sede: sede?.nombre ?? '', m: distancia })}</span>
                      ) : (
                        <span className="font-medium text-danger-text">{t('ubicacion.fuera', { m: distancia })}</span>
                      )
                    }
                  />
                  {ubicacion.pos && <FilaDato etiqueta={t('ubicacion.precision')} valor={t('ubicacion.metros', { m: ubicacion.pos.precision })} />}
                  <p className="mt-2 flex items-start gap-2 text-sm text-fg-secondary">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                    {t('ubicacion.nota')}
                  </p>
                </Tarjeta>
              )}
              {metodo === 'remoto' && <AvisoTonal tono="informacion" icono={Laptop} titulo={t('remotoAviso.titulo')} descripcion={t('remotoAviso.descripcion')} />}
            </section>
          )}

          {cola.length > 0 && (
            <>
              <AvisoTonal tono="advertencia" icono={WifiOff} titulo={t('sinSenal.titulo')} descripcion={t('sinSenal.descripcion')} />
              <Tarjeta titulo={t('sinSenal.porEnviar', { n: cola.length })}>
                <ul className="flex flex-col gap-2">
                  {cola.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-sm text-fg">
                      <span>{t('sinSenal.fila', { tipo: t(`tipo.${m.tipo}`), hora: f.hora(m.capturada, zona), dia: datos.hoy ? f.diaCorto(datos.hoy).toLowerCase() : '' })}</span>
                      <Badge tono="advertencia" apariencia="contorno" tamano="sm">
                        {t('sinSenal.pendiente')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            </>
          )}

          {fase === 'cerrado' && (
            <Link href="/app/inicio/mi-asistencia" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
              {t('verMarcaciones')}
            </Link>
          )}
        </>
      )}

      <Dialogo
        abierto={pedirPermiso}
        onAbiertoChange={setPedirPermiso}
        titulo={t('permiso.titulo')}
        descripcion={t('permiso.descripcion')}
        icono={MapPin}
        ancho={440}
        primario={{ etiqueta: t('permiso.permitir'), onClick: () => void autorizar(true) }}
        textoCancelar={t('permiso.ahoraNo')}
        onCancelar={() => {
          setPedirPermiso(false);
          pendienteNfc.current = null;
          if (disponibles.includes('qr')) elegirMetodo('qr');
        }}
      >
        <details className="text-sm text-fg-secondary">
          <summary className="cursor-pointer font-medium text-brand-deep">{t('permiso.queGuardamos')}</summary>
          <p className="mt-2">{t('permiso.queGuardamosTexto')}</p>
        </details>
      </Dialogo>
      <Dialogo
        abierto={bloqueada}
        onAbiertoChange={setBloqueada}
        titulo={t('bloqueada.titulo')}
        descripcion={t('bloqueada.descripcion')}
        icono={Info}
        ancho={440}
        primario={{ etiqueta: t('bloqueada.entendido'), onClick: () => setBloqueada(false) }}
        textoCancelar={t('bloqueada.cerrar')}
      />
    </>
  );
}

function opcionesMetodo(disponibles: MetodoPantalla[], t: ReturnType<typeof useTranslations>) {
  return disponibles.map((m) => ({ valor: m, etiqueta: t(`como.${m}`) }));
}
