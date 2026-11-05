'use client';

/**
 * Registro — pasos 1 y 2 de 6: «Tu cuenta» y «Confirma tu correo» (acceso v3,
 * decisión v2-8 / R5 opción B; Figma sección 18, filas 3 y 3f;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * Primero la cuenta y la confirmación del correo; la organización, la
 * sucursal, el plan y la tarjeta van después (/auth/signup/organizacion), ya
 * con el correo confirmado. Antes se pedía todo —tarjeta incluida— y, con la
 * confirmación apagada, se creaba la organización sin confirmar nada.
 *
 * Conserva: `?ref=` (vendedor; se guarda para el alta), Google, y los enlaces
 * viejos `?step=organization&google=true` (redirigen al asistente). El idioma
 * preferido es el del selector de la pantalla (antes un campo con idiomas que
 * la app no tiene) y la foto de perfil se pone en Perfil (antes se subía sin
 * sesión).
 */
import { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { handleGoogleLogin, reenviarConfirmacion } from '@/lib/auth';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  EscenaAcceso,
  TarjetaAcceso,
  ProgresoPasos,
  CampoContrasena,
  MedidorFortaleza,
  useEvaluacionContrasena,
  PhoneField,
  AvisoAcceso,
  DividerTexto,
  BotonProveedor,
  PieEnlace,
  IconoDestacado,
} from '@/components/kit/acceso';
import { CLAVE_MOTIVO, type MotivoRechazo } from '@/lib/auth/politicaContrasena';
import { paisDesdeNavegador, alfa2DeAlfa3 } from '@/lib/utils/paisNavegador';
import { guardarReferido } from '@/lib/auth/referido';
import { guardarParamsRegistro } from '@/lib/auth/registroParams';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESPERA_REENVIO_S = 60;
/** Países del catálogo para el prefijo del teléfono (el catálogo real se lee en el alta). */
const PAISES_TELEFONO = ['COL', 'MEX', 'CHL', 'BRA', 'ESP', 'GBR', 'JPN', 'AUS', 'CAN', 'USA'];

function SignupContent() {
  const t = useTranslations('acceso.registro');
  const tc = useTranslations('acceso.comun');
  const tp = useTranslations('acceso.contrasena');
  const tl = useTranslations('acceso.login');
  const locale = useLocale();
  const params = useSearchParams();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [terminos, setTerminos] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [paso, setPaso] = useState<'cuenta' | 'correo'>('cuenta');
  const [segundos, setSegundos] = useState(0);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [isoTelefono, setIsoTelefono] = useState<string | undefined>(undefined);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);
  const evaluacion = useEvaluacionContrasena(password, correo);

  useEffect(() => {
    // Enlaces viejos del registro de 6 pasos (Google sin organización): al asistente.
    if (params?.get('step') === 'organization') {
      window.location.replace('/auth/signup/organizacion');
      return;
    }
    guardarReferido(params?.get('ref'));
    // Guardar parámetros de plan, cycle y UTM en sessionStorage para que sobrevivan
    // todo el flujo de registro (verificación de correo, OAuth, etc.).
    if (params) guardarParamsRegistro(params);
    setIsoTelefono(alfa2DeAlfa3(paisDesdeNavegador(PAISES_TELEFONO)) ?? undefined);
    // Con sesión abierta (p. ej. Google sin organización) se sigue en el asistente.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/auth/signup/organizacion');
    });
    return () => {
      if (temporizador.current) clearInterval(temporizador.current);
    };
  }, [params]);

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

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAviso(null);
    const err: Record<string, string> = {};
    if (!nombre.trim()) err.nombre = tc('obligatorio');
    if (!apellido.trim()) err.apellido = tc('obligatorio');
    if (!CORREO_RE.test(correo.trim())) err.correo = tc('correoInvalido');
    if (!evaluacion.valida) {
      err.password = tp(!evaluacion.requisitos.longitud ? 'errorLongitud' : !evaluacion.requisitos.distintaDelCorreo ? 'errorIgualCorreo' : 'errorFiltrada');
    }
    if (password !== confirmar) err.confirmar = tp('errorConfirmacion');
    if (!terminos) err.terminos = t('terminosObligatorio');
    setErrores(err);
    if (Object.keys(err).length) return;

    setEnviando(true);
    try {
      const res = await fetch('/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, apellido, correo: correo.trim(), telefono, password, idioma: locale, terminos }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { codigo?: string };
      if (res.ok) {
        setPaso('correo');
        contar();
        return;
      }
      if (res.status === 429) setAviso(tl('demasiadasSolicitudes'));
      else if (cuerpo.codigo && cuerpo.codigo in CLAVE_MOTIVO) setErrores({ password: tp(CLAVE_MOTIVO[cuerpo.codigo as MotivoRechazo]) });
      else setAviso(t('error'));
    } catch {
      setAviso(t('error'));
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    const r = await reenviarConfirmacion(correo.trim());
    setAviso(r.espera ? tl('demasiadasSolicitudes') : null);
    contar();
  };

  if (paso === 'correo') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          pasos={<ProgresoPasos actual={2} total={6} etiqueta={t('pasoCorreo')} />}
          titulo={t('revisaTitulo')}
          descripcion={t('revisa', { correo: correo.trim() })}
          icono={<IconoDestacado icono={MailCheck} />}
          aviso={aviso ? <AvisoAcceso tono="advertencia">{aviso}</AvisoAcceso> : <AvisoAcceso tono="info">{t('revisaSiguiente')}</AvisoAcceso>}
          pie={<PieEnlace pregunta={t('yaConfirmaste')} enlace={tl('entrar')} href="/auth/login" />}
        >
          <div className="flex flex-col gap-2">
            <button type="button" onClick={reenviar} disabled={segundos > 0} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
              {segundos > 0 ? t('reenviarEn', { segundos }) : t('reenviar')}
            </button>
            <button type="button" onClick={() => setPaso('cuenta')} className="text-[13px] font-medium text-link underline-offset-4 hover:underline">
              {t('otroCorreo')}
            </button>
          </div>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        pasos={<ProgresoPasos actual={1} total={6} etiqueta={t('pasoCuenta')} />}
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        aviso={aviso ? <AvisoAcceso tono="error">{aviso}</AvisoAcceso> : undefined}
        pie={<PieEnlace pregunta={t('yaTienesCuenta')} enlace={t('iniciaSesion')} href="/auth/login" />}
      >
        <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('nombre')} obligatorio error={errores.nombre}>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" className="h-10 rounded-lg" />
            </FormField>
            <FormField etiqueta={t('apellido')} obligatorio error={errores.apellido}>
              <Input value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="family-name" className="h-10 rounded-lg" />
            </FormField>
          </div>
          <FormField etiqueta={tc('correo')} obligatorio error={errores.correo} ayuda={t('correoAyuda')}>
            <Input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" inputMode="email" className="h-10 rounded-lg" placeholder="nombre@empresa.com" />
          </FormField>
          <PhoneField etiqueta={t('telefono')} valor={telefono} onValor={setTelefono} defaultIso={isoTelefono} />
          <CampoContrasena
            etiqueta={tc('contrasena')}
            valor={password}
            onValor={setPassword}
            modo="nueva"
            obligatorio
            error={errores.password}
            debajo={<MedidorFortaleza evaluacion={evaluacion} />}
          />
          <CampoContrasena
            etiqueta={tc('confirmarContrasena')}
            valor={confirmar}
            onValor={setConfirmar}
            modo="nueva"
            name="confirm-password"
            obligatorio
            error={errores.confirmar}
          />
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <Checkbox
                id="terminos"
                checked={terminos}
                onCheckedChange={(v) => setTerminos(v === true)}
                aria-invalid={!!errores.terminos}
                aria-describedby={errores.terminos ? 'terminos-error' : undefined}
                className="mt-0.5"
              />
              <label htmlFor="terminos" className="text-[13px] text-fg">
                {t.rich('terminos', {
                  terminos: (c) => (
                    <Link href="/terminos" target="_blank" className="font-medium text-link underline-offset-4 hover:underline">
                      {c}
                    </Link>
                  ),
                  privacidad: (c) => (
                    <Link href="/privacy" target="_blank" className="font-medium text-link underline-offset-4 hover:underline">
                      {c}
                    </Link>
                  ),
                })}
              </label>
            </div>
            {errores.terminos && (
              <p id="terminos-error" role="alert" className="text-xs text-danger-text">
                {errores.terminos}
              </p>
            )}
          </div>
          <button type="submit" disabled={enviando} className={clasesBoton({ anchoCompleto: true })}>
            {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {tc('continuar')}
          </button>
        </form>
        <DividerTexto />
        <BotonProveedor
          proveedor="google"
          texto={t('google')}
          disabled={loadingGoogle}
          onClick={() => handleGoogleLogin({ setLoading: setLoadingGoogle, setError: (m) => m && setAviso(t('error')) })}
        />
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}

