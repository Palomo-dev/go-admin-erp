'use client';

/**
 * Restablecer contraseña — acceso v3 (Figma sección 18, filas 5, 5b y 5c;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * Solo con una sesión abierta desde el enlace del correo (R8): lo decide el
 * servidor (`/api/auth/restablecer`). Política única con medidor (10
 * caracteres, no filtrada, distinta del correo), «Cerrar la sesión en mis
 * otros dispositivos» y, al terminar, botón explícito «Ir a iniciar sesión».
 */
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { clasesBoton } from '@/components/kit/botonClases';
import { Checkbox } from '@/components/ui/checkbox';
import {
  EscenaAcceso,
  TarjetaAcceso,
  CampoContrasena,
  MedidorFortaleza,
  useEvaluacionContrasena,
  AvisoAcceso,
  IconoDestacado,
  Enlace,
} from '@/components/kit/acceso';
import { CLAVE_MOTIVO, type MotivoRechazo } from '@/lib/auth/politicaContrasena';

type Estado = 'cargando' | 'formulario' | 'vencido' | 'exito';

function ResetPasswordContent() {
  const t = useTranslations('acceso.restablecer');
  const tc = useTranslations('acceso.comun');
  const tp = useTranslations('acceso.contrasena');
  const [estado, setEstado] = useState<Estado>('cargando');
  const [correo, setCorreo] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cerrarOtras, setCerrarOtras] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null);
  const evaluacion = useEvaluacionContrasena(password, correo);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // Espera a que el cliente canjee el `?code=` del enlace (PKCE) si lo hay.
        const { data } = await supabase.auth.getSession();
        if (!vivo) return;
        setCorreo(data.session?.user?.email ?? null);
        const res = await fetch('/api/auth/restablecer', { cache: 'no-store' });
        const { permitido } = (await res.json()) as { permitido?: boolean };
        if (vivo) setEstado(permitido ? 'formulario' : 'vencido');
      } catch {
        if (vivo) setEstado('vencido');
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorConfirmar(null);
    if (!evaluacion.valida) {
      setError(tp(!evaluacion.requisitos.longitud ? 'errorLongitud' : !evaluacion.requisitos.distintaDelCorreo ? 'errorIgualCorreo' : 'errorFiltrada'));
      return;
    }
    if (password !== confirmar) {
      setErrorConfirmar(tp('errorConfirmacion'));
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch('/api/auth/restablecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, cerrarOtras }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { codigo?: string };
      if (res.ok) {
        // La sesión del enlace se cierra aquí: se entra con la contraseña nueva.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setEstado('exito');
        return;
      }
      if (cuerpo.codigo === 'enlace_vencido') {
        setEstado('vencido');
        return;
      }
      if (cuerpo.codigo && cuerpo.codigo in CLAVE_MOTIVO) {
        setError(tp(CLAVE_MOTIVO[cuerpo.codigo as MotivoRechazo]));
        return;
      }
      setError(t('error'));
    } catch {
      setError(t('error'));
    } finally {
      setGuardando(false);
    }
  };

  if (estado === 'cargando') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso titulo={tc('cargando')} centrado icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />} />
      </EscenaAcceso>
    );
  }

  if (estado === 'vencido') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('vencidoTitulo')}
          descripcion={t('vencido')}
          centrado
          icono={<IconoDestacado icono={Clock} tono="advertencia" />}
          pie={<p className="text-center"><Enlace href="/auth/login">{tc('volverAlLogin')}</Enlace></p>}
        >
          <Link href="/auth/forgot-password" className={clasesBoton({ anchoCompleto: true })}>
            {t('pedirOtro')}
          </Link>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  if (estado === 'exito') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso titulo={t('exitoTitulo')} descripcion={t('exito')} centrado icono={<IconoDestacado icono={CheckCircle2} tono="exito" />}>
          <Link href="/auth/login?success=password-updated" className={clasesBoton({ anchoCompleto: true })}>
            {tc('irAlLogin')}
          </Link>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        aviso={error ? <AvisoAcceso tono="error">{error}</AvisoAcceso> : undefined}
        pie={<p className="text-center"><Enlace href="/auth/login">{tc('volverAlLogin')}</Enlace></p>}
      >
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          {/* Campo oculto para que el gestor de contraseñas asocie la nueva al correo. */}
          {correo && <input type="email" name="username" autoComplete="username" value={correo} readOnly hidden />}
          <CampoContrasena
            etiqueta={t('nueva')}
            valor={password}
            onValor={setPassword}
            modo="nueva"
            obligatorio
            autoFocus
            debajo={<MedidorFortaleza evaluacion={evaluacion} />}
          />
          <CampoContrasena
            etiqueta={tc('confirmarContrasena')}
            valor={confirmar}
            onValor={(v) => {
              setConfirmar(v);
              setErrorConfirmar(null);
            }}
            modo="nueva"
            name="confirm-password"
            obligatorio
            error={errorConfirmar}
          />
          <div className="flex items-center gap-2">
            <Checkbox id="cerrar-otras" checked={cerrarOtras} onCheckedChange={(v) => setCerrarOtras(v === true)} />
            <label htmlFor="cerrar-otras" className="cursor-pointer text-[13px] text-fg">
              {t('cerrarOtras')}
            </label>
          </div>
          <button type="submit" disabled={guardando} className={clasesBoton({ anchoCompleto: true })}>
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {guardando ? t('guardando') : t('guardar')}
          </button>
        </form>
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
