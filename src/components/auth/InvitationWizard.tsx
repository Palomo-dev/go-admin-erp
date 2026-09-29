'use client';

/**
 * Asistente de la invitación — acceso v3 (Figma sección 18, filas 7, 7b y 7c;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13, R11).
 *
 * Dos pasos para una cuenta nueva (tus datos → tu contraseña) y uno para quien
 * ya tiene cuenta (confirmar), dentro de `<form>` (Enter envía), traducido y
 * con la política única de contraseña.
 *
 * Seguridad (commit 39999d0f, no se toca): el estado de la cuenta lo decide el
 * servidor; una cuenta nueva o huérfana se crea en el servidor
 * (/api/auth/accept-invitation, que valida el código en tiempo constante y la
 * contraseña con la política única); una cuenta existente SOLO acepta con su
 * propia sesión (`accept_invitation_atomic` comprueba que el correo de la
 * sesión sea el invitado). La contraseña ya no se cambia desde el navegador
 * (antes `updateUser` con la sesión del enlace, sin política).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { guardarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { mensajeErrorTelefono } from '@/components/ui/phone-input';
import { iniciarSesionConCorreo } from '@/lib/auth/emailAuth';
import { CLAVE_MOTIVO, type MotivoRechazo } from '@/lib/auth/politicaContrasena';
import type { EstadoCuentaInvitacion } from '@/lib/auth/cuentaInvitacion';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import {
  EscenaAcceso,
  TarjetaAcceso,
  ProgresoPasos,
  CampoContrasena,
  MedidorFortaleza,
  useEvaluacionContrasena,
  PhoneField,
  AvisoAcceso,
  IconoDestacado,
} from '@/components/kit/acceso';

export interface InvitationWizardData {
  id: number;
  email: string;
  code: string;
  role_id: number;
  organization_id: number;
  organization_name: string;
  role_name: string;
}

interface InvitationWizardProps {
  inviteData: InvitationWizardData;
  /** Decidido por el SERVIDOR (/api/auth/invite/context). */
  accountState: EstadoCuentaInvitacion;
  /** Correo de la sesión activa en el navegador, o null si no hay. */
  sessionEmail: string | null;
  onComplete: () => void;
}

const normalizar = (e: string | null | undefined) => (e || '').toLowerCase().trim();

export default function InvitationWizard({ inviteData, accountState, sessionEmail, onComplete }: InvitationWizardProps) {
  const t = useTranslations('acceso.invitacion');
  const tc = useTranslations('acceso.comun');
  const tp = useTranslations('acceso.contrasena');
  const esExistente = accountState === 'existente';
  const sesionEsDelInvitado = !!sessionEmail && normalizar(sessionEmail) === normalizar(inviteData.email);
  const [necesitaLogin, setNecesitaLogin] = useState(esExistente && !sesionEsDelInvitado);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const evaluacion = useEvaluacionContrasena(password, inviteData.email);

  // Cuenta existente con su propia sesión: se precargan sus datos (RLS: su perfil).
  useEffect(() => {
    if (!esExistente || !sesionEsDelInvitado) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('profiles').select('first_name, last_name, phone').eq('id', user.id).maybeSingle();
      if (perfil) {
        setNombre(perfil.first_name || '');
        setApellido(perfil.last_name || '');
        setTelefono(perfil.phone || '');
      }
    })();
  }, [esExistente, sesionEsDelInvitado]);

  const urlLogin = `/auth/login?redirectTo=${encodeURIComponent(`/auth/invite?invite_code=${inviteData.code}`)}`;

  const salir = () => {
    if (saliendo) return;
    setSaliendo(true);
    onComplete();
  };
  const terminar = () => {
    guardarOrganizacionActiva({ id: Number(inviteData.organization_id), name: inviteData.organization_name });
    setPaso(3);
    setTimeout(salir, 1500);
  };

  const irAIniciarSesion = async () => {
    setEnviando(true);
    try {
      if (sessionEmail) await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* el login pedirá las credenciales igual */
    }
    window.location.href = urlLogin;
  };

  const validarDatos = () => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = tc('obligatorio');
    if (!apellido.trim()) e.apellido = tc('obligatorio');
    if (!telefono.trim()) e.telefono = tc('obligatorio');
    else {
      const m = mensajeErrorTelefono(telefono);
      if (m) e.telefono = m;
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  /** Cuenta existente con sesión propia: aceptar sin contraseña. */
  const aceptarConSesion = async () => {
    setEnviando(true);
    setError(null);
    const { error: err } = await supabase.rpc('accept_invitation_atomic', {
      p_invite_code: inviteData.code,
      p_first_name: nombre,
      p_last_name: apellido,
      p_phone: telefono,
    });
    setEnviando(false);
    if (err) {
      console.error('[invitación] accept_invitation_atomic:', err.message);
      setError(t('error'));
      return;
    }
    terminar();
  };

  /** Cuenta nueva o huérfana: el servidor la crea con la contraseña y acepta. */
  const crearCuenta = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: inviteData.code,
          email: inviteData.email,
          password,
          firstName: nombre,
          lastName: apellido,
          phone: telefono,
        }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { code?: string; codigo?: string };
      if (res.status === 409 && cuerpo.code === 'CUENTA_EXISTENTE') {
        setNecesitaLogin(true);
        return;
      }
      if (res.status === 400 && cuerpo.codigo && cuerpo.codigo in CLAVE_MOTIVO) {
        setErrores({ password: tp(CLAVE_MOTIVO[cuerpo.codigo as MotivoRechazo]) });
        return;
      }
      if (res.status === 429) {
        setError(t('demasiados'));
        return;
      }
      if (!res.ok) {
        setError(res.status === 404 ? t('vencida') : t('error'));
        return;
      }
      // Entrar de una vez con la contraseña recién creada.
      const r = await iniciarSesionConCorreo(inviteData.email, password);
      if (!r.ok) console.warn('[invitación] no se pudo entrar automáticamente:', r.error.codigo);
      terminar();
    } catch {
      setError(t('error'));
    } finally {
      setEnviando(false);
    }
  };

  const enviarDatos = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarDatos()) return;
    if (esExistente) void aceptarConSesion();
    else setPaso(2);
  };

  const enviarContrasena = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!evaluacion.valida) {
      err.password = tp(!evaluacion.requisitos.longitud ? 'errorLongitud' : !evaluacion.requisitos.distintaDelCorreo ? 'errorIgualCorreo' : 'errorFiltrada');
    }
    if (password !== confirmar) err.confirmar = tp('errorConfirmacion');
    setErrores(err);
    if (Object.keys(err).length === 0) void crearCuenta();
  };

  const aviso = error ? <AvisoAcceso tono="error">{error}</AvisoAcceso> : undefined;
  const invitadoA = t('invitadoA', { organizacion: inviteData.organization_name, rol: inviteData.role_name });

  if (necesitaLogin) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('existenteTitulo')}
          descripcion={invitadoA}
          icono={<IconoDestacado icono={UserCheck} />}
          aviso={
            sessionEmail ? (
              <AvisoAcceso tono="advertencia">{t('sesionAjena', { sesion: sessionEmail, invitado: inviteData.email })}</AvisoAcceso>
            ) : (
              <AvisoAcceso tono="info">{t('existente', { correo: inviteData.email })}</AvisoAcceso>
            )
          }
        >
          <button type="button" onClick={irAIniciarSesion} disabled={enviando} className={clasesBoton({ anchoCompleto: true })}>
            {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {sessionEmail ? t('cerrarEIniciar', { correo: inviteData.email }) : t('iniciarParaAceptar')}
          </button>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  if (paso === 3) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={esExistente ? t('aceptadaTitulo') : t('listoTitulo')}
          descripcion={t('entrandoA', { organizacion: inviteData.organization_name })}
          centrado
          icono={<IconoDestacado icono={CheckCircle2} tono="exito" />}
        >
          <button type="button" onClick={salir} disabled={saliendo} className={clasesBoton({ anchoCompleto: true })}>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {saliendo ? t('abriendo') : t('entrarAhora')}
          </button>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  const totalPasos = esExistente ? 1 : 2;

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        pasos={totalPasos > 1 ? <ProgresoPasos actual={paso} total={2} etiqueta={paso === 1 ? t('pasoDatos') : t('pasoContrasena')} /> : undefined}
        titulo={paso === 1 ? (esExistente ? t('confirmarTitulo') : t('datosTitulo')) : t('contrasenaTitulo')}
        descripcion={paso === 1 ? invitadoA : t('contrasenaDescripcion')}
        aviso={aviso}
      >
        {paso === 1 ? (
          <form className="flex flex-col gap-4" onSubmit={enviarDatos} noValidate>
            <FormField etiqueta={tc('correo')}>
              <Input value={inviteData.email} readOnly autoComplete="username" className="h-10 rounded-lg bg-subtle" />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('nombre')} obligatorio error={errores.nombre}>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" autoFocus className="h-10 rounded-lg" />
              </FormField>
              <FormField etiqueta={t('apellido')} obligatorio error={errores.apellido}>
                <Input value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="family-name" className="h-10 rounded-lg" />
              </FormField>
            </div>
            <PhoneField etiqueta={t('telefono')} valor={telefono} onValor={setTelefono} obligatorio error={errores.telefono} />
            <button type="submit" disabled={enviando} className={clasesBoton({ anchoCompleto: true })}>
              {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {esExistente ? t('aceptar') : tc('continuar')}
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={enviarContrasena} noValidate>
            <input type="email" name="username" autoComplete="username" value={inviteData.email} readOnly hidden />
            <CampoContrasena
              etiqueta={tc('contrasena')}
              valor={password}
              onValor={setPassword}
              modo="nueva"
              obligatorio
              autoFocus
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
            <div className="flex gap-3">
              <button type="button" onClick={() => setPaso(1)} className={clasesBoton({ variante: 'secundario' })}>
                {tc('volver')}
              </button>
              <button type="submit" disabled={enviando} className={clasesBoton({ anchoCompleto: true })}>
                {enviando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {enviando ? t('creando') : t('completar')}
              </button>
            </div>
          </form>
        )}
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}
