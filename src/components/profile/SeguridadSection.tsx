'use client';

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { EmailConfirmedGate, EmailConfirmedWarning } from '@/components/auth/EmailConfirmedGate';
import { Dialogo } from '@/components/kit/Dialogo';
import { CampoContrasena, MedidorFortaleza, useEvaluacionContrasena } from '@/components/kit/acceso';
import { Checkbox } from '@/components/ui/checkbox';
import { CLAVE_MOTIVO, type MotivoRechazo } from '@/lib/auth/politicaContrasena';

interface MfaMethod {
  id: string;
  factor_type: string;
  status: string;
  created_at: string;
}

interface SeguridadSectionProps {
  user: User | null;
  /**
   * 2FA oculto (acceso v3, decisión v2-12): el login nunca pedía el segundo
   * factor, así que el interruptor prometía una protección que no existía.
   * Las props se conservan para no tocar la página del Perfil.
   */
  mfaMethods?: MfaMethod[];
  onMfaUpdated?: (methods: MfaMethod[]) => void;
}

/**
 * Perfil › Seguridad (acceso v3, fase 5). El cambio de contraseña va por
 * `POST /api/auth/contrasena`: la actual se comprueba en el servidor con
 * límite por usuario y la nueva cumple la política única (10 caracteres,
 * distinta del correo, no filtrada), la misma del registro y de restablecer.
 */
export default function SeguridadSection({ user }: SeguridadSectionProps) {
  const t = useTranslations('perfilSeguridad');
  const tp = useTranslations('acceso.contrasena');
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cerrarOtras, setCerrarOtras] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const evaluacion = useEvaluacionContrasena(nueva, user?.email);

  const confirmacionMala = confirmacion.length > 0 && confirmacion !== nueva;
  const puedeGuardar = !!actual && evaluacion.valida && !!confirmacion && !confirmacionMala && !cargando;

  const reiniciar = () => {
    setActual('');
    setNueva('');
    setConfirmacion('');
    setCerrarOtras(true);
    setError(null);
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/contrasena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual, nueva, cerrarOtras }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { ok?: boolean; codigo?: string };
      if (res.ok && cuerpo.ok) {
        toast.success(t('actualizada'));
        setAbierto(false);
        reiniciar();
        return;
      }
      const codigo = cuerpo.codigo ?? 'inesperado';
      if (codigo in CLAVE_MOTIVO) setError(tp(CLAVE_MOTIVO[codigo as MotivoRechazo]));
      else if (codigo === 'actual_incorrecta') setError(t('errorActual'));
      else if (codigo === 'igual_a_la_actual') setError(t('errorIgualActual'));
      else if (codigo === 'demasiadas') setError(t('errorDemasiadas'));
      else setError(t('errorInesperado'));
    } catch {
      setError(t('errorInesperado'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('titulo')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('descripcion')}</p>
      </div>

      <div className="p-4 mb-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50">
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-start">
            <Lock className="w-5 h-5 mt-0.5 text-gray-500 dark:text-gray-400 mr-3" aria-hidden="true" />
            <div>
              <h3 className="font-medium text-gray-800 dark:text-gray-200">{t('contrasenaTitulo')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('contrasenaDescripcion')}</p>
            </div>
          </div>
          <EmailConfirmedGate>
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
            >
              {t('cambiar')}
            </button>
          </EmailConfirmedGate>
        </div>
      </div>

      <Dialogo
        abierto={abierto}
        onAbiertoChange={(v) => {
          setAbierto(v);
          if (!v) reiniciar();
        }}
        titulo={t('dialogoTitulo')}
        descripcion={t('dialogoDescripcion')}
        ancho={440}
        primario={{ etiqueta: t('guardar'), onClick: guardar, cargando, deshabilitada: !puedeGuardar }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <EmailConfirmedWarning message={t('confirmaCorreo')} />
          <CampoContrasena
            id="contrasena-actual"
            etiqueta={t('actual')}
            valor={actual}
            onValor={(v) => {
              setActual(v);
              setError(null);
            }}
            modo="actual"
            obligatorio
            autoFocus
          />
          <CampoContrasena
            id="contrasena-nueva"
            etiqueta={t('nueva')}
            valor={nueva}
            onValor={(v) => {
              setNueva(v);
              setError(null);
            }}
            modo="nueva"
            obligatorio
            debajo={<MedidorFortaleza evaluacion={evaluacion} />}
          />
          <CampoContrasena
            id="contrasena-confirmacion"
            etiqueta={t('confirmar')}
            valor={confirmacion}
            onValor={(v) => {
              setConfirmacion(v);
              setError(null);
            }}
            modo="nueva"
            name="confirm-password"
            obligatorio
            error={confirmacionMala ? tp('errorConfirmacion') : null}
          />
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Checkbox checked={cerrarOtras} onCheckedChange={(v) => setCerrarOtras(v === true)} className="mt-0.5" />
            <span>{t('cerrarOtras')}</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {/* Enter en cualquier campo envía el formulario. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Dialogo>
    </div>
  );
}
