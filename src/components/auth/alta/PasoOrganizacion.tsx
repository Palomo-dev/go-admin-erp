'use client';

/**
 * Paso «Tu organización» del alta (Figma sección 18, fila 3b y fila 9;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * Crear o unirme con un código (R6: el código lleva a /auth/invite). Para
 * crear: nombre comercial, tipo, NIT (opcional ahora, con su dígito de
 * verificación), razón social, correo, teléfono, país (según el navegador,
 * obligatorio) y ciudad con buscador, subdominio y «Más datos (opcional)»:
 * dirección, código postal, sitio web, descripción, tarifa por defecto, logo y
 * colores (lo que pedía el formulario anterior, sin perder nada).
 */
import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { CampoUbicacion } from '@/components/kit/CampoUbicacion';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { PhoneField } from '@/components/kit/acceso';
import LogoUploader from '@/components/organization/LogoUploader';
import { getOrgTypeLabel } from '@/lib/utils/organizationTypes';
import { OPCIONES_TARIFA_POR_DEFECTO } from '@/lib/services/defaultTaxService';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';
import { alfa2DeAlfa3 } from '@/lib/utils/paisNavegador';
import { extraerCodigoInvitacion } from '@/lib/auth/seleccionOrganizacion';
import { calcularDV, sugerirSubdominio, type OrganizacionAlta } from './tipos';

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLASE_SELECT =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger';

export interface PasoOrganizacionProps {
  valor: OrganizacionAlta;
  onCambio: (v: OrganizacionAlta) => void;
  onSiguiente: () => void;
  onAnterior?: () => void;
  /** En la app no se ofrece «Unirme con un código». */
  permitirUnirse?: boolean;
}

export function PasoOrganizacion({ valor, onCambio, onSiguiente, onAnterior, permitirUnirse = true }: PasoOrganizacionProps) {
  const t = useTranslations('acceso.alta');
  const tc = useTranslations('acceso.comun');
  const locale = useLocale();
  const [modo, setModo] = React.useState<'crear' | 'unirse'>('crear');
  const [tipos, setTipos] = React.useState<{ id: number; name: string }[]>([]);
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const [masDatos, setMasDatos] = React.useState(false);
  const [subEditado, setSubEditado] = React.useState(!!valor.subdominio);
  const [estadoSub, setEstadoSub] = React.useState<'idle' | 'revisando' | 'libre' | 'ocupado'>('idle');
  const [codigo, setCodigo] = React.useState('');
  const [errorCodigo, setErrorCodigo] = React.useState<string | null>(null);

  const cambiar = (parcial: Partial<OrganizacionAlta>) => onCambio({ ...valor, ...parcial });

  React.useEffect(() => {
    supabase
      .from('organization_types')
      .select('id, name')
      .order('name')
      .then(({ data }) => setTipos((data ?? []) as { id: number; name: string }[]));
  }, []);

  // Subdominio sugerido a partir del nombre mientras no se edite a mano.
  React.useEffect(() => {
    if (!subEditado) cambiar({ subdominio: sugerirSubdominio(valor.nombre) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.nombre, subEditado]);

  React.useEffect(() => {
    const sub = valor.subdominio;
    if (!sub || sub.length < 3) {
      setEstadoSub('idle');
      return;
    }
    setEstadoSub('revisando');
    const temporizador = setTimeout(async () => {
      const { data } = await supabase.from('organizations').select('id').eq('subdomain', sub).maybeSingle();
      setEstadoSub(data ? 'ocupado' : 'libre');
    }, 500);
    return () => clearTimeout(temporizador);
  }, [valor.subdominio]);

  const validar = (): boolean => {
    const e: Record<string, string> = {};
    if (!valor.nombre.trim()) e.nombre = tc('obligatorio');
    if (!valor.tipoId) e.tipoId = tc('obligatorio');
    if (!valor.correo.trim()) e.correo = tc('obligatorio');
    else if (!CORREO_RE.test(valor.correo.trim())) e.correo = tc('correoInvalido');
    if (!valor.ubicacion.paisCodigo) e.pais = tc('obligatorio');
    const iso = alfa2DeAlfa3(valor.ubicacion.paisCodigo) ?? undefined;
    const errTel = mensajeErrorTelefono(valor.telefono, iso);
    if (errTel) e.telefono = errTel;
    if (valor.subdominio && valor.subdominio.length < 3) e.subdominio = t('subdominioCorto');
    if (estadoSub === 'ocupado') e.subdominio = t('subdominioOcupado');
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const continuar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (validar()) onSiguiente();
  };

  const unirse = (ev: React.FormEvent) => {
    ev.preventDefault();
    const c = extraerCodigoInvitacion(codigo);
    if (!c) {
      setErrorCodigo(t('codigoInvalido'));
      return;
    }
    window.location.assign(`/auth/invite?invite_code=${encodeURIComponent(c)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {permitirUnirse && (
        <SegmentedControl
          etiqueta={t('crearOUnirse')}
          anchoCompleto
          opciones={[
            { valor: 'crear', etiqueta: t('crear') },
            { valor: 'unirse', etiqueta: t('unirse') },
          ]}
          valor={modo}
          onValorChange={setModo}
        />
      )}

      {modo === 'unirse' ? (
        <form className="flex flex-col gap-4" onSubmit={unirse} noValidate>
          <FormField etiqueta={t('codigo')} ayuda={t('codigoAyuda')} error={errorCodigo} obligatorio>
            <Input value={codigo} onChange={(e) => { setCodigo(e.target.value); setErrorCodigo(null); }} className="h-10 rounded-lg" autoComplete="off" />
          </FormField>
          <div className="flex gap-3">
            {onAnterior && (
              <button type="button" onClick={onAnterior} className={clasesBoton({ variante: 'secundario', tamano: 'lg' })}>
                {tc('volver')}
              </button>
            )}
            <button type="submit" className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
              {t('usarCodigo')}
            </button>
          </div>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={continuar} noValidate>
          <FormField etiqueta={t('nombre')} obligatorio error={errores.nombre}>
            <Input value={valor.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className="h-10 rounded-lg" autoComplete="organization" placeholder="Mi empresa S.A.S." />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('tipo')} obligatorio error={errores.tipoId}>
              {(campo) => (
                <select
                  id={campo.id}
                  aria-describedby={campo['aria-describedby']}
                  aria-invalid={campo['aria-invalid']}
                  value={valor.tipoId}
                  onChange={(e) => cambiar({ tipoId: e.target.value })}
                  className={CLASE_SELECT}
                >
                  <option value="">{t('elegirTipo')}</option>
                  {tipos.map((ti) => (
                    <option key={ti.id} value={String(ti.id)}>
                      {getOrgTypeLabel(ti.name, locale)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField
              etiqueta={t('nit')}
              ayuda={valor.nit ? t('nitDv', { dv: valor.dv || calcularDV(valor.nit) }) : t('nitAyuda')}
            >
              <Input
                value={valor.nit}
                inputMode="numeric"
                onChange={(e) => cambiar({ nit: e.target.value, dv: calcularDV(e.target.value) })}
                className="h-10 rounded-lg"
              />
            </FormField>
          </div>
          <FormField etiqueta={t('razonSocial')} ayuda={t('razonSocialAyuda')}>
            <Input value={valor.razonSocial} onChange={(e) => cambiar({ razonSocial: e.target.value })} className="h-10 rounded-lg" placeholder={valor.nombre} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('correo')} obligatorio error={errores.correo}>
              <Input type="email" value={valor.correo} onChange={(e) => cambiar({ correo: e.target.value })} className="h-10 rounded-lg" autoComplete="email" />
            </FormField>
            <PhoneField
              etiqueta={t('telefono')}
              valor={valor.telefono}
              onValor={(v) => cambiar({ telefono: v })}
              error={errores.telefono}
              defaultIso={alfa2DeAlfa3(valor.ubicacion.paisCodigo) ?? undefined}
            />
          </div>
          <CampoUbicacion valor={valor.ubicacion} onCambio={(u) => cambiar({ ubicacion: u })} errorPais={errores.pais} />
          <FormField
            etiqueta={t('subdominio')}
            error={errores.subdominio}
            ayuda={estadoSub === 'libre' ? t('subdominioLibre') : estadoSub === 'revisando' ? t('subdominioRevisando') : t('subdominioAyuda')}
          >
            <Input
              value={valor.subdominio}
              onChange={(e) => {
                setSubEditado(true);
                cambiar({ subdominio: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) });
              }}
              className="h-10 rounded-lg"
              autoComplete="off"
            />
          </FormField>

          <button
            type="button"
            onClick={() => setMasDatos((v) => !v)}
            aria-expanded={masDatos}
            className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-link"
          >
            {masDatos ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            {t('masDatos')}
          </button>
          {masDatos && (
            <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
              <FormField etiqueta={t('direccion')}>
                <Input value={valor.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} className="h-10 rounded-lg" autoComplete="street-address" />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField etiqueta={t('codigoPostal')}>
                  <Input value={valor.codigoPostal} onChange={(e) => cambiar({ codigoPostal: e.target.value })} className="h-10 rounded-lg" autoComplete="postal-code" />
                </FormField>
                <FormField etiqueta={t('sitioWeb')}>
                  <Input value={valor.sitioWeb} onChange={(e) => cambiar({ sitioWeb: e.target.value })} className="h-10 rounded-lg" inputMode="url" />
                </FormField>
              </div>
              <FormField etiqueta={t('descripcion')}>
                {(campo) => (
                  <textarea
                    id={campo.id}
                    aria-describedby={campo['aria-describedby']}
                    rows={3}
                    value={valor.descripcion}
                    onChange={(e) => cambiar({ descripcion: e.target.value })}
                    className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  />
                )}
              </FormField>
              <FormField etiqueta={t('tarifa')} ayuda={t('tarifaAyuda')}>
                {(campo) => (
                  <select id={campo.id} aria-describedby={campo['aria-describedby']} value={valor.tarifa} onChange={(e) => cambiar({ tarifa: e.target.value as OrganizacionAlta['tarifa'] })} className={CLASE_SELECT}>
                    {OPCIONES_TARIFA_POR_DEFECTO.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(`tarifas.${o.value}`)}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-fg">{t('logo')}</p>
                <LogoUploader onLogoChange={(url) => cambiar({ logoUrl: url })} initialLogo={valor.logoUrl} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField etiqueta={t('colorPrimario')}>
                  <input type="color" value={valor.colorPrimario} onChange={(e) => cambiar({ colorPrimario: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface" />
                </FormField>
                <FormField etiqueta={t('colorSecundario')}>
                  <input type="color" value={valor.colorSecundario} onChange={(e) => cambiar({ colorSecundario: e.target.value })} className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface" />
                </FormField>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {onAnterior && (
              <button type="button" onClick={onAnterior} className={clasesBoton({ variante: 'secundario', tamano: 'lg' })}>
                {tc('volver')}
              </button>
            )}
            <button type="submit" className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
              {tc('continuar')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
