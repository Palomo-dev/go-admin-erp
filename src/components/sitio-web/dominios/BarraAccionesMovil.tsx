'use client';

/**
 * Barra inferior fija de Dominios en móvil (Figma B/07-25): «Conectar»
 * (secundario) y «Comprar» (primario), con el margen del área segura. Solo
 * por debajo de lg; en escritorio las acciones viven en la cabecera.
 */
import { clasesBoton } from '@/components/kit';
import { ICONO_ACCION_DOMINIO, IconoDominio } from './iconosDominios';
import { useTextosDominios } from './textos';

export interface BarraAccionesMovilProps {
  onConectar: () => void;
  onComprar: () => void;
  puedeComprar: boolean;
}

export function BarraAccionesMovil({ onConectar, onComprar, puedeComprar }: BarraAccionesMovilProps) {
  const t = useTextosDominios();
  return (
    <>
      {/* Reserva el alto de la barra para que no tape la última tarjeta. */}
      <div aria-hidden="true" className="h-20 lg:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <button type="button" onClick={onConectar} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
          <IconoDominio icono={ICONO_ACCION_DOMINIO.conectar} tamano="fila" />
          {t('pagina.conectarCorto')}
        </button>
        <button
          type="button"
          onClick={onComprar}
          disabled={!puedeComprar}
          title={puedeComprar ? undefined : t('pagina.sinPermisoComprar')}
          className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })}
        >
          <IconoDominio icono={ICONO_ACCION_DOMINIO.comprar} tamano="fila" />
          {t('pagina.comprarCorto')}
        </button>
      </div>
    </>
  );
}
