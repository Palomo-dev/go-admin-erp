'use client';

/**
 * Diálogos de la autenticación en dos pasos (Figma 347:12179 y 347:12238).
 * El QR y la clave salen de Supabase Auth (`mfa.enroll`), no se dibujan a mano
 * ni se generan aquí: el diseño pedía expresamente no calcar el QR falso ni el
 * botón «Verificar» sin handler del código anterior.
 *
 * Códigos de respaldo: no hay soporte en `@supabase/auth-js` 2.69 (ver
 * `lib/auth/dosPasos.ts`), así que el diálogo 347:12267 no se implementa.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import {
  confirmarAlta,
  desactivar,
  descartarAlta,
  FalloDosPasos,
  iniciarAlta,
  type AltaTotp,
  type ClienteMfa,
} from '@/lib/auth/dosPasos';
import { agruparClave, codigoTotpValido, limpiarCodigoTotp } from './perfilLogica';
import { CLASE_CAMPO } from './piezasPerfil';

/** El cliente real cumple `ClienteMfa`; sus sobrecargas de `enroll` no se dejan asignar tal cual. */
export const clienteMfaNavegador = (): ClienteMfa => supabase.auth.mfa as unknown as ClienteMfa;

function CampoCodigo({ valor, onValor, error, autoFocus }: { valor: string; onValor: (v: string) => void; error?: string | null; autoFocus?: boolean }) {
  const t = useTranslations('perfil.dosPasos');
  return (
    <FormField etiqueta={t('codigo')} ayuda={t('codigoAyuda')} error={error}>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={7}
        autoFocus={autoFocus}
        value={valor}
        onChange={(e) => onValor(limpiarCodigoTotp(e.target.value))}
        placeholder="123456"
        className={`${CLASE_CAMPO} text-center font-mono text-lg tracking-[0.4em] tabular-nums`}
      />
    </FormField>
  );
}

export function DialogoActivarDosPasos({
  abierto,
  onAbiertoChange,
  onActivada,
  cliente = clienteMfaNavegador,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onActivada: () => void;
  cliente?: () => ClienteMfa;
}) {
  const t = useTranslations('perfil.dosPasos');
  const tp = useTranslations('perfil');
  const [alta, setAlta] = useState<AltaTotp | null>(null);
  const [cargando, setCargando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const activada = useRef(false);

  useEffect(() => {
    if (!abierto) return;
    activada.current = false;
    let vivo = true;
    setCargando(true);
    setError(null);
    setCodigo('');
    iniciarAlta(cliente())
      .then((a) => vivo && setAlta(a))
      .catch(() => vivo && setError(t('errorIniciar')))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // Solo al abrir: cada alta crea un factor en Auth, no debe repetirse por un cambio de identidad de `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const cerrar = (v: boolean) => {
    if (!v && alta && !activada.current) void descartarAlta(cliente(), alta.factorId);
    if (!v) setAlta(null);
    onAbiertoChange(v);
  };

  const verificar = async () => {
    if (!alta || !codigoTotpValido(codigo)) {
      setError(t('errorFormato'));
      return;
    }
    setVerificando(true);
    setError(null);
    try {
      await confirmarAlta(cliente(), alta.factorId, codigo);
      activada.current = true;
      toast.success(t('activadaTitulo'), { description: t('activadaDesc') });
      onActivada();
      cerrar(false);
    } catch (e) {
      setError(e instanceof FalloDosPasos && e.codigo === 'codigo' ? t('errorCodigo') : tp('toasts.errorRed'));
    } finally {
      setVerificando(false);
    }
  };

  const copiar = async () => {
    if (!alta) return;
    try {
      await navigator.clipboard.writeText(alta.secreto);
      toast.success(t('claveCopiada'));
    } catch {
      toast.error(t('claveNoCopiada'));
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={t('activarTitulo')}
      descripcion={t('activarDescripcion')}
      icono={ShieldCheck}
      ancho={520}
      primario={{
        etiqueta: t('verificar'),
        onClick: () => void verificar(),
        cargando: verificando,
        deshabilitada: !alta || !codigoTotpValido(codigo),
      }}
    >
      {cargando && (
        <div role="status" className="flex h-48 items-center justify-center gap-2 text-sm text-fg-secondary">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {t('preparando')}
        </div>
      )}
      {alta && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verificar();
          }}
        >
          <div className="flex justify-center">
            {/* SVG en data URI que entrega Supabase Auth: next/image no lo optimiza. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={alta.qr} alt={t('qrAlt')} width={176} height={176} className="size-44 rounded-lg bg-white p-2 ring-1 ring-line" />
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2.5">
            <p className="text-[13px] text-fg-secondary">{t('sinEscanear')}</p>
            <div className="flex items-center justify-between gap-2">
              <code className="min-w-0 break-all font-mono text-sm font-semibold text-fg">{agruparClave(alta.secreto)}</code>
              <button type="button" onClick={() => void copiar()} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('copiar')}
              </button>
            </div>
          </div>
          <CampoCodigo valor={codigo} onValor={(v) => { setCodigo(v); setError(null); }} error={error} autoFocus />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      )}
      {!alta && !cargando && error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </Dialogo>
  );
}

export function DialogoDesactivarDosPasos({
  abierto,
  onAbiertoChange,
  factorId,
  onDesactivada,
  cliente = clienteMfaNavegador,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  factorId: string | null;
  onDesactivada: () => void;
  cliente?: () => ClienteMfa;
}) {
  const t = useTranslations('perfil.dosPasos');
  const tp = useTranslations('perfil');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cerrar = (v: boolean) => {
    onAbiertoChange(v);
    if (!v) {
      setCodigo('');
      setError(null);
    }
  };

  const confirmar = async () => {
    if (!factorId || !codigoTotpValido(codigo)) {
      setError(t('errorFormato'));
      return;
    }
    setTrabajando(true);
    try {
      await desactivar(cliente(), factorId, codigo);
      toast.success(t('desactivadaTitulo'));
      onDesactivada();
      cerrar(false);
    } catch (e) {
      setError(e instanceof FalloDosPasos && e.codigo === 'codigo' ? t('errorCodigo') : tp('toasts.errorRed'));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={t('desactivarTitulo')}
      descripcion={t('desactivarDescripcion')}
      icono={ShieldOff}
      ancho={440}
      primario={{
        etiqueta: t('desactivar'),
        destructiva: true,
        onClick: () => void confirmar(),
        cargando: trabajando,
        deshabilitada: !codigoTotpValido(codigo),
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <CampoCodigo valor={codigo} onValor={(v) => { setCodigo(v); setError(null); }} error={error} autoFocus />
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialogo>
  );
}
