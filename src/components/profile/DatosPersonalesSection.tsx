'use client';

/**
 * «Mi perfil › Datos personales» (Figma 344:9281, §A.1).
 *
 * - Nombre y apellidos en dos campos (antes era un «Nombre completo» que se
 *   partía por el primer espacio: «María José Gómez» quedaba con apellido
 *   «José Gómez»).
 * - Correo de solo lectura con «Cambiar» (diálogo 347:12134) y, si Auth dice
 *   que no está confirmado o hay un cambio pendiente, el aviso con «Reenviar».
 * - Teléfono con el `PhoneInput` único (bandera y validación por país).
 * - Cargo de solo lectura: lo asigna la organización
 *   (`organization_members.job_position_id → job_positions.name`).
 * - Los campos se editan directamente; «Guardar cambios» solo se activa si
 *   hay algo distinto y «Cancelar» vuelve a lo guardado.
 *
 * El idioma se movió a Preferencias (misma `guardarIdiomaPreferido`).
 */
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { PhoneInput, mensajeErrorTelefono } from '@/components/kit/PhoneInput';
import { FormSection } from '@/components/kit/FormSection';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { DialogoCambiarCorreo, reenviarConfirmacion } from './DialogoCambiarCorreo';
import { estadoCorreo, hayCambios, normalizarDatos, type DatosPersonales } from './perfilLogica';
import { CLASE_CAMPO } from './piezasPerfil';

export interface PerfilDatos {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}

interface DatosPersonalesSectionProps {
  profile: PerfilDatos | null;
  user: User | null;
  cargo?: string | null;
  onProfileUpdated: (cambios: { first_name: string; last_name: string; phone: string | null }) => void;
}

const desdePerfil = (p: PerfilDatos | null): DatosPersonales => ({
  nombre: p?.first_name ?? '',
  apellidos: p?.last_name ?? '',
  telefono: p?.phone ?? '',
});

export default function DatosPersonalesSection({ profile, user, cargo, onProfileUpdated }: DatosPersonalesSectionProps) {
  const t = useTranslations('perfil');
  const [original, setOriginal] = useState<DatosPersonales>(() => desdePerfil(profile));
  const [datos, setDatos] = useState<DatosPersonales>(() => desdePerfil(profile));
  const [guardando, setGuardando] = useState(false);
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [dialogoCorreo, setDialogoCorreo] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  // Si el perfil llega o cambia desde fuera (recarga), se toma como base.
  useEffect(() => {
    const base = desdePerfil(profile);
    setOriginal(base);
    setDatos(base);
  }, [profile]);

  const cambiado = hayCambios(datos, original);
  const estado = estadoCorreo(user);

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!user || !cambiado) return;
    const errTel = mensajeErrorTelefono(datos.telefono);
    if (errTel) {
      setErrorTelefono(errTel);
      return;
    }
    setGuardando(true);
    const cambios = normalizarDatos(datos);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ ...cambios, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      const base = { nombre: cambios.first_name, apellidos: cambios.last_name, telefono: cambios.phone ?? '' };
      setOriginal(base);
      setDatos(base);
      onProfileUpdated(cambios);
      toast.success(t('toasts.datosTitulo'), { description: t('toasts.datosDesc') });
    } catch {
      toast.error(t('toasts.errorTitulo'), {
        description: t('toasts.errorRed'),
        action: { label: t('reintentar'), onClick: () => void guardar() },
      });
    } finally {
      setGuardando(false);
    }
  };

  const reenviar = async () => {
    setReenviando(true);
    try {
      await reenviarConfirmacion(user, t);
    } finally {
      setReenviando(false);
    }
  };

  return (
    <>
      <FormSection titulo={t('datos.titulo')} descripcion={t('datos.descripcion')} id="perfil-datos">
        <form onSubmit={guardar} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('datos.nombre')}>
              <input
                autoComplete="given-name"
                value={datos.nombre}
                onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
                disabled={guardando}
                className={CLASE_CAMPO}
              />
            </FormField>
            <FormField etiqueta={t('datos.apellidos')}>
              <input
                autoComplete="family-name"
                value={datos.apellidos}
                onChange={(e) => setDatos((d) => ({ ...d, apellidos: e.target.value }))}
                disabled={guardando}
                className={CLASE_CAMPO}
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField etiqueta={t('datos.correo')} className="flex-1">
              <input type="email" value={user?.email ?? ''} readOnly aria-readonly="true" className={`${CLASE_CAMPO} bg-subtle text-fg-secondary`} />
            </FormField>
            <button
              type="button"
              onClick={() => setDialogoCorreo(true)}
              className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'h-12 w-full sm:h-10 sm:w-auto' })}
            >
              {t('correo.cambiar')}
            </button>
          </div>

          {estado !== 'confirmado' && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 self-start rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-text"
            >
              <span className="font-medium">
                {estado === 'cambio_pendiente' ? t('correo.pendienteA', { correo: user?.new_email ?? '' }) : t('correo.estado.sin_confirmar')}
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => void reenviar()}
                disabled={reenviando}
                className="rounded font-semibold text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              >
                {t('correo.reenviar')}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('datos.telefono')} error={errorTelefono}>
              {(campo) => (
                <PhoneInput
                  id={campo.id}
                  value={datos.telefono}
                  onChange={(v) => {
                    setErrorTelefono(null);
                    setDatos((d) => ({ ...d, telefono: v }));
                  }}
                  disabled={guardando}
                />
              )}
            </FormField>
            <FormField etiqueta={t('datos.cargo')} ayuda={t('datos.cargoAyuda')}>
              <input value={cargo ?? t('datos.sinCargo')} readOnly aria-readonly="true" className={`${CLASE_CAMPO} bg-subtle text-fg-secondary`} />
            </FormField>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setDatos(original);
                setErrorTelefono(null);
              }}
              disabled={!cambiado || guardando}
              className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'h-12 sm:h-10' })}
            >
              {t('cancelar')}
            </button>
            <button
              type="submit"
              disabled={!cambiado || guardando}
              aria-busy={guardando || undefined}
              className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'h-12 sm:h-10' })}
            >
              {guardando ? t('guardando') : t('datos.guardar')}
            </button>
          </div>
        </form>
      </FormSection>

      <DialogoCambiarCorreo abierto={dialogoCorreo} onAbiertoChange={setDialogoCorreo} usuario={user} />
    </>
  );
}
