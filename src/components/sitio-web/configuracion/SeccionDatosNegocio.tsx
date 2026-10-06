'use client';

/**
 * Configuración › «Datos del negocio» (Figma B/12-01): logo y favicon (el
 * componente compartido con Diseño › Logo y favicon), nombre en el sitio,
 * correo, teléfono y WhatsApp del botón flotante. Son los cuatro campos de la
 * captura; el saludo prellenado no ocupa una fila propia: se edita en un
 * diálogo que abre el enlace de la línea de ayuda («Abre wa.me con un saludo
 * prellenado»), así la cuadrícula de 12-01 no cambia. Dirección y horario NO
 * se editan aquí: son de la sucursal (nota con enlace).
 */
import { useState } from 'react';
import Link from 'next/link';
import { Dialogo, FormField, FormSection } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { CampoLogoFavicon } from '../ui/CampoLogoFavicon';
import type { ErroresFormulario, FormularioConfiguracion } from '@/lib/website/configuracionSitio';
import { enlacesConfiguracion } from './enlaces';
import { ICONOS_SECCION_CONFIGURACION } from './iconosSecciones';
import type { TraductorConfiguracion } from './textos';

export interface SeccionDatosNegocioProps {
  t: TraductorConfiguracion;
  formulario: FormularioConfiguracion;
  errores: ErroresFormulario;
  editar: <K extends keyof FormularioConfiguracion>(campo: K, valor: FormularioConfiguracion[K]) => void;
  organizationId?: number;
  /** Contacto del sitio aún sin columnas (migración pendiente): se muestra el de la organización. */
  contactoPendiente: boolean;
  organizacion: { correo: string | null; telefono: string | null };
  deshabilitado?: boolean;
}

const ERROR_TEXTO: Record<string, string> = {
  'nombre.requerido': 'datos.errores.nombreRequerido',
  'correo.requerido': 'datos.errores.correoRequerido',
  'correo.invalido': 'datos.errores.correoInvalido',
  'whatsapp.invalido': 'datos.errores.whatsappInvalido',
};

export function SeccionDatosNegocio({
  t,
  formulario: f,
  errores,
  editar,
  organizationId,
  contactoPendiente,
  organizacion,
  deshabilitado,
}: SeccionDatosNegocioProps) {
  const error = (campo: keyof ErroresFormulario) => (errores[campo] ? t(ERROR_TEXTO[`${campo}.${errores[campo]}`]) : null);
  const sucursales = enlacesConfiguracion.sucursales();
  const contactoBloqueado = deshabilitado || contactoPendiente;
  const [saludoAbierto, setSaludoAbierto] = useState(false);
  const [saludo, setSaludo] = useState(f.saludoWhatsapp);
  const abrirSaludo = () => {
    setSaludo(f.saludoWhatsapp);
    setSaludoAbierto(true);
  };
  const ayudaWhatsapp = (
    <>
      {t('datos.saludoAyudaInicio')}{' '}
      {contactoBloqueado ? (
        t('datos.saludoEnlace')
      ) : (
        <button type="button" onClick={abrirSaludo} className="font-medium text-link underline-offset-2 hover:underline">
          {t('datos.saludoEnlace')}
        </button>
      )}
    </>
  );

  return (
    <FormSection id="datos" icono={ICONOS_SECCION_CONFIGURACION.datos} titulo={t('secciones.datos')} descripcion={t('datos.descripcion')} columnas={2}>
      <CampoLogoFavicon
        className="md:col-span-2"
        logoUrl={f.logoUrl}
        faviconUrl={f.faviconUrl}
        organizationId={organizationId}
        permitirQuitar
        deshabilitado={deshabilitado}
        onCambiar={(campo, url) => editar(campo === 'logo' ? 'logoUrl' : 'faviconUrl', url)}
      />
      <FormField etiqueta={t('datos.nombre')} obligatorio error={error('nombre')}>
        <Input value={f.nombre} maxLength={120} disabled={deshabilitado} onChange={(e) => editar('nombre', e.target.value)} autoComplete="organization" />
      </FormField>
      <FormField
        etiqueta={t('datos.correo')}
        obligatorio={!contactoPendiente}
        error={error('correo')}
        extra={contactoPendiente ? <span className="text-xs text-fg-muted">{t('datos.deOrganizacion')}</span> : undefined}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={contactoPendiente ? organizacion.correo ?? '' : f.correo}
          disabled={contactoBloqueado}
          onChange={(e) => editar('correo', e.target.value)}
          placeholder="hola@tumarca.com"
        />
      </FormField>
      <FormField etiqueta={t('datos.telefono')} extra={contactoPendiente ? <span className="text-xs text-fg-muted">{t('datos.deOrganizacion')}</span> : undefined}>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={contactoPendiente ? organizacion.telefono ?? '' : f.telefono}
          disabled={contactoBloqueado}
          onChange={(e) => editar('telefono', e.target.value)}
          placeholder="+57 604 555 0100"
        />
      </FormField>
      <FormField etiqueta={t('datos.whatsapp')} error={error('whatsapp')} ayuda={ayudaWhatsapp}>
        <Input
          type="tel"
          inputMode="tel"
          value={f.whatsapp}
          disabled={contactoBloqueado}
          onChange={(e) => editar('whatsapp', e.target.value)}
          placeholder="+57 300 555 0100"
        />
      </FormField>
      <p className="text-xs leading-4 text-fg-muted md:col-span-2">
        {t('datos.notaSucursal')}{' '}
        {sucursales && (
          <Link href={sucursales} className="font-medium text-link underline-offset-2 hover:underline">
            {t('datos.irSucursales')}
          </Link>
        )}
      </p>
      <Dialogo
        abierto={saludoAbierto}
        onAbiertoChange={setSaludoAbierto}
        titulo={t('datos.saludo')}
        descripcion={t('datos.saludoDescripcion')}
        primario={{
          etiqueta: t('datos.saludoAplicar'),
          onClick: () => {
            editar('saludoWhatsapp', saludo.trim());
            setSaludoAbierto(false);
          },
        }}
      >
        <FormField etiqueta={t('datos.saludo')} ayuda={t('datos.saludoAyudaDialogo')}>
          <Input value={saludo} maxLength={200} onChange={(e) => setSaludo(e.target.value)} placeholder={t('datos.saludoPlaceholder')} />
        </FormField>
      </Dialogo>
    </FormSection>
  );
}
