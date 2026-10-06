'use client';

/**
 * Paso «Tu sucursal principal» del alta (Figma sección 18, filas 3c y 9;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * «Misma ubicación de la organización» viene marcada: la sucursal toma país,
 * ciudad, dirección y teléfono de la organización y no se piden otra vez. Al
 * desmarcarla aparecen dirección, país y ciudad propios. Los horarios salen
 * del registro (se crean los de siempre y se cambian en Sucursales).
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit/FormField';
import { CampoUbicacion } from '@/components/kit/CampoUbicacion';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PhoneField } from '@/components/kit/PhoneField';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';
import { alfa2DeAlfa3 } from '@/lib/utils/paisNavegador';
import type { OrganizacionAlta, SucursalAlta } from './tipos';

export interface PasoSucursalProps {
  organizacion: OrganizacionAlta;
  valor: SucursalAlta;
  onCambio: (v: SucursalAlta) => void;
  onSiguiente: () => void;
  onAnterior: () => void;
}

export function PasoSucursal({ organizacion, valor, onCambio, onSiguiente, onAnterior }: PasoSucursalProps) {
  const t = useTranslations('acceso.alta');
  const tc = useTranslations('acceso.comun');
  const [errores, setErrores] = React.useState<Record<string, string>>({});
  const cambiar = (parcial: Partial<SucursalAlta>) => onCambio({ ...valor, ...parcial });
  const u = organizacion.ubicacion;
  const resumen = [u.ciudad, u.departamento, u.paisNombre].filter(Boolean).join(' · ');

  const continuar = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!valor.mismaUbicacion && !valor.ubicacion.paisCodigo) e.pais = tc('obligatorio');
    const iso = alfa2DeAlfa3(valor.mismaUbicacion ? u.paisCodigo : valor.ubicacion.paisCodigo) ?? undefined;
    const errTel = mensajeErrorTelefono(valor.telefono, iso);
    if (errTel) e.telefono = errTel;
    setErrores(e);
    if (Object.keys(e).length === 0) onSiguiente();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={continuar} noValidate>
      <div className="flex items-start gap-2">
        <Checkbox
          id="misma-ubicacion"
          checked={valor.mismaUbicacion}
          onCheckedChange={(v) => cambiar({ mismaUbicacion: v === true, ubicacion: v === true ? valor.ubicacion : u })}
          className="mt-0.5"
        />
        <label htmlFor="misma-ubicacion" className="cursor-pointer text-[13px] text-fg">
          {t('mismaUbicacion')}
          {resumen && <span className="block text-xs text-fg-secondary">{resumen}</span>}
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('sucursalNombre')}>
          <Input value={valor.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className="h-10 rounded-lg" placeholder={t('sucursalNombrePorDefecto')} />
        </FormField>
        <FormField etiqueta={t('sucursalCodigo')}>
          <Input value={valor.codigo} onChange={(e) => cambiar({ codigo: e.target.value })} className="h-10 rounded-lg" />
        </FormField>
      </div>
      {!valor.mismaUbicacion && (
        <>
          <FormField etiqueta={t('direccion')}>
            <Input value={valor.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} className="h-10 rounded-lg" autoComplete="street-address" />
          </FormField>
          <CampoUbicacion valor={valor.ubicacion} onCambio={(ub) => cambiar({ ubicacion: ub })} errorPais={errores.pais} prellenar={false} />
        </>
      )}
      <PhoneField
        etiqueta={t('sucursalTelefono')}
        valor={valor.telefono}
        onValor={(v) => cambiar({ telefono: v })}
        error={errores.telefono}
        defaultIso={alfa2DeAlfa3(valor.mismaUbicacion ? u.paisCodigo : valor.ubicacion.paisCodigo) ?? undefined}
      />
      <div className="flex gap-3">
        <button type="button" onClick={onAnterior} className={clasesBoton({ variante: 'secundario', tamano: 'lg' })}>
          {tc('volver')}
        </button>
        <button type="submit" className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
          {tc('continuar')}
        </button>
      </div>
    </form>
  );
}
