'use client';

/**
 * Las tres tarjetas de ayuda bajo la tabla (Figma B/07-01): qué dominio abre
 * el sitio, renovaciones y el correo. Solo texto: no prometen nada que el
 * servidor no haga. Cada una lleva el icono de su tema en la caja de 32 de
 * `Tarjeta` (estrella = principal, calendario = renovación, sobre = correo),
 * para que se encuentre de un vistazo; la captura no lo traía.
 */
import { Tarjeta } from '@/components/kit';
import { ICONO_TARJETA_DOMINIO } from './iconosDominios';
import { useTextosDominios } from './textos';

export function TarjetasAyudaDominios() {
  const t = useTextosDominios();
  const tarjetas = [
    { titulo: t('ayuda.queDominioTitulo'), texto: t('ayuda.queDominioTexto'), icono: ICONO_TARJETA_DOMINIO.ayudaPrincipal },
    { titulo: t('ayuda.renovacionesTitulo'), texto: t('ayuda.renovacionesTexto'), icono: ICONO_TARJETA_DOMINIO.ayudaRenovaciones },
    { titulo: t('ayuda.correoTitulo'), texto: t('ayuda.correoTexto'), icono: ICONO_TARJETA_DOMINIO.ayudaCorreo },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {tarjetas.map((c) => (
        <Tarjeta key={c.titulo} titulo={c.titulo} icono={c.icono}>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{c.texto}</p>
        </Tarjeta>
      ))}
    </div>
  );
}
