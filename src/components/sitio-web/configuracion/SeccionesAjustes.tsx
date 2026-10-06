'use client';

/**
 * Configuración › «Chat en el sitio», «Idioma y moneda» y «Mantenimiento»
 * (Figma B/12-01). Tres secciones cortas con SettingRow; todo va al estado
 * sucio de la página y se guarda con la barra única.
 */
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { FormSection, SettingGroup, SettingRow, clasesBoton } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IDIOMAS_SITIO, type IdiomaSitio } from '@/lib/website/configuracionSitio';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { enlacesConfiguracion } from './enlaces';
import { ICONOS_SECCION_CONFIGURACION, ICONO_RESERVAS_WEB } from './iconosSecciones';
import { textoConfiguracionCanonico, type TraductorConfiguracion } from './textos';

export function SeccionChat({
  t,
  activo,
  onCambiar,
  moduloChat,
  esRestaurante = false,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  moduloChat: boolean;
  /** Restaurante: enlaza a Reservas web (POS › Reservas de mesas › Configuración). */
  esRestaurante?: boolean;
  deshabilitado?: boolean;
}) {
  const chat = enlacesConfiguracion.chat();
  const reservas = esRestaurante ? enlacesConfiguracion.reservas() : null;
  return (
    <FormSection id="chat" icono={ICONOS_SECCION_CONFIGURACION.chat} titulo={t('secciones.chat')}>
      <SettingGroup>
        <SettingRow
          titulo={t('chat.mostrar')}
          htmlFor="config-chat"
          descripcion={moduloChat ? t('chat.mostrarDescripcion') : `${t('chat.mostrarDescripcion')} ${t('chat.sinModulo')}`}
        >
          <Switch id="config-chat" checked={activo} disabled={deshabilitado || (!moduloChat && !activo)} onCheckedChange={onCambiar} />
        </SettingRow>
      </SettingGroup>
      {chat && moduloChat && (
        <div>
          <Link href={chat} className="inline-flex items-center gap-2 text-sm font-medium text-fg hover:text-link">
            <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('chat.configurar')}
          </Link>
        </div>
      )}
      {reservas && (
        <SettingGroup>
          {/* Reservas web viven en POS (P12 nota 1): aquí solo se enlaza, sin copiar el formulario. */}
          <SettingRow
            titulo={
              <span className="inline-flex items-center gap-2">
                <ICONO_RESERVAS_WEB aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                {t('chat.reservasTitulo')}
              </span>
            }
            descripcion={t('chat.reservasDescripcion')}
          >
            <Link href={reservas} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('chat.reservasIr')}
            </Link>
          </SettingRow>
        </SettingGroup>
      )}
    </FormSection>
  );
}

/** Nombre de una moneda («COP · peso colombiano»); si no está en la lista, el código. */
export function nombreMoneda(t: TraductorConfiguracion, codigo: string | null): string {
  if (!codigo) return t('idioma.monedaSinBase');
  return textoConfiguracionCanonico(`idioma.monedas.${codigo}`) ? t(`idioma.monedas.${codigo}`) : codigo;
}

export function SeccionIdiomaMoneda({
  t,
  idioma,
  onIdioma,
  moneda,
  pendiente,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  idioma: IdiomaSitio;
  onIdioma: (v: IdiomaSitio) => void;
  moneda: string | null;
  pendiente: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <FormSection id="idioma" icono={ICONOS_SECCION_CONFIGURACION.idioma} titulo={t('secciones.idioma')}>
      <SettingGroup>
        <SettingRow titulo={t('idioma.idioma')} descripcion={t('idioma.idiomaDescripcion')}>
          <Select value={idioma} onValueChange={(v) => onIdioma(v as IdiomaSitio)} disabled={deshabilitado || pendiente}>
            <SelectTrigger className="h-10 w-full min-w-48 rounded-lg sm:w-60" aria-label={t('idioma.idioma')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDIOMAS_SITIO.map((i) => (
                <SelectItem key={i} value={i}>
                  {t(`idioma.idiomas.${i}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow titulo={t('idioma.moneda')} descripcion={t('idioma.monedaDescripcion')}>
          {/* Solo lectura: cambiar la moneda del sitio sin convertir precios no tiene sentido. */}
          <Select value={moneda ?? 'sin'} disabled>
            <SelectTrigger className="h-10 w-full min-w-48 rounded-lg sm:w-60" aria-label={t('idioma.moneda')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={moneda ?? 'sin'}>{nombreMoneda(t, moneda)}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingGroup>
    </FormSection>
  );
}

export function SeccionMantenimiento({
  t,
  activo,
  onCambiar,
  pendiente,
  deshabilitado,
}: {
  t: TraductorConfiguracion;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  pendiente: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <FormSection id="mantenimiento" icono={ICONOS_SECCION_CONFIGURACION.mantenimiento} titulo={t('secciones.mantenimiento')}>
      <SettingGroup>
        <SettingRow titulo={t('mantenimiento.titulo')} descripcion={t('mantenimiento.descripcion')} htmlFor="config-mantenimiento">
          <Switch id="config-mantenimiento" checked={activo} disabled={deshabilitado || pendiente} onCheckedChange={onCambiar} />
        </SettingRow>
      </SettingGroup>
    </FormSection>
  );
}

export const IDIOMAS = IDIOMAS_SITIO;
