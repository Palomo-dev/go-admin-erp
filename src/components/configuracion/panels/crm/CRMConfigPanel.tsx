'use client';

/**
 * Configuración › CRM (Figma pág. 10, 12.7 «CRM — enlaza a Chat › Canales,
 * Etiquetas y Llaves de API»; pantallazo 94-config-02).
 *
 * - Canales, Etiquetas y Llaves de API ya no se administran aquí (decisión del
 *   dueño): cada uno es una tarjeta que lleva a su único lugar.
 *     · Canales y el chat del sitio web → Chat › Canales (pantallas nuevas).
 *     · Etiquetas → Configuración › Chat › Etiquetas y respuestas rápidas.
 *     · Llaves de API → Configuración › Integraciones › Desarrolladores.
 * - Debajo, la configuración propia del CRM como filas con «Configurar», que
 *   abren el mismo administrador de siempre en un diálogo.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Hash, MessageSquare, Tag } from 'lucide-react';
import { SettingRow, clasesBoton } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VerticalsManager } from './sections/VerticalsManager';
import { LossReasonsManager } from './sections/LossReasonsManager';
import { ScoringConfigurator } from './sections/ScoringConfigurator';
import { ExitGatesEditor } from './sections/ExitGatesEditor';
import { CommissionsPanel } from './sections/CommissionsPanel';
import { ReferralsProgramCard } from './sections/ReferralsProgramCard';
import { EstructuraComercialManager } from './sections/EstructuraComercialManager';
import { ICPManager } from './sections/ICPManager';
import ChatChannelsService from '@/lib/services/chatChannelsService';
import { rutaSeccion } from '../../config/configSectionsRegistry';
import { BotonEnlace, GrupoAjustes, TarjetaEnlace } from '../../layout/EnlacesAjuste';

/** Ruta del chat del sitio web de un canal (página nueva de Canales). */
const rutaSitioWeb = (id: string) => `/app/chat/canales/sitio-web/${id}`;
const RUTA_CANALES = '/app/chat/canales';

/** Administradores del CRM: clave i18n (`tarjetas.<clave>` y `modales.<clave>`), contenido (sin props) y ancho del diálogo. */
const ADMINISTRADORES: readonly { clave: string; contenido: () => ReactNode; ancho: 'max-w-2xl' | 'max-w-3xl' }[] = [
  { clave: 'verticales', contenido: () => <VerticalsManager />, ancho: 'max-w-2xl' },
  { clave: 'razonesPerdida', contenido: () => <LossReasonsManager />, ancho: 'max-w-2xl' },
  { clave: 'scoring', contenido: () => <ScoringConfigurator />, ancho: 'max-w-3xl' },
  { clave: 'etapas', contenido: () => <ExitGatesEditor />, ancho: 'max-w-2xl' },
  { clave: 'comisiones', contenido: () => <CommissionsPanel />, ancho: 'max-w-2xl' },
  { clave: 'referidos', contenido: () => <ReferralsProgramCard />, ancho: 'max-w-2xl' },
  { clave: 'estructura', contenido: () => <EstructuraComercialManager />, ancho: 'max-w-3xl' },
  { clave: 'icp', contenido: () => <ICPManager />, ancho: 'max-w-3xl' },
];

export function CRMConfigPanel({ onAbrirEnlace }: { onAbrirEnlace?: (href: string) => void } = {}) {
  const tCanales = useTranslations('chatConfig.crmCanales');
  const t = useTranslations('configuracionTextos.crmConfigPanel');
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Solo se averigua si hay un chat del sitio web para enlazarlo directo.
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [sitioWebId, setSitioWebId] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    if (!organizationId) return;
    setChannelsLoading(true);
    try {
      const canales = await new ChatChannelsService(organizationId).getChannels();
      const sitio = canales.find((ch) => ch.type === 'website' && ch.status === 'active') ?? canales.find((ch) => ch.type === 'website');
      setSitioWebId(sitio?.id ?? null);
    } catch (error) {
      console.error('Error cargando canales:', error);
      setSitioWebId(null);
    } finally {
      setChannelsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) void loadChannels();
  }, [organizationId, loadChannels]);

  const actual = ADMINISTRADORES.find((a) => a.clave === abierto);

  return (
    <div className="flex flex-col gap-8">
      <GrupoAjustes id="crm-canales-titulo" titulo={tCanales('titulo')} sinFilas>
        <TarjetaEnlace icono={MessageSquare} texto={tCanales('descripcion')}>
          {!channelsLoading && sitioWebId && (
            <BotonEnlace href={rutaSitioWeb(sitioWebId)} onAbrir={onAbrirEnlace} flecha={false}>
              {tCanales('configurarSitio')}
            </BotonEnlace>
          )}
          <BotonEnlace href={RUTA_CANALES} onAbrir={onAbrirEnlace}>
            {tCanales('irCanales')}
          </BotonEnlace>
        </TarjetaEnlace>
      </GrupoAjustes>

      {/* Las etiquetas viven en Chat › Etiquetas y respuestas rápidas (el diálogo cambia de sección). */}
      <GrupoAjustes id="crm-etiquetas-titulo" titulo={t('etiquetas.titulo')} sinFilas>
        <TarjetaEnlace icono={Tag} texto={t('etiquetas.enlace')}>
          <BotonEnlace href={rutaSeccion('chat.general')}>{t('etiquetas.irEtiquetas')}</BotonEnlace>
        </TarjetaEnlace>
      </GrupoAjustes>

      {/* Las llaves de API se crean y revocan solo en Integraciones › Desarrolladores. */}
      <GrupoAjustes id="crm-llaves-titulo" titulo={t('llaves.titulo')} sinFilas>
        <TarjetaEnlace icono={Hash} texto={t('llaves.enlace')}>
          <BotonEnlace href={rutaSeccion('integraciones.desarrolladores')}>{t('llaves.irDesarrolladores')}</BotonEnlace>
        </TarjetaEnlace>
      </GrupoAjustes>

      <GrupoAjustes id="crm-configuracion-titulo" titulo={t('tarjetas.titulo')} descripcion={t('tarjetas.descripcion')}>
        {ADMINISTRADORES.map(({ clave }) => (
          <SettingRow key={clave} className="px-0 py-3.5" titulo={t(`tarjetas.${clave}.titulo`)} descripcion={<span className="text-fg-muted">{t(`tarjetas.${clave}.descripcion`)}</span>}>
            <button
              type="button"
              onClick={() => setAbierto(clave)}
              aria-label={`${t('tarjetas.configurar')}: ${t(`tarjetas.${clave}.titulo`)}`}
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
            >
              {t('tarjetas.configurar')}
            </button>
          </SettingRow>
        ))}
      </GrupoAjustes>

      <Dialog open={!!actual} onOpenChange={(v) => !v && setAbierto(null)}>
        {actual && (
          <DialogContent className={actual.ancho}>
            <DialogHeader>
              <DialogTitle>{t(`modales.${actual.clave}.titulo`)}</DialogTitle>
              <DialogDescription>{t(`modales.${actual.clave}.descripcion`)}</DialogDescription>
            </DialogHeader>
            {actual.contenido()}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
