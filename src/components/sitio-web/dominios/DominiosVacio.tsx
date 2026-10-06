'use client';

/**
 * Vacío de Dominios (Figma B/07-03): solo existe el subdominio gratis. La
 * tarjeta del subdominio y dos caminos lado a lado (una columna en móvil):
 * conectar un dominio que ya tienes o comprar uno aquí.
 */
import { Tarjeta, clasesBoton } from '@/components/kit';
import { DomainStatusBadge } from '../ui/DomainStatusBadge';
import { ICONO_ACCION_DOMINIO, ICONO_TARJETA_DOMINIO, IconoDominio } from './iconosDominios';
import { useTextosDominios } from './textos';

export interface DominiosVacioProps {
  hostSubdominio: string | null;
  onCambiarSubdominio: () => void;
  onConectar: () => void;
  onComprar: () => void;
  puedeComprar: boolean;
}

export function DominiosVacio({ hostSubdominio, onCambiarSubdominio, onConectar, onComprar, puedeComprar }: DominiosVacioProps) {
  const t = useTextosDominios();
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <Tarjeta>
        <div className="flex flex-wrap items-center gap-3">
          <IconoDominio icono={ICONO_TARJETA_DOMINIO.subdominio} tamano="fila" className="text-fg-secondary" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-fg">{hostSubdominio ?? t('vacio.sinSubdominio')}</span>
            <span className="text-[13px] text-fg-secondary">{t('vacio.subdominioDescripcion')}</span>
          </div>
          {hostSubdominio && <DomainStatusBadge estado="activo" />}
          <button type="button" onClick={onCambiarSubdominio} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <IconoDominio icono={ICONO_ACCION_DOMINIO.cambiarSubdominio} />
            {hostSubdominio ? t('pagina.cambiarSubdominio') : t('vacio.elegirSubdominio')}
          </button>
        </div>
      </Tarjeta>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Tarjeta>
          <div className="flex flex-col items-start gap-3">
            <IconoDominio icono={ICONO_TARJETA_DOMINIO.conectarMio} tamano="fila" className="text-fg-secondary" />
            <h2 className="text-base font-semibold text-fg">{t('vacio.yaTienesTitulo')}</h2>
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('vacio.yaTienesTexto')}</p>
            <button type="button" onClick={onConectar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              <IconoDominio icono={ICONO_ACCION_DOMINIO.conectar} />
              {t('vacio.conectarMio')}
            </button>
          </div>
        </Tarjeta>
        <Tarjeta>
          <div className="flex flex-col items-start gap-3">
            <IconoDominio icono={ICONO_TARJETA_DOMINIO.comprarAqui} tamano="fila" className="text-fg-secondary" />
            <h2 className="text-base font-semibold text-fg">{t('vacio.compraTitulo')}</h2>
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('vacio.compraTexto')}</p>
            <button
              type="button"
              onClick={onComprar}
              disabled={!puedeComprar}
              title={puedeComprar ? undefined : t('pagina.sinPermisoComprar')}
              className={clasesBoton({ variante: 'primario', tamano: 'md' })}
            >
              <IconoDominio icono={ICONO_ACCION_DOMINIO.buscar} />
              {t('vacio.buscar')}
            </button>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
