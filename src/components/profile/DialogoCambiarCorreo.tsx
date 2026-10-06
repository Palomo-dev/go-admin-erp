'use client';

/**
 * Diálogo «Cambiar correo electrónico» (Figma 347:12134): correo actual con
 * su estado, el nuevo dos veces y la confirmación en un solo paso. Auth envía
 * el enlace a la dirección nueva; la actual sigue activa hasta que se abra.
 *
 * `reenviarConfirmacion` es la única forma de reenviar el enlace (fila «Correo
 * sin confirmar» de Datos personales y fila «Correo electrónico» de
 * Seguridad): alta sin confirmar → `signup`; cambio pendiente → `email_change`.
 */
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { estadoCorreo, validarCambioCorreo, type ErrorCorreo } from './perfilLogica';
import { CLASE_CAMPO } from './piezasPerfil';

type Traductor = ReturnType<typeof useTranslations>;

export async function reenviarConfirmacion(usuario: User | null, t: Traductor): Promise<void> {
  if (!usuario?.email) return;
  const estado = estadoCorreo(usuario);
  const destino = estado === 'cambio_pendiente' ? usuario.new_email ?? usuario.email : usuario.email;
  const { error } = await supabase.auth.resend(
    estado === 'cambio_pendiente' ? { type: 'email_change', email: destino } : { type: 'signup', email: destino },
  );
  if (error) {
    toast.error(t('toasts.errorTitulo'), { description: t('toasts.errorReenviar') });
    return;
  }
  toast.info(t('toasts.correoEnviadoTitulo'), { description: t('toasts.correoEnviadoDesc', { correo: destino }) });
}

export function DialogoCambiarCorreo({
  abierto,
  onAbiertoChange,
  usuario,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  usuario: User | null;
}) {
  const t = useTranslations('perfil');
  const [nuevo, setNuevo] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const actual = usuario?.email ?? '';
  const estado = estadoCorreo(usuario);
  const error: ErrorCorreo | null = validarCambioCorreo(nuevo, confirmacion, actual);
  // Mientras se escribe solo se avisa de lo que ya es seguro que está mal.
  const errorVisible = intentado || (confirmacion.length > 0 && error === 'no_coinciden') ? error : null;

  const cerrar = (v: boolean) => {
    onAbiertoChange(v);
    if (!v) {
      setNuevo('');
      setConfirmacion('');
      setIntentado(false);
    }
  };

  const enviar = async () => {
    setIntentado(true);
    if (error) return;
    setEnviando(true);
    const destino = nuevo.trim().toLowerCase();
    try {
      const { error: errAuth } = await supabase.auth.updateUser({ email: destino });
      if (errAuth) throw errAuth;
      toast.info(t('toasts.correoEnviadoTitulo'), {
        description: t('toasts.correoEnviadoDesc', { correo: destino }),
        action: { label: t('correo.reenviar'), onClick: () => void supabase.auth.resend({ type: 'email_change', email: destino }) },
      });
      cerrar(false);
    } catch {
      toast.error(t('toasts.errorTitulo'), { description: t('toasts.errorCorreo') });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={t('correo.dialogoTitulo')}
      descripcion={t('correo.dialogoDescripcion')}
      ancho={520}
      primario={{ etiqueta: t('correo.enviar'), onClick: () => void enviar(), cargando: enviando }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('correo.actual')}</span>
          <p className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-fg-secondary">
            <span className="min-w-0 break-all">{actual}</span>
            {estado !== 'confirmado' && (
              <StatusBadge estado={estado} etiqueta={t(`correo.estado.${estado}`)} tono="advertencia" apariencia="suave" />
            )}
          </p>
        </div>
        <FormField etiqueta={t('correo.nuevo')} obligatorio error={errorVisible === 'invalido' || errorVisible === 'igual' ? t(`correo.errores.${errorVisible}`) : null}>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder={t('correo.placeholderNuevo')}
            className={CLASE_CAMPO}
          />
        </FormField>
        <FormField etiqueta={t('correo.confirmar')} obligatorio error={errorVisible === 'no_coinciden' ? t('correo.errores.no_coinciden') : null}>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder={t('correo.placeholderConfirmar')}
            className={CLASE_CAMPO}
          />
        </FormField>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialogo>
  );
}
