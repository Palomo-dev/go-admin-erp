'use client';

/**
 * Verificación — el enlace falló / enlace reenviado. UNA sola pantalla neutra
 * con dos estados (R9; Figma sección 18, filas 6 y 6b; docs/design/AUTH-ACCESO-V2.md
 * §11 y §13). `/auth/verify/resent` redirige aquí con `?estado=reenviado`.
 *
 * Respuesta uniforme: lo que se muestre no depende de si el correo tiene una
 * invitación o una confirmación pendiente (39999d0f y decisión v2-6). El
 * correo de la URL se muestra enmascarado.
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link2Off, Loader2, MailCheck } from 'lucide-react';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { EscenaAcceso, TarjetaAcceso, AvisoAcceso, IconoDestacado, Enlace } from '@/components/kit/acceso';
import { enmascararCorreoVisible } from '@/lib/auth/avisosAcceso';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FailedContent() {
  const t = useTranslations('acceso.verificar');
  const tc = useTranslations('acceso.comun');
  const params = useSearchParams();
  const tipo = params?.get('type') || 'magiclink';
  const [estado, setEstado] = useState<'formulario' | 'reenviado'>(params?.get('estado') === 'reenviado' ? 'reenviado' : 'formulario');
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(enmascararCorreoVisible(params?.get('email')));
  const [email, setEmail] = useState('');
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(false);

  const reenviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const correo = email.trim().toLowerCase();
    if (!CORREO_RE.test(correo)) {
      setErrorCorreo(tc('correoInvalido'));
      return;
    }
    setErrorCorreo(null);
    setEspera(false);
    setEnviando(true);
    try {
      // signup → confirmación de la cuenta; magiclink / invite → enlace de la invitación.
      const res =
        tipo === 'signup'
          ? await fetch('/api/auth/reenviar-confirmacion', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: correo }),
            })
          : await fetch('/api/auth/invite/resend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: correo, origin: window.location.origin }),
            });
      if (res.status === 429) {
        setEspera(true);
        return;
      }
      setCorreoEnviado(enmascararCorreoVisible(correo));
      setEstado('reenviado');
    } catch {
      setCorreoEnviado(enmascararCorreoVisible(correo));
      setEstado('reenviado');
    } finally {
      setEnviando(false);
    }
  };

  const pie = <p className="text-center"><Enlace href="/auth/login">{tc('volverAlLogin')}</Enlace></p>;

  if (estado === 'reenviado') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('reenviadoTitulo')}
          descripcion={correoEnviado ? t('reenviado', { correo: correoEnviado }) : t('reenviadoSinCorreo')}
          centrado
          icono={<IconoDestacado icono={MailCheck} tono="exito" />}
          pie={pie}
        />
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        titulo={t('fallidoTitulo')}
        descripcion={t('fallido')}
        icono={<IconoDestacado icono={Link2Off} tono="advertencia" />}
        aviso={espera ? <AvisoAcceso tono="advertencia">{t('espera')}</AvisoAcceso> : undefined}
        pie={pie}
      >
        <form className="flex flex-col gap-4" onSubmit={reenviar} noValidate>
          <FormField etiqueta={t('correo')} obligatorio error={errorCorreo}>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg"
              placeholder="nombre@empresa.com"
            />
          </FormField>
          <button type="submit" disabled={enviando} className={clasesBoton({ anchoCompleto: true })}>
            {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {enviando ? t('reenviando') : t('reenviar')}
          </button>
        </form>
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function VerifyFailedPage() {
  return (
    <Suspense fallback={null}>
      <FailedContent />
    </Suspense>
  );
}
