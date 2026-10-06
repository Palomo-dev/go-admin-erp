'use client';

/**
 * Configuración › «Zona de peligro» (Figma B/12-01, 12-02 y 12-02b):
 * Despublicar (ConfirmDialog de marca: «¿Despublicar tu sitio?») o volver a
 * publicar, y Eliminar el sitio (ConfirmDialog destructivo que exige escribir el
 * subdominio). Las dos acciones las decide el servidor con
 * `website.sites.publish`; aquí solo se confirma.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, EyeOff, Globe, Trash2 } from 'lucide-react';
import { ConfirmDialog, FormSection, SettingGroup, SettingRow, clasesBoton } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { FalloApi } from './api';
import { ICONOS_SECCION_CONFIGURACION } from './iconosSecciones';
import type { TraductorConfiguracion } from './textos';

export interface ZonaPeligroProps {
  t: TraductorConfiguracion;
  publicado: boolean;
  host: string | null;
  subdominio: string | null;
  puedePublicar: boolean;
  publicando: boolean;
  eliminando: boolean;
  eliminarPendiente: boolean;
  cambiarPublicacion: (publicado: boolean) => Promise<boolean>;
  eliminarSitio: (confirmacion: string) => Promise<FalloApi | null>;
}

export function ZonaPeligro({
  t,
  publicado,
  host,
  subdominio,
  puedePublicar,
  publicando,
  eliminando,
  eliminarPendiente,
  cambiarPublicacion,
  eliminarSitio,
}: ZonaPeligroProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [despublicar, setDespublicar] = useState(false);
  const [eliminar, setEliminar] = useState(false);
  const nombreHost = host ?? t('peligro.tuSitio');
  const motivo = !puedePublicar ? t('peligro.sinPermiso') : undefined;

  const alternar = async (siguiente: boolean) => {
    const ok = await cambiarPublicacion(siguiente);
    setDespublicar(false);
    toast(
      ok
        ? { title: siguiente ? t('peligro.republicado') : t('peligro.despublicado') }
        : { title: t('peligro.errorPublicar'), variant: 'destructive' },
    );
  };

  const confirmarEliminar = async () => {
    const fallo = await eliminarSitio(subdominio ?? '');
    setEliminar(false);
    if (fallo === null) {
      toast({ title: t('peligro.eliminado') });
      router.push(RAIZ_SITIO_WEB);
      return;
    }
    toast({ title: fallo === 'pendiente' ? t('estados.pendienteGuardar') : t('peligro.errorEliminar'), variant: 'destructive' });
  };

  return (
    <FormSection
      id="peligro"
      icono={ICONOS_SECCION_CONFIGURACION.peligro}
      tonoIcono="peligro"
      titulo={t('secciones.peligro')} className="border-danger [&_h2]:text-danger-text">
      <SettingGroup>
        {publicado ? (
          <SettingRow titulo={t('peligro.despublicar')} descripcion={t('peligro.despublicarDescripcion')}>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              disabled={!puedePublicar || publicando}
              title={motivo}
              onClick={() => setDespublicar(true)}
            >
              <EyeOff aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('peligro.despublicarBoton')}
            </button>
          </SettingRow>
        ) : (
          <SettingRow titulo={t('peligro.republicar')} descripcion={t('peligro.republicarDescripcion')}>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              disabled={!puedePublicar || publicando}
              title={motivo}
              onClick={() => void alternar(true)}
            >
              <Globe aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('peligro.republicar')}
            </button>
          </SettingRow>
        )}
        <SettingRow titulo={t('peligro.eliminar')} descripcion={t('peligro.eliminarDescripcion')}>
          <button
            type="button"
            className={clasesBoton({ variante: 'destructivo', tamano: 'sm' })}
            disabled={!puedePublicar || eliminando || !subdominio || eliminarPendiente}
            title={motivo ?? (!subdominio ? t('peligro.sinSubdominio') : eliminarPendiente ? t('estados.pendienteGuardar') : undefined)}
            onClick={() => setEliminar(true)}
          >
            <Trash2 aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('peligro.eliminarBoton')}
          </button>
        </SettingRow>
      </SettingGroup>

      <ConfirmDialog
        abierto={despublicar}
        onAbiertoChange={setDespublicar}
        titulo={t('peligro.despublicarTitulo')}
        descripcion={t('peligro.despublicarConfirmacion', { host: nombreHost })}
        textoConfirmar={t('peligro.despublicarBoton')}
        tono="marca"
        icono={AlertCircle}
        cargando={publicando}
        onConfirmar={() => alternar(false)}
      />
      <ConfirmDialog
        abierto={eliminar}
        onAbiertoChange={setEliminar}
        titulo={t('peligro.eliminarTitulo')}
        descripcion={t('peligro.eliminarConfirmacion', { host: nombreHost, subdominio: subdominio ?? '' })}
        textoConfirmar={t('peligro.eliminarBoton')}
        tono="peligro"
        icono={Trash2}
        confirmarCon={subdominio ?? undefined}
        cargando={eliminando}
        onConfirmar={confirmarEliminar}
      />
    </FormSection>
  );
}
