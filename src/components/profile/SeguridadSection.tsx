'use client';

/**
 * «Mi perfil › Seguridad» (Figma 346:19975 escritorio, 348:12765 móvil y
 * 348:12898 hoja de contraseña). Una fila por ajuste: título con insignia,
 * descripción y su acción; en móvil, tarjeta con la acción a todo el ancho.
 *
 * - Contraseña: `POST /api/auth/contrasena` (acceso v3, fase 5): la actual se
 *   comprueba en el servidor con límite por usuario y la nueva cumple la
 *   política única. Sin cambios de lógica; ahora en `PanelAdaptable` (diálogo
 *   en escritorio, hoja inferior en móvil). La fecha del último cambio del
 *   diseño no se pinta: Auth no la guarda.
 * - Autenticación en dos pasos: TOTP de Supabase Auth (`lib/auth/dosPasos.ts`).
 *   Se ofrece solo con `NEXT_PUBLIC_PERFIL_MFA=1` (decisión v2-12: el inicio de
 *   sesión aún no pide el segundo código) o si la persona ya tiene un factor.
 * - Códigos de respaldo: no se muestran; Auth no los expone (ver dosPasos.ts).
 * - Correo electrónico: estado real de Auth y «Reenviar» o «Cambiar».
 */
import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslations } from 'next-intl';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { EmailConfirmedGate, EmailConfirmedWarning } from '@/components/auth/EmailConfirmedGate';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormSection } from '@/components/kit/FormSection';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { CampoContrasena, MedidorFortaleza, useEvaluacionContrasena } from '@/components/kit/acceso';
import { Checkbox } from '@/components/ui/checkbox';
import { CLAVE_MOTIVO, type MotivoRechazo } from '@/lib/auth/politicaContrasena';
import { factoresTotp, factoresVerificados, type ClienteMfa, type FactorTotp } from '@/lib/auth/dosPasos';
import { DialogoCambiarCorreo, reenviarConfirmacion } from './DialogoCambiarCorreo';
import { clienteMfaNavegador, DialogoActivarDosPasos, DialogoDesactivarDosPasos } from './DialogoDosPasos';
import { estadoCorreo, mostrarDosPasos } from './perfilLogica';
import { FilaAjuste } from './piezasPerfil';

interface SeguridadSectionProps {
  user: User | null;
  /** Para pruebas; por defecto `supabase.auth.mfa` del navegador. */
  clienteMfa?: () => ClienteMfa;
  /** Para pruebas; por defecto `NEXT_PUBLIC_PERFIL_MFA`. */
  banderaMfa?: string;
}

export default function SeguridadSection({ user, clienteMfa = clienteMfaNavegador, banderaMfa = process.env.NEXT_PUBLIC_PERFIL_MFA }: SeguridadSectionProps) {
  const t = useTranslations('perfilSeguridad');
  const tp = useTranslations('acceso.contrasena');
  const tf = useTranslations('perfil');

  // ── Contraseña (sin cambios de lógica) ──
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
        toast.success(t('actualizada'), { description: cerrarOtras ? tf('seguridad.otrasCerradas') : tf('seguridad.sesionSigue') });
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

  // ── Dos pasos ──
  const [factores, setFactores] = useState<FactorTotp[]>([]);
  const [activar, setActivar] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const cargarFactores = useCallback(async () => {
    try {
      setFactores(await factoresTotp(clienteMfa()));
    } catch {
      setFactores([]);
    }
  }, [clienteMfa]);
  useEffect(() => {
    void cargarFactores();
  }, [cargarFactores]);
  const verificados = factoresVerificados(factores);
  const dosPasosActiva = verificados.length > 0;
  const verDosPasos = mostrarDosPasos(banderaMfa, verificados.length);

  // ── Correo ──
  const estado = estadoCorreo(user);
  const [dialogoCorreo, setDialogoCorreo] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  return (
    <>
      <FormSection titulo={tf('seguridad.titulo')} descripcion={verDosPasos ? tf('seguridad.descripcionConDosPasos') : tf('seguridad.descripcion')} id="perfil-seguridad">
        <div className="flex flex-col gap-3 sm:gap-0">
          <FilaAjuste
            titulo={t('contrasenaTitulo')}
            descripcion={tf('seguridad.contrasenaDesc')}
            acciones={
              <EmailConfirmedGate message={t('confirmaCorreo')}>
                <button type="button" onClick={() => setAbierto(true)} className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'h-12 w-full sm:h-10 sm:w-auto' })}>
                  <span className="sm:hidden">{tf('seguridad.cambiarContrasena')}</span>
                  <span className="hidden sm:inline">{t('cambiar')}</span>
                </button>
              </EmailConfirmedGate>
            }
          />

          {verDosPasos && (
            <FilaAjuste
              titulo={tf('dosPasos.titulo')}
              insignia={
                <StatusBadge
                  estado={dosPasosActiva ? 'activa' : 'inactiva'}
                  etiqueta={dosPasosActiva ? tf('dosPasos.activa') : tf('dosPasos.inactiva')}
                  tono={dosPasosActiva ? 'exito' : 'neutro'}
                  apariencia="suave"
                />
              }
              descripcion={dosPasosActiva ? tf('dosPasos.descActiva') : tf('dosPasos.descInactiva')}
              acciones={
                dosPasosActiva ? (
                  <button type="button" onClick={() => setQuitar(true)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                    {tf('dosPasos.desactivar')}
                  </button>
                ) : (
                  <button type="button" onClick={() => setActivar(true)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                    {tf('dosPasos.activar')}
                  </button>
                )
              }
            />
          )}

          <FilaAjuste
            titulo={tf('datos.correo')}
            insignia={
              estado === 'confirmado' ? (
                <StatusBadge estado="confirmado" etiqueta={tf('correo.estado.confirmado')} tono="exito" apariencia="suave" />
              ) : (
                <StatusBadge estado={estado} etiqueta={tf(`correo.estado.${estado}`)} tono="advertencia" apariencia="suave" />
              )
            }
            descripcion={
              estado === 'cambio_pendiente'
                ? tf('correo.pendienteA', { correo: user?.new_email ?? '' })
                : estado === 'sin_confirmar'
                  ? tf('seguridad.correoSinConfirmar', { correo: user?.email ?? '' })
                  : tf('seguridad.correoConfirmado', { correo: user?.email ?? '' })
            }
            acciones={
              estado === 'confirmado' ? (
                <button type="button" onClick={() => setDialogoCorreo(true)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                  {tf('correo.cambiar')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={reenviando}
                  onClick={async () => {
                    setReenviando(true);
                    try {
                      await reenviarConfirmacion(user, tf);
                    } finally {
                      setReenviando(false);
                    }
                  }}
                  className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
                >
                  <span className="sm:hidden">{tf('correo.reenviarConfirmacion')}</span>
                  <span className="hidden sm:inline">{tf('correo.reenviar')}</span>
                </button>
              )
            }
          />
        </div>
      </FormSection>

      <PanelAdaptable
        abierto={abierto}
        onAbiertoChange={(v) => {
          setAbierto(v);
          if (!v) reiniciar();
        }}
        titulo={t('dialogoTitulo')}
        descripcion={tf('seguridad.dialogoDescripcion')}
        icono={KeyRound}
        ancho={520}
        ocupado={cargando}
        pie={
          <>
            <button
              type="button"
              disabled={cargando}
              onClick={() => {
                setAbierto(false);
                reiniciar();
              }}
              className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'h-12 sm:h-10' })}
            >
              {tf('cancelar')}
            </button>
            <button
              type="button"
              disabled={!puedeGuardar}
              aria-busy={cargando || undefined}
              onClick={() => void guardar()}
              className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'h-12 sm:h-10' })}
            >
              {cargando ? tf('guardando') : t('guardar')}
            </button>
          </>
        }
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
          <label className="flex items-start gap-2 text-sm text-fg">
            <Checkbox checked={cerrarOtras} onCheckedChange={(v) => setCerrarOtras(v === true)} className="mt-0.5" />
            <span>{t('cerrarOtras')}</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          {/* Enter en cualquier campo envía el formulario. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </PanelAdaptable>

      {verDosPasos && (
        <>
          <DialogoActivarDosPasos abierto={activar} onAbiertoChange={setActivar} onActivada={() => void cargarFactores()} cliente={clienteMfa} />
          <DialogoDesactivarDosPasos
            abierto={quitar}
            onAbiertoChange={setQuitar}
            factorId={verificados[0]?.id ?? null}
            onDesactivada={() => void cargarFactores()}
            cliente={clienteMfa}
          />
        </>
      )}

      <DialogoCambiarCorreo abierto={dialogoCorreo} onAbiertoChange={setDialogoCorreo} usuario={user} />
    </>
  );
}
