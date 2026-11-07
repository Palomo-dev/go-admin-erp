'use client';

/**
 * Ficha de un servicio (diseño 85-02): qué hace, qué necesitas y, en cobros, la alternativa sin
 * llaves de GO Admin. El botón principal abre el asistente del tipo (lo decide la página).
 * Si el servicio está «En construcción», lo dice antes de seguir.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AvisoTonal, PanelAdaptable, clasesBoton } from '@/components/kit';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/catalogoConexiones';
import { LogoServicio } from '../logos';

function ListaNumerada({ items, etiqueta }: { items: string[]; etiqueta: string }) {
  return (
    <ol aria-label={etiqueta} className="flex flex-col gap-2">
      {items.map((texto, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-fg">
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs text-fg-secondary">
            {i + 1}
          </span>
          <span className="pt-0.5">{texto}</span>
        </li>
      ))}
    </ol>
  );
}

export interface FichaServicioProps {
  item: ItemCatalogo | null;
  nombre: string;
  onCerrar: () => void;
  onConectar: (item: ItemCatalogo) => void;
}

export function FichaServicio({ item, nombre, onCerrar, onConectar }: FichaServicioProps) {
  const t = useTranslations('integracionesConexiones');
  if (!item) return null;

  const base = `servicios.${item.id}`;
  const conocido = t.has(`${base}.nombre`);
  const lista = (clave: 'queHace' | 'queNecesitas'): string[] => {
    const raw = conocido && t.has(`${base}.${clave}`) ? t.raw(`${base}.${clave}`) : t.raw(`ficha.generico.${clave}`);
    return Array.isArray(raw) ? raw.map(String) : [];
  };
  const descripcion = conocido && t.has(`${base}.lema`) ? t(`${base}.lema`) : t('catalogo.descripcionGenerica');
  const esEnlace = item.asistente === 'enlace' || item.asistente === 'avanzado';
  const textoPrimario = esEnlace ? t('ficha.irA', { nombre }) : t('ficha.conectarMiCuenta', { nombre });

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={nombre}
      descripcion={descripcion}
      miniatura={<LogoServicio id={item.id} tamano="lg" />}
      ancho={560}
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={onCerrar}>
            {t('comun.cancelar')}
          </button>
          <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => onConectar(item)}>
            {textoPrimario}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {item.estado === 'en_construccion' && (
          <AvisoTonal
            tono="informacion"
            titulo={t('ficha.enConstruccionTitulo')}
            descripcion={item.motivo ? t(`motivos.${item.motivo}`) : t('ficha.enConstruccionGenerico')}
          />
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('ficha.queHace')}</h3>
          <ListaNumerada items={lista('queHace')} etiqueta={t('ficha.queHace')} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">{t('ficha.queNecesitas')}</h3>
          <ListaNumerada items={lista('queNecesitas')} etiqueta={t('ficha.queNecesitas')} />
        </section>
        {item.grupo === 'cobros' && (
          <AvisoTonal
            tono="informacion"
            titulo={t('ficha.sinLlavesTitulo')}
            descripcion={
              <>
                {t('ficha.sinLlavesTexto')}{' '}
                <Link href="/app/finanzas/metodos-pago" className="font-medium text-brand underline">
                  {t('ficha.sinLlavesEnlace')}
                </Link>
              </>
            }
          />
        )}
      </div>
    </PanelAdaptable>
  );
}
