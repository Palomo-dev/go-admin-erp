'use client';

/**
 * Olvidé mi contraseña — acceso v3 (Figma sección 18, filas 4 y 4b;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * Respuesta NEUTRA (decisión v2-6): siempre «si existe una cuenta con ese
 * correo, te enviamos un enlace», también para cuentas de Google o sin
 * confirmar. Antes se revelaba «esta cuenta está registrada con Google» (RPC
 * `get_auth_provider_by_email`, abierta a anon) y «cuenta no verificada». La
 * única respuesta distinta es la espera por demasiados envíos, que no depende
 * de la cuenta.
 *
 * Se sigue pidiendo desde el navegador (`resetPasswordForEmail`, flujo PKCE:
 * el verificador vive en este navegador) con reenvío a los 60 s.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, MailCheck } from 'lucide-react';
import { resetPassword } from '@/lib/supabase/config';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { EscenaAcceso, TarjetaAcceso, AvisoAcceso, IconoDestacado, PieEnlace, Enlace } from '@/components/kit/acceso';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESPERA_REENVIO_S = 60;

/** ¿El error es solo de límite de envíos? (lo único que se distingue). */
function esLimite(error: unknown): boolean {
  const m = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  const status = (error as { status?: number } | null)?.status;
  return status === 429 || m.includes('rate limit') || m.includes('demasiados');
}

export default function ForgotPasswordPage() {
  const t = useTranslations('acceso.recuperar');
  const tc = useTranslations('acceso.comun');
  const [email, setEmail] = useState('');
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [espera, setEspera] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearInterval(temporizador.current);
  }, []);

  const contar = () => {
    setSegundos(ESPERA_REENVIO_S);
    if (temporizador.current) clearInterval(temporizador.current);
    temporizador.current = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1 && temporizador.current) clearInterval(temporizador.current);
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const correo = email.trim();
    if (!CORREO_RE.test(correo)) {
      setErrorCorreo(tc('correoInvalido'));
      return;
    }
    setErrorCorreo(null);
    setEspera(false);
    setEnviando(true);
    try {
      const { error } = await resetPassword(correo);
      if (error && esLimite(error)) {
        setEspera(true);
        return;
      }
      // Cualquier otro caso (cuenta inexistente, de Google, sin confirmar…) se
      // responde igual: no se revela nada de la cuenta.
      setEnviado(true);
      contar();
    } catch {
      setEnviado(true);
      contar();
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('enviadoTitulo')}
          descripcion={t('enviado', { correo: email.trim() })}
          centrado
          icono={<IconoDestacado icono={MailCheck} />}
          aviso={espera ? <AvisoAcceso tono="advertencia">{t('espera')}</AvisoAcceso> : <AvisoAcceso tono="info">{t('google')}</AvisoAcceso>}
          pie={<p className="text-center"><Enlace href="/auth/login">{tc('volverAlLogin')}</Enlace></p>}
        >
          <button
            type="button"
            onClick={() => enviar()}
            disabled={segundos > 0 || enviando}
            className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}
          >
            {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {segundos > 0 ? t('reenviarEn', { segundos }) : t('reenviar')}
          </button>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        aviso={espera ? <AvisoAcceso tono="advertencia">{t('espera')}</AvisoAcceso> : undefined}
        pie={<PieEnlace enlace={tc('volverAlLogin')} href="/auth/login" />}
      >
        <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
          <FormField etiqueta={tc('correo')} obligatorio error={errorCorreo}>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg"
              placeholder="nombre@empresa.com"
            />
          </FormField>
          <button type="submit" disabled={enviando} className={clasesBoton({ anchoCompleto: true })}>
            {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {enviando ? t('enviando') : t('enviar')}
          </button>
        </form>
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}
