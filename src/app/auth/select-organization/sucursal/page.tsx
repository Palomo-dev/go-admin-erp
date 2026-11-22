'use client';

/**
 * Paso «¿En qué sucursal trabajas hoy?» (Figma `08 Acceso y organización` ›
 * 2728:69155 escritorio, 2728:69432 móvil y la nota de reglas, propuesta
 * 2026-11-21). Va después de elegir la organización (o del login con una sola):
 * `proceedWithLogin` redirige aquí con `?dest=` (ver `rutaPasoSucursal`).
 *
 * - Las sucursales salen del servidor (`GET /api/me/sucursales`): solo las
 *   que le corresponden al miembro. Con 0 o 1 se sigue directo, como antes.
 * - Orden: la última usada en este equipo (★), la principal, por nombre.
 * - «Todas las sucursales» solo si el servidor lo permite (`verTodas`).
 * - Teclado: 1–9 elige, ↑ ↓ mueven, Enter entra. Buscador con más de 6.
 * - La elección se valida en el servidor (`POST /api/me/sucursales`) y solo
 *   entonces se guarda en este equipo con `guardarSucursalActiva` (las mismas
 *   claves que el selector de la barra superior).
 *
 * Vive bajo /auth/select-organization porque el middleware deja entrar ahí con
 * la sesión abierta (las demás /auth/* mandan a /app/inicio).
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { destinoTrasLogin } from '@/lib/auth/recuperacionSesion';
import { limpiarSesionMuerta } from '@/lib/auth/deadSession';
import { getCurrentBranchId, guardarSucursalActiva } from '@/lib/hooks/useOrganization';
import {
  MINIMO_BUSCADOR,
  TODAS_LAS_SUCURSALES,
  indiceDeAtajo,
  ordenarSucursalesEntrada,
  salirDelPaso,
  type EleccionSucursal,
  type EstadoHorario,
  type RespuestaSucursalesEntrada,
  type SucursalEntrada,
} from '@/lib/auth/seleccionSucursal';
import { SearchInput } from '@/components/kit/SearchInput';
import { clasesBoton } from '@/components/kit/botonClases';
import { EscenaAcceso, TarjetaAcceso, AvisoAcceso, Enlace } from '@/components/kit/acceso';
import { TarjetaOrganizacion, type InsigniaTarjeta } from '@/components/kit/acceso/TarjetaOrganizacion';

const RUTA_API = '/api/me/sucursales';

type Opcion = { tipo: 'sucursal'; sucursal: SucursalEntrada } | { tipo: 'todas' };

async function irAlLoginPorSesionVencida(): Promise<void> {
  await limpiarSesionMuerta();
  salirDelPaso('/auth/login?reason=expired');
}

/** 'HH:MM' de la sede en el formato del idioma (8:00 a. m.). Es una hora de pared, no un instante: sin zona. */
function horaLocal(hora: string, locale: string): string {
  const [h, m] = hora.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1, h, m));
}

/** Nombre del día ('tuesday' → «martes»). 2024-01-01 fue lunes. */
function nombreDia(dia: string, locale: string): string {
  const indice = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(dia);
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1 + Math.max(indice, 0)));
}

function esCampoEditable(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function SeleccionSucursal() {
  const t = useTranslations('accesoSucursal');
  const tc = useTranslations('acceso.comun');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [datos, setDatos] = useState<RespuestaSucursalesEntrada | null>(null);
  const [ultimaId, setUltimaId] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const [error, setError] = useState(false);
  const [rechazada, setRechazada] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const listaRef = useRef<HTMLUListElement>(null);
  // Evita dos POST seguidos (doble clic, Enter + clic) antes de que se pinte «Entrando…».
  const enviando = useRef(false);

  const destino = useMemo(() => destinoTrasLogin(searchParams?.get('dest')), [searchParams]);

  const seguir = useCallback(() => salirDelPaso(destino), [destino]);

  const cargar = useCallback(async () => {
    setError(false);
    setDatos(null);
    try {
      const res = await fetch(RUTA_API, { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) {
        await irAlLoginPorSesionVencida();
        return;
      }
      // Sin organización válida en la sesión: a elegirla otra vez.
      if (res.status === 400 || res.status === 403) {
        salirDelPaso(`/auth/select-organization?dest=${encodeURIComponent(destino)}`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const cuerpo = (await res.json()) as RespuestaSucursalesEntrada;
      // Con una sola sucursal (o ninguna) se entra directo, como antes.
      if (cuerpo.sucursales.length <= 1) {
        seguir();
        return;
      }
      const guardada = getCurrentBranchId();
      setUltimaId(guardada && cuerpo.sucursales.some((s) => s.id === guardada) ? guardada : null);
      setDatos(cuerpo);
    } catch (err) {
      console.error('[select-organization/sucursal] No se pudieron cargar las sucursales:', err);
      setError(true);
    }
  }, [destino, seguir]);

  useEffect(() => {
    // Destino de invitación o alta: este paso no aplica.
    if (destino.startsWith('/auth/')) {
      seguir();
      return;
    }
    void cargar();
  }, [cargar, destino, seguir]);

  const opciones = useMemo<Opcion[]>(() => {
    if (!datos) return [];
    const sucursales = ordenarSucursalesEntrada(datos.sucursales, { ultimaId, texto });
    const lista: Opcion[] = sucursales.map((s) => ({ tipo: 'sucursal', sucursal: s }));
    if (datos.verTodas && !texto.trim()) lista.push({ tipo: 'todas' });
    return lista;
  }, [datos, ultimaId, texto]);

  useEffect(() => {
    setActivo((a) => Math.min(a, Math.max(opciones.length - 1, 0)));
  }, [opciones.length]);

  const elegir = useCallback(
    async (opcion: Opcion | undefined) => {
      if (!opcion || enviando.current) return;
      enviando.current = true;
      const eleccion: EleccionSucursal = opcion.tipo === 'todas' ? TODAS_LAS_SUCURSALES : opcion.sucursal.id;
      setEntrando(true);
      setRechazada(false);
      try {
        const res = await fetch(RUTA_API, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sucursal: eleccion }),
        });
        if (res.status === 401) {
          await irAlLoginPorSesionVencida();
          return;
        }
        if (res.status === 403) {
          // El alcance cambió desde que se cargó la lista: se recarga.
          enviando.current = false;
          setEntrando(false);
          setRechazada(true);
          void cargar();
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        guardarSucursalActiva(eleccion === TODAS_LAS_SUCURSALES ? 'all' : eleccion);
        seguir();
      } catch (err) {
        console.error('[select-organization/sucursal] No se pudo validar la sucursal:', err);
        enviando.current = false;
        setEntrando(false);
        setError(true);
      }
    },
    [cargar, seguir],
  );

  const mover = useCallback(
    (delta: number) => {
      if (opciones.length === 0) return;
      const siguiente = (activo + delta + opciones.length) % opciones.length;
      setActivo(siguiente);
      listaRef.current?.querySelector<HTMLButtonElement>(`button[data-indice="${siguiente}"]`)?.focus();
    },
    [activo, opciones.length],
  );

  // Teclado: 1–9 elige (no mientras se escribe en el buscador), ↑ ↓ mueven,
  // Enter entra a la activa. Sobre un botón o enlace enfocado, Enter es el clic
  // nativo; en el buscador lo resuelve su `onEnter`.
  useEffect(() => {
    if (!datos) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const editable = esCampoEditable(e.target);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mover(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter' && !editable && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
        e.preventDefault();
        void elegir(opciones[activo]);
        return;
      }
      const indice = editable ? null : indiceDeAtajo(e.key);
      if (indice !== null && opciones[indice]) {
        e.preventDefault();
        void elegir(opciones[indice]);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [activo, datos, elegir, mover, opciones]);

  const otraCuenta = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      salirDelPaso('/auth/login');
    }
  };

  const textoHorario = (h: EstadoHorario | null): string | null => {
    if (!h || h.abierta || !h.abre) return null;
    const hora = horaLocal(h.abre.hora, locale);
    return h.abre.dia ? t('abreDia', { dia: nombreDia(h.abre.dia, locale), hora }) : t('abreHoy', { hora });
  };

  if (error) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('titulo')}
          aviso={<AvisoAcceso tono="error">{t('error')}</AvisoAcceso>}
          pie={<p className="text-center"><Enlace href="/auth/login">{tc('volverAlLogin')}</Enlace></p>}
        >
          <button type="button" className={clasesBoton({ anchoCompleto: true })} onClick={() => void cargar()}>
            {tc('reintentar')}
          </button>
          <button type="button" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })} onClick={seguir}>
            {t('entrarSinElegir')}
          </button>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  if (!datos || entrando) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={tc('entrando')}
          descripcion={tc('entrandoDescripcion')}
          centrado
          icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />}
        />
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        ancho="ancha"
        titulo={t('titulo')}
        descripcion={t('descripcion', { organizacion: datos.organizacion.nombre, total: datos.sucursales.length })}
        aviso={rechazada ? <AvisoAcceso tono="error">{t('rechazada')}</AvisoAcceso> : undefined}
        pie={
          <p className="text-center text-[13px] text-fg-secondary">
            {t('noEsTuCuenta')}{' '}
            <button type="button" onClick={otraCuenta} className="font-medium text-link underline-offset-4 hover:underline">
              {t('entrarConOtra')}
            </button>
          </p>
        }
      >
        {datos.sucursales.length >= MINIMO_BUSCADOR && (
          <SearchInput
            value={texto}
            onChange={setTexto}
            onValueChange={(v) => {
              setTexto(v);
              setActivo(0);
            }}
            onEnter={() => {
              void elegir(opciones[activo]);
              return true;
            }}
            placeholder={t('buscar')}
            etiqueta={t('buscar')}
            autoFocus
          />
        )}
        <ul ref={listaRef} className="flex max-h-[420px] flex-col gap-2 overflow-y-auto" aria-label={t('titulo')}>
          {opciones.length === 0 && <li className="py-6 text-center text-sm text-fg-secondary">{t('sinResultados', { texto })}</li>}
          {opciones.map((opcion, i) => {
            const atajo = i < 9 ? String(i + 1) : undefined;
            if (opcion.tipo === 'todas') {
              return (
                <li key="todas">
                  <TarjetaOrganizacion
                    nombre={t('todas')}
                    detalle={t('todasDetalle')}
                    insignias={[
                      ...(datos.rol ? [{ texto: datos.rol, tono: 'info' } as const] : []),
                      { texto: t('resumen'), tono: 'marca' },
                    ]}
                    atajo={atajo}
                    destacada={i === activo}
                    etiqueta={t('entrarA', { nombre: t('todas') })}
                    indice={i}
                    onEnfocar={() => setActivo(i)}
                    onElegir={() => void elegir(opcion)}
                  />
                </li>
              );
            }
            const s = opcion.sucursal;
            const detalle = [
              s.ciudad,
              s.direccion,
              textoHorario(s.horario),
              s.cajaAbierta ? t('cajaAbierta', { id: s.cajaAbierta }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const insignias: InsigniaTarjeta[] = [];
            if (datos.rol) insignias.push({ texto: datos.rol, tono: 'info' });
            if (s.horario) insignias.push(s.horario.abierta ? { texto: t('abierta'), tono: 'exito' } : { texto: t('cerrada'), tono: 'neutro' });
            const ultima = s.id === ultimaId;
            return (
              <li key={s.id}>
                <TarjetaOrganizacion
                  nombre={s.nombre}
                  detalle={detalle || undefined}
                  distintivo={ultima ? t('ultimaUsada') : undefined}
                  estrellaFija={ultima}
                  insignias={insignias}
                  atajo={atajo}
                  destacada={i === activo}
                  etiqueta={t('entrarA', { nombre: s.nombre })}
                  indice={i}
                  onEnfocar={() => setActivo(i)}
                  onElegir={() => void elegir(opcion)}
                />
              </li>
            );
          })}
        </ul>
        {datos.organizaciones > 1 && (
          <Link
            href={`/auth/select-organization?dest=${encodeURIComponent(destino)}`}
            className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}
          >
            {t('cambiarOrganizacion')}
          </Link>
        )}
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function SeleccionSucursalPage() {
  return (
    <Suspense fallback={null}>
      <SeleccionSucursal />
    </Suspense>
  );
}
