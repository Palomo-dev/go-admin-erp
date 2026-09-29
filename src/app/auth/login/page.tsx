'use client';

/**
 * Iniciar sesión — acceso v3 (Figma sección 18 «Acceso v3 — V1 con el viajero»,
 * filas 1 a 1d; docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * Conserva todo lo de antes (matriz de paridad §12.2): correo y contraseña,
 * «Recordar mi correo» (solo el correo), Google, Microsoft y biometría en la
 * app, recuperación de la sesión vencida (`?reason=expired`), `?addAccount=1`,
 * `redirectTo` (ahora validado), el modal de geolocalización y el registro del
 * dispositivo. Cambia: un único mensaje de credenciales, bloqueo por intentos
 * con hora de desbloqueo, catálogo único de avisos de la URL y, al entrar, el
 * selector único de organización (se salta si solo hay una).
 */
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  iniciarSesionConCorreo,
  getUserOrganizations,
  decidirOrganizacion,
  enlaceDeInvitacionEnviado,
  reenviarConfirmacion,
  proceedWithLogin,
  activarOrganizacion,
  handleGoogleLogin,
  handleMicrosoftLogin,
  type ErrorLogin,
} from '@/lib/auth';
import GeolocationModal from '@/components/auth/GeolocationModal';
import { shouldShowGeolocationModal, saveGeolocationPreference } from '@/lib/utils/geolocation';
import { useMobileAuth } from '@/hooks/useMobileAuth';
import { useMobileNative } from '@/hooks/useMobileNative';
import {
  isBiometricAvailable,
  canUseBiometricLogin,
  getBiometricEmail,
  getBiometricRefreshToken,
  saveBiometricCredentials,
  purgeLegacyStoredPassword,
} from '@/lib/services/biometricService';
import { supabase } from '@/lib/supabase/config';
import { destinoInternoSeguro, destinoTrasLogin, registrarIntentoRecuperacion } from '@/lib/auth/recuperacionSesion';
import { avisoDesdeParametros, vieneDeSesionVencida, type AvisoUrl } from '@/lib/auth/avisosAcceso';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  EscenaAcceso,
  TarjetaAcceso,
  CampoContrasena,
  AvisoAcceso,
  DividerTexto,
  BotonProveedor,
  PieEnlace,
  Enlace,
} from '@/components/kit/acceso';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** «Recordarme»: el correo ofuscado como siempre (base64 invertido); nunca la contraseña. */
const ofuscar = (correo: string) => btoa(correo).split('').reverse().join('');
const desofuscar = (valor: string) => atob(valor.split('').reverse().join(''));

type Aviso =
  | { tipo: 'url'; aviso: AvisoUrl }
  | { tipo: 'login'; error: ErrorLogin }
  | { tipo: 'vencida' }
  | { tipo: 'reenviado' }
  | { tipo: 'generico' };

function LoginContent() {
  const t = useTranslations('acceso.login');
  const tc = useTranslations('acceso.comun');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobileApp, authResult, oauthError: mobileOAuthError } = useMobileAuth();
  const { authenticateBiometric } = useMobileNative();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [showGeolocationModal, setShowGeolocationModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const refAviso = useRef<HTMLDivElement>(null);

  // Avisos de la URL (catálogo único) y redirectTo validado.
  useEffect(() => {
    if (!searchParams) return;
    const desdeUrl = avisoDesdeParametros(searchParams);
    if (desdeUrl) setAviso({ tipo: 'url', aviso: desdeUrl });
    const redirectTo = searchParams.get('redirectTo');
    if (redirectTo) sessionStorage.setItem('redirectTo', destinoTrasLogin(redirectTo));
    if (shouldShowGeolocationModal()) {
      const temporizador = setTimeout(() => setShowGeolocationModal(true), 1000);
      return () => clearTimeout(temporizador);
    }
  }, [searchParams]);

  // Sesión vencida (GO-sec 2026-09-24): el middleware manda aquí con
  // reason=expired. getSession() refresca con el refresh token del dispositivo;
  // si hay sesión se vuelve a redirectTo con navegación completa. Un intento
  // por pestaña cada 30 s. Si no se pudo, se avisa (fila 1d del Figma).
  useEffect(() => {
    if (!vieneDeSesionVencida(searchParams)) return;
    if (searchParams?.get('addAccount') === '1') return;
    const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
    if (!registrarIntentoRecuperacion(storage)) {
      setAviso((a) => a ?? { tipo: 'vencida' });
      return;
    }
    const destino = destinoInternoSeguro(searchParams?.get('redirectTo'));
    setEntrando(true);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          window.location.replace(destino);
          return;
        }
        setEntrando(false);
        setAviso((a) => a ?? { tipo: 'vencida' });
      })
      .catch(() => {
        setEntrando(false);
        setAviso((a) => a ?? { tipo: 'vencida' });
      });
  }, [searchParams]);

  // OAuth por deep link (app móvil).
  useEffect(() => {
    if (!isMobileApp) return;
    if (authResult?.success && authResult.next) {
      router.push(authResult.next);
    } else if (authResult && !authResult.success) {
      setAviso({ tipo: 'generico' });
      setLoading(false);
    }
  }, [isMobileApp, authResult, router]);

  useEffect(() => {
    if (isMobileApp && mobileOAuthError) {
      setAviso({ tipo: 'generico' });
      setLoading(false);
    }
  }, [isMobileApp, mobileOAuthError]);

  // Biometría (solo app con hardware y credenciales guardadas).
  useEffect(() => {
    if (!isMobileApp) return;
    let cancelado = false;
    (async () => {
      const disponible = await isBiometricAvailable();
      if (cancelado) return;
      setBiometricAvailable(disponible.available);
      setBiometricType(disponible.biometryType || null);
      if (disponible.available) {
        const puede = await canUseBiometricLogin();
        if (!cancelado) setBiometricEnabled(puede);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [isMobileApp]);

  // Correo recordado; se purga la contraseña que guardaban versiones viejas.
  useEffect(() => {
    const guardado = localStorage.getItem('userEmail');
    if (guardado) {
      try {
        setEmail(desofuscar(guardado));
        setRememberMe(true);
      } catch {
        localStorage.removeItem('userEmail');
      }
    }
    purgeLegacyStoredPassword();
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.split('.')[0].replace('https://', '')
      : '';
    if (projectRef) localStorage.removeItem(`sb-${projectRef}-auth-token`);
  }, []);

  // El aviso nuevo recibe el foco para que el lector de pantalla lo lea.
  useEffect(() => {
    if (aviso && aviso.tipo === 'login') refAviso.current?.focus();
  }, [aviso]);

  /** Tras abrir la sesión: 0 organizaciones → selección vacía; 1 → se entra; 2+ → selector. */
  const continuar = async (userId: string, correo: string) => {
    setEntrando(true);
    try {
      const organizaciones = await getUserOrganizations(userId);
      const decision = decidirOrganizacion(organizaciones);
      if (decision.tipo === 'una') {
        activarOrganizacion(decision.organizacion);
        await proceedWithLogin(rememberMe, correo);
        return;
      }
      if (decision.tipo === 'varias') {
        const destino = destinoTrasLogin(sessionStorage.getItem('redirectTo'));
        await proceedWithLogin(rememberMe, correo, {
          destino: `/auth/select-organization?dest=${encodeURIComponent(destino)}`,
        });
        return;
      }
      if (await enlaceDeInvitacionEnviado(correo)) return;
      const redirectTo = sessionStorage.getItem('redirectTo');
      // Vuelta al asistente de invitación (allí se une a la organización) o al
      // alta de la organización tras confirmar el correo.
      const vuelta = destinoTrasLogin(redirectTo);
      const destino = vuelta.startsWith('/auth/') ? vuelta : '/auth/select-organization';
      await proceedWithLogin(rememberMe, correo, { destino });
    } catch (err) {
      console.error('[login] No se pudo continuar tras iniciar sesión:', err);
      setEntrando(false);
      setAviso({ tipo: 'generico' });
    }
  };

  const onEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!CORREO_RE.test(email.trim())) {
      setErrorCorreo(tc('correoInvalido'));
      return;
    }
    setErrorCorreo(null);
    setAviso(null);
    if (rememberMe) {
      localStorage.setItem('userEmail', ofuscar(email.trim()));
      localStorage.setItem('rememberMe', 'true');
    } else {
      localStorage.removeItem('userEmail');
      localStorage.removeItem('rememberMe');
    }
    localStorage.removeItem('userPassword');
    setLoading(true);
    const resultado = await iniciarSesionConCorreo(email, password);
    setLoading(false);
    if (!resultado.ok) {
      setAviso({ tipo: 'login', error: resultado.error });
      return;
    }
    await continuar(resultado.userId, resultado.email);
  };

  const onBiometricLogin = async () => {
    if (!isMobileApp || !biometricAvailable) return;
    setLoading(true);
    setAviso(null);
    try {
      const verificado = await authenticateBiometric({ reason: t('titulo') });
      if (!verificado?.verified) {
        setAviso({ tipo: 'generico' });
        return;
      }
      const correo = getBiometricEmail();
      const refreshToken = getBiometricRefreshToken();
      if (!correo || !refreshToken) {
        setAviso({ tipo: 'generico' });
        return;
      }
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        setAviso({ tipo: 'generico' });
        return;
      }
      // Los refresh tokens rotan: se guarda el nuevo para el próximo desbloqueo.
      saveBiometricCredentials(correo, data.session.refresh_token);
      await continuar(data.session.user.id, correo);
    } catch (err) {
      console.error('[login] Biometría:', err);
      setAviso({ tipo: 'generico' });
    } finally {
      setLoading(false);
    }
  };

  const erroresOAuth = (m: string | null) => {
    if (m) setAviso({ tipo: 'generico' });
  };

  const onReenviar = async () => {
    setReenviando(true);
    await reenviarConfirmacion(email.trim());
    setReenviando(false);
    setAviso({ tipo: 'reenviado' });
  };

  const horaDesbloqueo = (iso?: string) => {
    if (!iso) return null;
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return null;
    // Hora local del navegador: aún no hay organización (ni su zona horaria).
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(fecha);
  };

  const renderAviso = () => {
    if (!aviso) return null;
    if (aviso.tipo === 'url') {
      return (
        <AvisoAcceso tono={aviso.aviso.tono} titulo={aviso.aviso.titulo ? t(aviso.aviso.titulo) : undefined}>
          {t(aviso.aviso.clave)}
        </AvisoAcceso>
      );
    }
    if (aviso.tipo === 'vencida') {
      return (
        <AvisoAcceso tono="info" titulo={t('sesionVencidaTitulo')}>
          {t('sesionVencida')}
        </AvisoAcceso>
      );
    }
    if (aviso.tipo === 'reenviado') return <AvisoAcceso tono="exito">{t('reenviado')}</AvisoAcceso>;
    if (aviso.tipo === 'generico') return <AvisoAcceso tono="error">{t('errores.generico')}</AvisoAcceso>;
    const { codigo, bloqueadoHasta } = aviso.error;
    if (codigo === 'bloqueado') {
      const hora = horaDesbloqueo(bloqueadoHasta);
      return (
        <AvisoAcceso ref={refAviso} tono="advertencia" titulo={t('bloqueadoTitulo')}>
          {hora ? t('bloqueado', { hora }) : t('bloqueadoMinutos', { minutos: 15 })}
        </AvisoAcceso>
      );
    }
    if (codigo === 'sin_confirmar') {
      return (
        <AvisoAcceso
          ref={refAviso}
          tono="advertencia"
          titulo={t('sinConfirmarTitulo')}
          accion={
            <button type="button" onClick={onReenviar} disabled={reenviando} className="font-medium text-link underline-offset-4 hover:underline disabled:opacity-50">
              {t('reenviar')}
            </button>
          }
        >
          {t('sinConfirmar')}
        </AvisoAcceso>
      );
    }
    const clave = codigo === 'credenciales' ? 'credenciales' : codigo === 'demasiadas' ? 'demasiadasSolicitudes' : 'errorInesperado';
    return (
      <AvisoAcceso ref={refAviso} tono="error">
        {t(clave)}
      </AvisoAcceso>
    );
  };

  if (entrando) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso titulo={tc('entrando')} descripcion={tc('entrandoDescripcion')} centrado icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />} />
      </EscenaAcceso>
    );
  }

  const bloqueado = aviso?.tipo === 'login' && aviso.error.codigo === 'bloqueado';

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        aviso={renderAviso()}
        pie={<PieEnlace pregunta={t('sinCuenta')} enlace={t('crearCuenta')} href="/auth/signup" />}
      >
        <form className="flex flex-col gap-4" onSubmit={onEmailLogin} noValidate>
          <FormField etiqueta={tc('correo')} obligatorio error={errorCorreo}>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg"
              placeholder="nombre@empresa.com"
            />
          </FormField>
          <CampoContrasena etiqueta={tc('contrasena')} valor={password} onValor={setPassword} modo="actual" />
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="recordar-correo" checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
              <label htmlFor="recordar-correo" className="cursor-pointer text-[13px] text-fg">
                {t('recordar')}
              </label>
            </div>
            <Enlace href="/auth/forgot-password">{t('olvide')}</Enlace>
          </div>
          <button type="submit" disabled={loading || bloqueado || !password} className={clasesBoton({ anchoCompleto: true })}>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {loading ? t('entrandoBoton') : t('entrar')}
          </button>
        </form>
        <DividerTexto />
        <div className="flex flex-col gap-2">
          <BotonProveedor proveedor="google" texto={t('google')} disabled={loading} onClick={() => handleGoogleLogin({ setLoading, setError: erroresOAuth })} />
          {/* Microsoft solo en la app: en la web el callback no lo completaba (decisión v2-4). */}
          {isMobileApp && (
            <BotonProveedor proveedor="microsoft" texto={t('microsoft')} disabled={loading} onClick={() => handleMicrosoftLogin({ setLoading, setError: erroresOAuth })} />
          )}
          {isMobileApp && biometricAvailable && biometricEnabled && (
            <button type="button" onClick={onBiometricLogin} disabled={loading} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
              {t('biometrico', { metodo: biometricType === 'faceId' ? t('faceId') : t('huella') })}
            </button>
          )}
        </div>
      </TarjetaAcceso>

      <GeolocationModal
        isOpen={showGeolocationModal}
        onClose={() => {
          if (shouldShowGeolocationModal()) saveGeolocationPreference('denied');
          setShowGeolocationModal(false);
        }}
        onSelection={() => setShowGeolocationModal(false)}
      />
    </EscenaAcceso>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
