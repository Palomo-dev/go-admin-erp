'use client';

/**
 * «Invitar miembro» (Figma 08, secciones 5 y 10): correo, rol, sede y cargo.
 * La invitación la crea el servidor (`POST /api/auth/invite`): código aleatorio
 * que nunca llega al navegador, duplicados y organización de la sesión
 * validados allí. Estados: correo sin confirmar (no deja enviar, dice por qué)
 * y cupo lleno (con salida a comprar o cambiar de plan).
 */
import { useEffect, useState } from 'react';
import { MailWarning, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FormField, PanelAdaptable, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmailConfirmed } from '@/hooks/useEmailConfirmed';
import type { Cupo } from '@/lib/organizacion/cupo';
import type { OpcionSimple } from './DialogosMiembro';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIN_CARGO = '__sin_cargo__';
/** Rol por defecto al invitar: Empleado (rol de sistema 4). Solo preselección; el servidor valida el rol. */
const ROL_POR_DEFECTO = '4';

export interface SedeInvitacion extends OpcionSimple {
  principal: boolean;
}

export function DialogoInvitar({
  abierto,
  onAbiertoChange,
  organizationId,
  roles,
  sedes,
  cargos,
  cupo,
  onInvitada,
  onComprar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  roles: readonly OpcionSimple[];
  sedes: readonly SedeInvitacion[];
  cargos: readonly OpcionSimple[];
  cupo: Cupo | null;
  onInvitada: () => void;
  onComprar?: () => void;
}) {
  const t = useTranslations('org.acceso.invitaciones.invitar');
  const { confirmed, loading: cargandoCorreo } = useEmailConfirmed();
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState(ROL_POR_DEFECTO);
  const [sede, setSede] = useState('');
  const [cargo, setCargo] = useState(SIN_CARGO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setEmail('');
    setError(null);
    setRol(roles.some((r) => r.id === ROL_POR_DEFECTO) ? ROL_POR_DEFECTO : roles[0]?.id ?? '');
    setSede((sedes.find((s) => s.principal) ?? sedes[0])?.id ?? '');
    setCargo(SIN_CARGO);
  }, [abierto, roles, sedes]);

  const correoSinConfirmar = !cargandoCorreo && !confirmed;
  const cupoLleno = !!cupo?.lleno;
  const correoValido = EMAIL_RE.test(email.trim());
  const listo = correoValido && !!rol && (sedes.length === 0 || !!sede);
  const motivo = correoSinConfirmar ? t('motivos.correo') : cupoLleno ? t('motivos.cupo') : !listo ? t('motivos.datos') : undefined;

  const enviar = async () => {
    if (motivo) return;
    setEnviando(true);
    setError(null);
    const correo = email.trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-organization-id': String(organizationId) },
        body: JSON.stringify({
          email: correo,
          roleId: Number(rol),
          branchId: sede ? Number(sede) : null,
          jobPositionId: cargo === SIN_CARGO ? null : cargo,
          organizationId,
          origin: window.location.origin,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string; invitationId?: number };
      if (res.status === 409 && json.code === 'YA_INVITADO') return setError(t('errores.yaInvitado'));
      if (res.status === 409 && json.code === 'YA_MIEMBRO') return setError(t('errores.yaMiembro'));
      if (res.status === 429) return setError(t('errores.demasiadas'));
      if (!res.ok || !json.success) {
        if (json.invitationId) {
          // Quedó creada, solo falló el correo: se ve en la tabla para reenviarla.
          toast.warning(t('toasts.creadaSinCorreo'), { description: t('toasts.creadaSinCorreoDesc') });
          onInvitada();
          onAbiertoChange(false);
          return;
        }
        return setError(t('errores.generico'));
      }
      toast.success(t('toasts.enviada', { email: correo }));
      onInvitada();
      onAbiertoChange(false);
    } catch {
      setError(t('errores.red'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={UserPlus}
      ancho={560}
      ocupado={enviando}
      pie={
        <>
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={enviando}>
            {t('cancelar')}
          </button>
          <button
            type="button"
            className={clasesBoton()}
            onClick={() => void enviar()}
            disabled={!!motivo || enviando}
            title={motivo}
            aria-busy={enviando || undefined}
          >
            {enviando ? t('enviando') : t('enviar')}
          </button>
        </>
      }
    >
      {correoSinConfirmar && (
        <div role="status" className="flex gap-3 rounded-xl border border-line-warning bg-warning-subtle p-3">
          <MailWarning aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-semibold text-warning-text">{t('correoSinConfirmar.titulo')}</p>
            <p className="text-[13px] text-fg-secondary">{t('correoSinConfirmar.descripcion')}</p>
          </div>
        </div>
      )}
      {cupoLleno && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-line-warning bg-warning-subtle p-3">
          <p className="text-sm font-semibold text-warning-text">{t('cupoLleno.titulo', { maximo: cupo?.maximo ?? 0 })}</p>
          <p className="text-[13px] text-fg-secondary">{t('cupoLleno.descripcion')}</p>
          {onComprar && (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })} onClick={onComprar}>
              {t('cupoLleno.comprar')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">
          {error}
        </p>
      )}
      <fieldset disabled={enviando || cupoLleno} className="flex flex-col gap-4">
        <legend className="sr-only">{t('titulo')}</legend>
        <FormField etiqueta={t('campos.correo')} obligatorio error={email && !correoValido ? t('errores.correoInvalido') : null}>
          <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('campos.correoPlaceholder')} />
        </FormField>
        <FormField etiqueta={t('campos.rol')} obligatorio>
          {(campo) => (
            <Select value={rol} onValueChange={setRol}>
              <SelectTrigger id={campo.id}>
                <SelectValue placeholder={t('campos.rolPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {sedes.length > 0 && (
          <FormField etiqueta={t('campos.sede')} obligatorio ayuda={t('campos.sedeAyuda')}>
            {(campo) => (
              <Select value={sede} onValueChange={setSede}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                  <SelectValue placeholder={t('campos.sedePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        {cargos.length > 0 && (
          <FormField etiqueta={t('campos.cargo')} ayuda={t('campos.cargoAyuda')}>
            {(campo) => (
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CARGO}>{t('campos.sinCargo')}</SelectItem>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
      </fieldset>
    </PanelAdaptable>
  );
}
