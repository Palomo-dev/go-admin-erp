'use client';

/**
 * «Mi perfil › Sesiones y dispositivos» (Figma 346:20900, §A.3).
 *
 * Fuente: `user_devices` (lo registra `registerUserDevice` al entrar). Cada
 * fila muestra sistema, navegador (columnas `os`/`browser` que ya existían y
 * no se pintaban), una ubicación solo si es legible (nunca coordenadas, según
 * la propuesta 638:385779) y la última actividad en la zona de la organización.
 *
 * Qué cierra sesión de verdad y qué no (sin inventar):
 * - «Cerrar las demás» → `supabase.auth.signOut({ scope: 'others' })`: Auth
 *   revoca todas las demás sesiones de la persona. Además marca las demás
 *   filas como inactivas. Pide confirmación (antes se ejecutaba sin preguntar).
 * - «Quitar» en una fila solo la saca de la lista: hasta el 2026-10-05
 *   `user_devices.session_id` guardaba el id de la persona (305 de 305 filas),
 *   así que no hay forma de cerrar UNA sesión concreta. Por eso no se llama
 *   «Desconectar» como en el diseño. Desde esa fecha `registerUserDevice`
 *   guarda el `session_id` real del JWT; la función que cierra la sesión está
 *   en `supabase/migrations/20261005235900_perfil_sesiones_auth.sql`, SIN
 *   aplicar. Al aplicarla, «Quitar» pasa a llamar
 *   `rpc('fn_cerrar_sesion_dispositivo')` y se renombra «Desconectar».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, Laptop, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { huellaDispositivo } from '@/lib/auth/huellaDispositivo';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { FormSection } from '@/components/kit/FormSection';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { EmptyState } from '@/components/kit/EmptyState';
import { Pagination } from '@/components/kit/Pagination';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { detalleDispositivo, ordenarDispositivos } from './perfilLogica';
import { CLASE_CAMPO } from './piezasPerfil';

interface FilaDispositivo {
  id: string;
  device_name: string | null;
  device_type: string | null;
  device_fingerprint: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  location: string | null;
  is_trusted: boolean | null;
  last_active_at: string | null;
  first_seen_at: string | null;
}

interface Dispositivo {
  id: string;
  nombre: string;
  tipo: string;
  detalle: string[];
  confiable: boolean;
  actual: boolean;
  ultimaActividad: string | null;
}

const COLUMNAS = 'id, device_name, device_type, device_fingerprint, browser, browser_version, os, os_version, location, is_trusted, last_active_at, first_seen_at';

function iconoDe(tipo: string): LucideIcon {
  const t = tipo.toLowerCase();
  if (['smartphone', 'mobile', 'android', 'ios', 'iphone', 'windows phone'].includes(t)) return Smartphone;
  if (['tablet', 'ipad'].includes(t)) return Tablet;
  if (['windows', 'mac', 'macos', 'linux', 'laptop'].includes(t)) return Laptop;
  if (t === 'desktop') return Monitor;
  return Globe;
}

export function DeviceSessions() {
  const t = useTranslations('perfil.sesiones');
  const tp = useTranslations('perfil');
  const { formatDateTime } = useFormatDate();
  const [estado, setEstado] = useState<'cargando' | 'error' | 'listo'>('cargando');
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(10);
  const [cerrarDemas, setCerrarDemas] = useState(false);
  const [aQuitar, setAQuitar] = useState<Dispositivo | null>(null);
  const [aRenombrar, setARenombrar] = useState<Dispositivo | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const userId = sesion.session?.user?.id;
      if (!userId) {
        setDispositivos([]);
        setEstado('listo');
        return;
      }
      const [huella, { data, error }] = await Promise.all([
        huellaDispositivo().catch(() => ''),
        supabase.from('user_devices').select(COLUMNAS).eq('user_id', userId).eq('is_active', true).order('last_active_at', { ascending: false }),
      ]);
      if (error) throw error;
      const filas = (data ?? []) as FilaDispositivo[];
      setDispositivos(
        ordenarDispositivos(
          filas.map((d) => ({
            id: d.id,
            nombre: d.device_name || t('sinNombre'),
            tipo: d.device_type || 'desktop',
            detalle: detalleDispositivo(d),
            confiable: d.is_trusted === true,
            actual: !!huella && d.device_fingerprint === huella,
            ultimaActividad: d.last_active_at ?? d.first_seen_at,
          })),
        ),
      );
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [t]);

  useEffect(() => {
    void cargar();
    // `t` cambia de identidad con el idioma: solo se carga al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = useMemo(() => dispositivos.slice((pagina - 1) * tamano, pagina * tamano), [dispositivos, pagina, tamano]);
  const otros = dispositivos.filter((d) => !d.actual).length;

  const fallo = (): void => {
    toast.error(tp('toasts.errorTitulo'), { description: tp('toasts.errorRed') });
  };

  const alternarConfianza = async (d: Dispositivo) => {
    setOcupado(d.id);
    const { error } = await supabase.from('user_devices').update({ is_trusted: !d.confiable }).eq('id', d.id);
    setOcupado(null);
    if (error) return fallo();
    toast.success(d.confiable ? t('confianzaQuitada') : t('confiado'));
    void cargar();
  };

  const renombrar = async () => {
    if (!aRenombrar || !nombreNuevo.trim()) return;
    setOcupado(aRenombrar.id);
    const { error } = await supabase.from('user_devices').update({ device_name: nombreNuevo.trim().slice(0, 80) }).eq('id', aRenombrar.id);
    setOcupado(null);
    if (error) return fallo();
    toast.success(t('renombrado'));
    setARenombrar(null);
    void cargar();
  };

  const quitar = async (d: Dispositivo) => {
    const { error } = await supabase.from('user_devices').update({ is_active: false, revoked_at: new Date().toISOString() }).eq('id', d.id);
    if (error) return fallo();
    toast.warning(t('quitadoTitulo'), {
      description: t('quitadoDesc', { nombre: d.nombre }),
      action: {
        label: t('deshacer'),
        onClick: async () => {
          await supabase.from('user_devices').update({ is_active: true, revoked_at: null }).eq('id', d.id);
          void cargar();
        },
      },
    });
    void cargar();
  };

  const cerrarLasDemas = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) return fallo();
    const ids = dispositivos.filter((d) => !d.actual).map((d) => d.id);
    if (ids.length > 0) {
      const { error: errFilas } = await supabase
        .from('user_devices')
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .in('id', ids);
      if (errFilas) console.warn('[perfil] sesiones cerradas, pero no se marcaron las filas', errFilas.message);
    }
    toast.success(t('demasCerradasTitulo'), { description: t('demasCerradasDesc') });
    void cargar();
  };

  return (
    <>
      <FormSection titulo={t('titulo')} descripcion={t('descripcion')} id="perfil-sesiones">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warning-text">
                {estado === 'listo' ? t('resumen', { n: dispositivos.length }) : t('resumenSinDatos')}
              </p>
              <p className="text-[13px] text-warning-text">{t('resumenAyuda')}</p>
            </div>
            <button
              type="button"
              onClick={() => setCerrarDemas(true)}
              className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'h-12 w-full sm:h-10 sm:w-auto' })}
            >
              {t('cerrarDemas')}
            </button>
          </div>

          {estado === 'cargando' && (
            <div role="status" aria-live="polite" className="flex flex-col gap-3">
              <span className="sr-only">{t('cargando')}</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
              ))}
            </div>
          )}

          {estado === 'error' && <EmptyState variante="error" compacto titulo={t('error')} onReintentar={() => void cargar()} />}

          {estado === 'listo' && dispositivos.length === 0 && <EmptyState compacto titulo={t('vacioTitulo')} descripcion={t('vacioDesc')} icono={Monitor} />}

          {estado === 'listo' && visibles.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label={t('lista')}>
              {visibles.map((d) => {
                const Icono = iconoDe(d.tipo);
                const actividad = d.ultimaActividad ? t('ultimaActividad', { fecha: formatDateTime(d.ultimaActividad) }) : null;
                return (
                  <li key={d.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
                        <Icono className="size-[18px]" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-medium text-fg">{d.nombre}</h3>
                          {d.actual && <StatusBadge estado="actual" etiqueta={t('esteDispositivo')} tono="marca" apariencia="contorno" />}
                          {d.confiable && <StatusBadge estado="confiable" etiqueta={t('confiable')} tono="exito" apariencia="suave" />}
                        </div>
                        <p className="mt-0.5 text-xs text-fg-secondary">{[...d.detalle, actividad].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setARenombrar(d);
                          setNombreNuevo(d.nombre);
                        }}
                        className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                      >
                        {t('renombrar')}
                      </button>
                      <button
                        type="button"
                        disabled={ocupado === d.id}
                        onClick={() => void alternarConfianza(d)}
                        className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                      >
                        {d.confiable ? t('quitarConfianza') : t('confiar')}
                      </button>
                      {!d.actual && (
                        <button type="button" onClick={() => setAQuitar(d)} className={clasesBoton({ variante: 'destructivo', tamano: 'sm' })}>
                          {t('quitar')}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {estado === 'listo' && dispositivos.length > 0 && (
            <>
              <p className="text-xs text-fg-secondary">{t('nota')}</p>
              <Pagination
                pagina={pagina}
                tamano={tamano}
                total={dispositivos.length}
                onPaginaChange={setPagina}
                onTamanoChange={(n) => {
                  setTamano(n);
                  setPagina(1);
                }}
                sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
              />
            </>
          )}
        </div>
      </FormSection>

      <ConfirmDialog
        open={cerrarDemas}
        onOpenChange={setCerrarDemas}
        title={t('confirmarCerrarTitulo')}
        description={otros > 0 ? t('confirmarCerrarDesc', { n: otros }) : t('confirmarCerrarDescSinLista')}
        confirmLabel={t('cerrarDemas')}
        cancelLabel={tp('cancelar')}
        variant="destructive"
        onConfirm={cerrarLasDemas}
      />

      <ConfirmDialog
        open={!!aQuitar}
        onOpenChange={(v) => !v && setAQuitar(null)}
        title={t('confirmarQuitarTitulo', { nombre: aQuitar?.nombre ?? '' })}
        description={t('confirmarQuitarDesc')}
        confirmLabel={t('quitar')}
        cancelLabel={tp('cancelar')}
        variant="destructive"
        onConfirm={async () => {
          if (aQuitar) await quitar(aQuitar);
        }}
      />

      <Dialogo
        abierto={!!aRenombrar}
        onAbiertoChange={(v) => !v && setARenombrar(null)}
        titulo={t('renombrarTitulo')}
        descripcion={t('renombrarDesc')}
        ancho={440}
        primario={{ etiqueta: tp('guardar'), onClick: () => void renombrar(), cargando: ocupado === aRenombrar?.id, deshabilitada: !nombreNuevo.trim() }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void renombrar();
          }}
        >
          <FormField etiqueta={t('nombreDispositivo')}>
            <input autoFocus maxLength={80} value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder={t('nombrePlaceholder')} className={CLASE_CAMPO} />
          </FormField>
        </form>
      </Dialogo>
    </>
  );
}
