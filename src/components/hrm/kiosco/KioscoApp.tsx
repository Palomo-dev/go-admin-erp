'use client';

/**
 * GO Admin Kiosco (Figma 20.29.1–20.29.9; plan de Marcación M1, D3, D5, D7, D11).
 *
 * Ruta web sin sesión de usuario (`/marcacion/kiosco`) que corre igual en un
 * navegador, en la app móvil (Capacitor, modo kiosco) y en GO Admin Escritorio
 * (`?modo=lector`: computador con lector USB de carnés). La organización y la sede
 * salen del equipo vinculado (su clave, `Authorization: Bearer`), nunca de la
 * pantalla.
 *
 * Flujo: sin clave → código de vinculación (20.29.7) → inicio con QR, carné y PIN
 * (20.29.1) → identificación → foto de evidencia solo si la persona la autorizó
 * (20.29.3) → marca registrada (20.29.4). PIN equivocado (20.29.5), bloqueo tras 5
 * intentos (20.29.8) y desbloqueo por un supervisor (20.29.9). Sin internet
 * (20.29.6) la marca se guarda en la tablet y se envía después sin duplicar.
 *
 * La tablet NO reconoce rostros: solo toma la foto de evidencia (D3). El rostro y
 * la huella los compara el reloj de la sede.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { KeyRound, Nfc } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { contenidoQr, firmaQr, pasoDe, segundosRestantes, siguienteCodigo } from '@/lib/hrm/marcacion/qrTotp';
import { cuentaAtras, formatearCodigo, iniciales, pantallaDeIdentificacion, teclearPin, type RespuestaIdentificar, type TeclaPin, type TipoCredencial } from '@/lib/hrm/kiosco/kiosco';
import { aplicarResultados, cuerpoLote, encolar, medirDesfase, nuevaMarca, siguienteLote, type MarcaPendiente, type ResultadoMarca } from '@/lib/hrm/kiosco/cola';
import { generarLlave, hashLlave, nuevoIdLocal } from '@/lib/hrm/kiosco/llave';
import { ErrorKiosco, esFalloDeRed, pedirKiosco } from './apiKiosco';
import { borrarLlave, guardarEnCola, guardarLlave, leerCola, leerLlave, reemplazarCola } from './almacenKiosco';
import { useLectorCarne } from './useLectorCarne';
import {
  Aviso,
  AvisoCentro,
  Bloqueado,
  BotonSecundario,
  CamaraEvidencia,
  MarcoKiosco,
  OpcionMarcar,
  PanelLado,
  Registrada,
  TarjetaQr,
  TecladoPin,
  Vincular,
} from './PantallasKiosco';

interface ConfigKiosco {
  reloj_id: string;
  org: number;
  tipo: 'kiosco' | 'lector_escritorio';
  nombre: string;
  organizacion: string | null;
  sede: string | null;
  zona: string;
  ahora: string;
  metodos: { qr: boolean; pin: boolean; carne: boolean };
  foto: { pin: boolean; carne: boolean; dias: number };
  bloqueado_hasta: string | null;
  qr: { clave: string; segundos: number } | null;
}

interface ResultadoLote extends ResultadoMarca {
  evento_id?: string;
  tipo?: 'check_in' | 'check_out' | 'break_start' | 'break_end';
  hora?: string;
  nombre?: string | null;
  primer_nombre?: string | null;
  turno?: { inicio: string | null; fin: string | null } | null;
  foto_vence?: string | null;
  foto_guardada?: boolean;
}

type Fase =
  | { t: 'cargando' }
  | { t: 'vincular'; codigo: string | null; revocado: boolean; sinRed: boolean }
  | { t: 'inicio' }
  | { t: 'pin'; valor: string; restantes: number | null; enviando: boolean }
  | { t: 'foto'; idLocal: string; ident: RespuestaIdentificar; credencial: { tipo: TipoCredencial; valor: string } }
  | { t: 'enviando' }
  | { t: 'registrada'; r: ResultadoLote; sinRed: boolean }
  | { t: 'bloqueado'; hasta: string | null; nombre: string | null; credencialId: string | null; deKiosco: boolean }
  | { t: 'supervisor'; valor: string; nombre: string | null; credencialId: string | null; error: string | null; enviando: boolean }
  | { t: 'aviso'; clave: string; nombre?: string | null };

const VOLVER_MS = 5_000;
const CONSULTA_CONFIG_MS = 5 * 60_000;
const CONSULTA_VINCULO_MS = 4_000;
const SINCRONIZAR_MS = 20_000;
const CONSULTA_QR_MS = 3_000;
/** Última configuración: el kiosco arranca sin internet y sigue recibiendo marcas (20.29.6). */
const CLAVE_CONFIG = 'goadmin.kiosco.config';

function configGuardada(): ConfigKiosco | null {
  try {
    const c = JSON.parse(window.localStorage.getItem(CLAVE_CONFIG) ?? 'null') as ConfigKiosco | null;
    return c && typeof c.reloj_id === 'string' ? c : null;
  } catch {
    return null;
  }
}

export function KioscoApp() {
  const t = useTranslations('hrmKiosco.kiosco');
  const locale = useLocaleIntl();
  const sp = useSearchParams();
  const modoLector = sp?.get('modo') === 'lector';

  const [llave, setLlave] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigKiosco | null>(null);
  const [fase, setFase] = useState<Fase>({ t: 'cargando' });
  const [cola, setCola] = useState<MarcaPendiente[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [desfase, setDesfase] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const [qr, setQr] = useState<{ contenido: string; paso: number; n: number } | null>(null);
  const [usado, setUsado] = useState<{ paso: number; n: number | null } | null>(null);
  const faseRef = useRef(fase);
  faseRef.current = fase;
  const sincronizando = useRef(false);

  useEffect(() => {
    const i = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // ── Arranque: clave guardada → configuración; sin clave → vincular ─────────
  const cargarConfig = useCallback(async (k: string) => {
    const enviado = Date.now();
    try {
      const c = await pedirKiosco<ConfigKiosco>('/api/hrm/kiosco/config', k);
      const d = medirDesfase(c.ahora, enviado, Date.now());
      if (d !== null) setDesfase(d);
      setConfig(c);
      try {
        window.localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c));
      } catch {
        // Sin almacenamiento: solo se pierde el arranque sin internet.
      }
      setEnLinea(true);
      setFase((f) => (f.t === 'cargando' || f.t === 'vincular' ? { t: 'inicio' } : f));
      return true;
    } catch (e) {
      if (e instanceof ErrorKiosco && e.status === 401) {
        await borrarLlave();
        try {
          window.localStorage.removeItem(CLAVE_CONFIG);
        } catch {
          // nada
        }
        setLlave(null);
        setConfig(null);
        setFase({ t: 'vincular', codigo: null, revocado: true, sinRed: false });
        return false;
      }
      setEnLinea(false);
      const guardada = configGuardada();
      if (guardada) setConfig((c) => c ?? guardada);
      setFase((f) => (f.t === 'cargando' ? (guardada ? { t: 'inicio' } : { t: 'vincular', codigo: null, revocado: false, sinRed: true }) : f));
      return false;
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const k = await leerLlave();
      setCola(await leerCola().catch(() => []));
      if (!vivo) return;
      if (k) {
        setLlave(k);
        await cargarConfig(k);
      } else {
        setFase({ t: 'vincular', codigo: null, revocado: false, sinRed: false });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [cargarConfig]);

  // ── Vinculación: pedir código y esperar a que RR. HH. lo escriba ─────────
  const pendiente = useRef<string | null>(null);
  useEffect(() => {
    if (fase.t !== 'vincular') return;
    let vivo = true;
    const pedir = async () => {
      try {
        if (!pendiente.current) pendiente.current = generarLlave();
        const r = await pedirKiosco<{ estado: string; codigo?: string }>('/api/hrm/kiosco/vinculo', null, {
          metodo: 'POST',
          cuerpo: { llave_hash: await hashLlave(pendiente.current) },
        });
        if (!vivo) return;
        if (r.estado === 'vinculado') {
          const k = pendiente.current;
          pendiente.current = null;
          await guardarLlave(k);
          setLlave(k);
          await cargarConfig(k);
          return;
        }
        if (r.estado === 'revocado') {
          pendiente.current = null;
          return;
        }
        setFase((f) => (f.t === 'vincular' ? { ...f, codigo: r.codigo ?? null, sinRed: false } : f));
      } catch {
        if (vivo) setFase((f) => (f.t === 'vincular' ? { ...f, sinRed: true } : f));
      }
    };
    void pedir();
    const i = setInterval(() => void pedir(), CONSULTA_VINCULO_MS);
    return () => {
      vivo = false;
      clearInterval(i);
    };
  }, [fase.t, cargarConfig]);

  // ── Configuración al día y conexión ──────────────────────────────────────
  useEffect(() => {
    if (!llave) return;
    const i = setInterval(() => void cargarConfig(llave), CONSULTA_CONFIG_MS);
    const enLineaOn = () => void cargarConfig(llave);
    const fueraDeLinea = () => setEnLinea(false);
    window.addEventListener('online', enLineaOn);
    window.addEventListener('offline', fueraDeLinea);
    return () => {
      clearInterval(i);
      window.removeEventListener('online', enLineaOn);
      window.removeEventListener('offline', fueraDeLinea);
    };
  }, [llave, cargarConfig]);

  // ── Cola sin conexión: enviar en lotes, sin duplicar ─────────────────────
  const sincronizar = useCallback(async () => {
    if (!llave || sincronizando.current) return;
    const actual = await leerCola().catch(() => [] as MarcaPendiente[]);
    if (actual.length === 0) {
      setCola([]);
      return;
    }
    sincronizando.current = true;
    try {
      const lote = siguienteLote(actual);
      const r = await pedirKiosco<{ resultados: ResultadoMarca[] }>('/api/hrm/kiosco/marcas', llave, { metodo: 'POST', cuerpo: cuerpoLote(lote), timeoutMs: 30_000 });
      const { cola: quedan } = aplicarResultados(actual, r.resultados ?? []);
      await reemplazarCola(quedan);
      setCola(quedan);
      setEnLinea(true);
    } catch (e) {
      if (esFalloDeRed(e)) setEnLinea(false);
    } finally {
      sincronizando.current = false;
    }
  }, [llave]);

  useEffect(() => {
    if (!llave) return;
    void sincronizar();
    const i = setInterval(() => void sincronizar(), SINCRONIZAR_MS);
    return () => clearInterval(i);
  }, [llave, sincronizar, enLinea]);

  // ── QR del kiosco (mismo TOTP de la Pantalla de QR, D9) ──────────────────
  const ahoraServidor = ahora + desfase;
  const paso = pasoDe(ahoraServidor);
  const n = siguienteCodigo(usado && usado.paso === paso ? usado.n : null);
  const claveQr = config?.qr?.clave ?? null;
  useEffect(() => {
    if (!config || !claveQr) return;
    if (qr && qr.paso === paso && qr.n === n) return;
    let vivo = true;
    firmaQr(claveQr, config.reloj_id, paso, n)
      .then((firma) => vivo && setQr({ contenido: contenidoQr({ relojId: config.reloj_id, org: config.org, paso, n, firma }), paso, n }))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [config, claveQr, paso, n, qr]);
  useEffect(() => {
    if (!llave || !claveQr || fase.t !== 'inicio') return;
    const i = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const p = pasoDe(Date.now() + desfase);
      pedirKiosco<{ usado_hasta: number | null }>(`/api/hrm/kiosco/qr-usos?paso=${p}`, llave)
        .then((r) => setUsado({ paso: p, n: r.usado_hasta }))
        .catch(() => undefined);
    }, CONSULTA_QR_MS);
    return () => clearInterval(i);
  }, [llave, claveQr, fase.t, desfase]);

  // La pantalla no se apaga.
  useEffect(() => {
    type Bloqueo = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (tipo: 'screen') => Promise<Bloqueo> } };
    let b: Bloqueo | null = null;
    const pedir = () => {
      if (document.visibilityState === 'visible' && nav.wakeLock) nav.wakeLock.request('screen').then((x) => (b = x)).catch(() => undefined);
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      document.removeEventListener('visibilitychange', pedir);
      void b?.release().catch(() => undefined);
    };
  }, []);

  // Tras un resultado, volver solo al inicio.
  useEffect(() => {
    if (fase.t !== 'registrada' && fase.t !== 'aviso') return;
    const id = setTimeout(() => setFase({ t: 'inicio' }), fase.t === 'aviso' ? VOLVER_MS * 2 : VOLVER_MS);
    return () => clearTimeout(id);
  }, [fase]);

  // ── Marcar ────────────────────────────────────────────────────────────────
  const guardarSinRed = useCallback(
    async (credencial: { tipo: TipoCredencial; valor: string }) => {
      const m = nuevaMarca({ idLocal: nuevoIdLocal(), credencial, ahoraLocalMs: Date.now(), desfaseMs: desfase });
      await guardarEnCola(m);
      setCola((c) => encolar(c, m));
      setEnLinea(false);
      setFase({ t: 'registrada', r: { id_local: m.id_local, estado: 'a_revision', hora: m.hora }, sinRed: true });
    },
    [desfase]
  );

  const registrar = useCallback(
    async (idLocal: string, foto: string | null, credencial: { tipo: TipoCredencial; valor: string }) => {
      setFase({ t: 'enviando' });
      try {
        const r = await pedirKiosco<{ resultados: ResultadoLote[] }>('/api/hrm/kiosco/marcas', llave, {
          metodo: 'POST',
          cuerpo: { marcas: [{ id_local: idLocal, ...(foto ? { foto } : {}) }] },
          timeoutMs: 30_000,
        });
        const x = r.resultados?.[0];
        if (!x || x.estado === 'error') throw new ErrorKiosco(500, 'error');
        if (x.estado === 'vencida') return setFase({ t: 'aviso', clave: 'vencida' });
        if (x.estado === 'duplicada') return setFase({ t: 'aviso', clave: 'duplicada', nombre: x.primer_nombre ?? x.nombre });
        if (x.estado === 'rechazada') return setFase({ t: 'aviso', clave: x.motivo ?? 'error' });
        setFase({ t: 'registrada', r: x, sinRed: false });
      } catch (e) {
        if (esFalloDeRed(e)) await guardarSinRed(credencial);
        else setFase({ t: 'aviso', clave: 'error' });
      }
    },
    [llave, guardarSinRed]
  );

  const identificar = useCallback(
    async (credencial: { tipo: TipoCredencial; valor: string }) => {
      if (!llave || !config) return;
      const idLocal = nuevoIdLocal();
      if (credencial.tipo === 'pin') setFase((f) => (f.t === 'pin' ? { ...f, enviando: true } : f));
      else setFase({ t: 'enviando' });
      let r: RespuestaIdentificar;
      try {
        r = await pedirKiosco<RespuestaIdentificar>('/api/hrm/kiosco/identificar', llave, { metodo: 'POST', cuerpo: { id_local: idLocal, credencial } });
      } catch (e) {
        if (esFalloDeRed(e)) return guardarSinRed(credencial);
        return setFase({ t: 'aviso', clave: 'error' });
      }
      const puedeFoto = credencial.tipo === 'pin' ? config.foto.pin : config.foto.carne;
      switch (pantallaDeIdentificacion(r, puedeFoto)) {
        case 'foto':
          return setFase({ t: 'foto', idLocal, ident: r, credencial });
        case 'registrar':
          return registrar(idLocal, null, credencial);
        case 'pin_incorrecto':
          return setFase({ t: 'pin', valor: '', restantes: r.restantes ?? null, enviando: false });
        case 'bloqueado':
          return setFase({
            t: 'bloqueado',
            hasta: r.hasta ?? null,
            nombre: r.nombre ?? null,
            credencialId: r.credencial_id ?? null,
            deKiosco: r.estado === 'kiosco_bloqueado',
          });
        default:
          return setFase({ t: 'aviso', clave: r.estado });
      }
    },
    [llave, config, registrar, guardarSinRed]
  );

  const esperando = fase.t === 'inicio' || fase.t === 'pin';
  const { fuentes } = useLectorCarne(!!config?.metodos.carne && esperando, (c) => void identificar(c));

  // ── Supervisor ───────────────────────────────────────────────────────────
  const desbloquear = async (valor: string, credencialId: string | null, nombre: string | null) => {
    setFase({ t: 'supervisor', valor, nombre, credencialId, error: null, enviando: true });
    try {
      const r = await pedirKiosco<{ estado: string }>('/api/hrm/kiosco/desbloquear', llave, { metodo: 'POST', cuerpo: { pin: valor, credencial_id: credencialId } });
      if (r.estado === 'ok') {
        if (llave) void cargarConfig(llave);
        return setFase({ t: 'pin', valor: '', restantes: null, enviando: false });
      }
      setFase({ t: 'supervisor', valor: '', nombre, credencialId, error: r.estado, enviando: false });
    } catch {
      setFase({ t: 'supervisor', valor: '', nombre, credencialId, error: 'error', enviando: false });
    }
  };

  // ── Textos comunes ────────────────────────────────────────────────────────
  const zona = config?.zona;
  const hora = new Intl.DateTimeFormat(locale, { ...(zona ? { timeZone: zona } : {}), hour: 'numeric', minute: '2-digit' }).format(ahoraServidor);
  const fecha = new Intl.DateTimeFormat(locale, { ...(zona ? { timeZone: zona } : {}), weekday: 'long', day: 'numeric', month: 'long' }).format(ahoraServidor);
  const horaDe = (iso: string | null | undefined) => (iso && zona ? new Intl.DateTimeFormat(locale, { timeZone: zona, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '');
  const diaDe = (fechaPlana: string | null | undefined) => {
    if (!fechaPlana || !/^\d{4}-\d{2}-\d{2}$/.test(fechaPlana)) return '';
    const [a, m, d] = fechaPlana.split('-').map(Number);
    // Fecha plana (date): sin conversión de zona.
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(Date.UTC(a, m - 1, d));
  };

  const dias = config?.foto.dias ?? 30;
  const titulo = config ? config.organizacion ?? config.nombre : t('marca');
  const subtitulo = config ? [config.sede, config.nombre].filter(Boolean).join(' · ') : t('sinVincular');
  const pie = t('pie', { dias });
  const sede = config?.sede ?? config?.nombre ?? '';
  const marco = (contenido: ReactNode) => (
    <MarcoKiosco titulo={titulo} subtitulo={subtitulo} hora={hora} fecha={fecha} pie={pie}>
      {contenido}
    </MarcoKiosco>
  );

  // ── Pantallas ─────────────────────────────────────────────────────────────
  if (fase.t === 'cargando' || fase.t === 'enviando') {
    return marco(
      <div className="flex flex-1 items-center justify-center" role="status">
        <p className="text-base text-fg-secondary">{fase.t === 'cargando' ? t('cargando') : t('registrando')}</p>
      </div>
    );
  }

  if (fase.t === 'vincular') {
    return marco(
      <Vincular
        titulo={modoLector ? t('vincular.tituloLector') : t('vincular.titulo')}
        instrucciones={modoLector ? t('vincular.instruccionesLector') : t('vincular.instrucciones')}
        codigo={fase.codigo ? formatearCodigo(fase.codigo) : null}
        nota={fase.sinRed ? t('vincular.sinRed') : fase.revocado ? t('vincular.revocado') : t('vincular.vence')}
      />
    );
  }

  if (!config) return marco(null);

  const banner =
    !enLinea || cola.length > 0 ? (
      <div className="mb-6">
        <Aviso tono="advertencia" rol="status" titulo={t('sinInternet.titulo', { n: cola.length, enLinea: enLinea ? 'si' : 'no' })} descripcion={t('sinInternet.descripcion')} />
      </div>
    ) : null;

  if (fase.t === 'inicio') {
    const conQr = config.metodos.qr && config.tipo === 'kiosco';
    return marco(
      <>
        {banner}
        <div className={`grid flex-1 gap-8 ${conQr ? 'lg:grid-cols-[minmax(0,648px)_minmax(0,1fr)]' : 'mx-auto w-full max-w-2xl'}`}>
          {conQr && (
            <TarjetaQr contenido={qr?.contenido ?? null} sede={sede} restantes={segundosRestantes(ahoraServidor)} />
          )}
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-fg">{conQr ? t('inicio.oMarcaAqui') : t('inicio.marcaAqui')}</p>
            {config.metodos.carne && (
              <OpcionMarcar
                icono={Nfc}
                titulo={t('inicio.carne.titulo')}
                descripcion={config.tipo === 'lector_escritorio' || modoLector ? t('inicio.carne.lector') : fuentes.length > 1 ? t('inicio.carne.tablet') : t('inicio.carne.lector')}
                insignia={t('inicio.listoParaLeer')}
              />
            )}
            {config.metodos.pin && (
              <OpcionMarcar
                icono={KeyRound}
                titulo={t('inicio.pin.titulo')}
                descripcion={t('inicio.pin.descripcion')}
                onClick={() => setFase({ t: 'pin', valor: '', restantes: null, enviando: false })}
              />
            )}
            {!config.metodos.carne && !config.metodos.pin && !conQr && <Aviso tono="info" titulo={t('inicio.sinMetodos.titulo')} descripcion={t('inicio.sinMetodos.descripcion')} />}
            <Aviso tono="info" titulo={t('inicio.sinRostro.titulo')} descripcion={t('inicio.sinRostro.descripcion')} />
          </div>
        </div>
      </>
    );
  }

  if (fase.t === 'pin') {
    const conError = fase.restantes !== null;
    return marco(
      <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:items-start lg:justify-center">
        <div className="w-full lg:max-w-[560px]">
          <TecladoPin
            titulo={t('teclado.titulo')}
            valor={fase.valor}
            enviando={fase.enviando}
            error={conError ? <Aviso tono="peligro" rol="alert" titulo={t('teclado.incorrecto', { n: fase.restantes ?? 0 })} descripcion={t('teclado.incorrectoDetalle')} /> : undefined}
            onTecla={(k: TeclaPin) => setFase((f) => (f.t === 'pin' && !f.enviando ? { ...f, valor: teclearPin(f.valor, k), restantes: k === 'borrar' ? f.restantes : f.valor.length === 0 ? null : f.restantes } : f))}
            onListo={() => {
              const f = faseRef.current;
              if (f.t === 'pin' && f.valor.length === 6 && !f.enviando) void identificar({ tipo: 'pin', valor: f.valor });
            }}
          />
        </div>
        <PanelLado titulo={conError ? t('teclado.noFunciona.titulo') : t('teclado.olvidaste.titulo')}>
          <p className="text-sm text-fg-secondary">{conError ? t('teclado.noFunciona.descripcion') : t('teclado.olvidaste.descripcion')}</p>
          {!conError && config.foto.pin && <p className="text-sm text-fg-secondary">{t('teclado.despuesFoto')}</p>}
          <BotonSecundario onClick={() => setFase({ t: 'inicio' })}>{conError ? t('volverInicio') : t('cancelar')}</BotonSecundario>
        </PanelLado>
      </div>
    );
  }

  if (fase.t === 'foto') {
    const nombre = fase.ident.primer_nombre ?? fase.ident.nombre ?? '';
    return marco(
      <div className="flex flex-1 flex-col gap-8 lg:flex-row">
        <div className="flex flex-1 lg:max-w-[748px]">
          <CamaraEvidencia
            texto={t('foto.mira')}
            textoSinCamara={t('foto.sinCamara')}
            onFoto={(dataUrl) => void registrar(fase.idLocal, dataUrl, fase.credencial)}
          />
        </div>
        <PanelLado titulo={t('foto.identificado', { nombre, metodo: fase.credencial.tipo === 'pin' ? 'pin' : 'carne' })}>
          <p className="text-sm text-fg-secondary">{t('foto.explicacion', { dias: fase.ident.foto_dias ?? dias })}</p>
          <p className="text-[13px] text-fg-muted">{t('foto.retiro')}</p>
        </PanelLado>
      </div>
    );
  }

  if (fase.t === 'registrada') {
    const r = fase.r;
    const nombre = r.primer_nombre ?? r.nombre ?? '';
    const tipo = r.tipo ?? 'check_in';
    const partes = [horaDe(r.hora), sede];
    if (r.turno?.inicio && r.turno.fin) partes.push(t('registrada.turno', { inicio: horaDe(r.turno.inicio), fin: horaDe(r.turno.fin) }));
    const volvemos = t('registrada.volvemos', { n: Math.max(1, Math.ceil(VOLVER_MS / 1000)) });
    if (fase.sinRed) {
      return marco(
        <Registrada titulo={t('registrada.guardadaSinRed')} detalle={t('registrada.guardadaSinRedDetalle', { hora: horaDe(r.hora) })} foto={null} iniciales="" volvemos={volvemos} />
      );
    }
    return marco(
      <Registrada
        titulo={t(`registrada.titulo.${tipo}`, { nombre })}
        detalle={partes.filter(Boolean).join(' · ')}
        foto={r.foto_guardada ? t('registrada.fotoGuardada', { fecha: diaDe(r.foto_vence) }) : r.estado === 'a_revision' ? t('registrada.aRevision') : null}
        iniciales={iniciales(r.nombre)}
        volvemos={volvemos}
      />
    );
  }

  if (fase.t === 'bloqueado') {
    const cuenta = cuentaAtras(fase.hasta, ahoraServidor);
    return marco(
      <Bloqueado
        titulo={fase.deKiosco ? t('bloqueado.tituloKiosco') : t('bloqueado.titulo')}
        cuenta={cuenta ? t('bloqueado.cuenta', { tiempo: cuenta.texto }) : null}
        descripcion={t('bloqueado.descripcion')}
        acciones={
          <>
            <button type="button" onClick={() => setFase({ t: 'inicio' })} className={clasesBoton({ variante: 'secundario', className: 'h-12 px-5' })}>
              {t('volverInicio')}
            </button>
            <button
              type="button"
              onClick={() => setFase({ t: 'supervisor', valor: '', nombre: fase.nombre, credencialId: fase.credencialId, error: null, enviando: false })}
              className={clasesBoton({ variante: 'primario', className: 'h-12 px-5' })}
            >
              <KeyRound className="size-4" aria-hidden="true" strokeWidth={1.5} />
              {t('bloqueado.supervisor')}
            </button>
          </>
        }
      />
    );
  }

  if (fase.t === 'supervisor') {
    return marco(
      <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:items-start lg:justify-center">
        <div className="w-full lg:max-w-[560px]">
          <TecladoPin
            titulo={t('supervisor.titulo')}
            valor={fase.valor}
            enviando={fase.enviando}
            error={fase.error ? <Aviso tono="peligro" rol="alert" titulo={t(`supervisor.errores.${fase.error === 'supervisor_bloqueado' ? 'bloqueado' : fase.error === 'supervisor_rechazado' ? 'rechazado' : 'error'}`)} /> : undefined}
            onTecla={(k) => setFase((f) => (f.t === 'supervisor' && !f.enviando ? { ...f, valor: teclearPin(f.valor, k), error: null } : f))}
            onListo={() => {
              const f = faseRef.current;
              if (f.t === 'supervisor' && f.valor.length === 6 && !f.enviando) void desbloquear(f.valor, f.credencialId, f.nombre);
            }}
          />
        </div>
        <PanelLado titulo={fase.nombre ? t('supervisor.paraNombre', { nombre: fase.nombre }) : t('supervisor.paraKiosco')}>
          <p className="text-sm text-fg-secondary">{t('supervisor.descripcion')}</p>
          <p className="text-sm text-fg-secondary">{fase.nombre ? t('supervisor.podraNombre', { nombre: fase.nombre.split(' ')[0] }) : t('supervisor.podra')}</p>
          <BotonSecundario onClick={() => setFase({ t: 'inicio' })}>{t('cancelar')}</BotonSecundario>
        </PanelLado>
      </div>
    );
  }

  // Avisos: carné desconocido, otra sede, método no disponible, doble marca…
  const clave = ['carne_desconocido', 'otra_sede', 'metodo_no_disponible', 'sin_marcacion', 'sin_vinculo', 'credencial_invalida', 'duplicada', 'vencida', 'repetida'].includes(fase.clave)
    ? fase.clave
    : 'error';
  return marco(
    <AvisoCentro
      titulo={t(`avisos.${clave}.titulo`, { nombre: fase.nombre ?? '' })}
      descripcion={t(`avisos.${clave}.descripcion`)}
      accion={
        <button type="button" onClick={() => setFase({ t: 'inicio' })} className={clasesBoton({ variante: 'secundario', className: 'h-12 px-5' })}>
          {t('volverInicio')}
        </button>
      }
    />
  );
}
