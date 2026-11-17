'use client';

/**
 * Detalle de un embargo y su límite legal (Figma 20.21.3). El límite lo aplica el
 * motor en cada colilla (ADR-003 §2.7: alimentos → cooperativas → ordinarios; todos
 * hasta el 50 % y los ordinarios además hasta 1/5 del excedente del mínimo); aquí
 * solo se explica.
 */
import { useTranslations } from 'next-intl';
import { Scale } from 'lucide-react';
import { AvisoTonal, Dialogo, FilaDato, ListaDatos, StatusBadge } from '@/components/kit';
import { TONO_DEDUCCION, type EmbargoFuente } from './nominaLogica';
import { useDinero, useFechas } from './piezasNomina';

export function DialogoEmbargo({ embargo, nombre, onCerrar }: { embargo: EmbargoFuente | null; nombre: string | null; onCerrar: () => void }) {
  const t = useTranslations('hrmNomina.embargo');
  const tp = useTranslations('hrmNomina.prestamos');
  const dinero = useDinero();
  const f = useFechas();
  if (!embargo) return null;
  const clase = embargo.tipo === 'alimentos' ? 'embargo_alimentos' : embargo.tipo === 'cooperativa' ? 'embargo_cooperativa' : 'embargo_ordinario';
  const saldo = embargo.total === null ? null : Math.max(0, embargo.total - embargo.aplicado);
  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={tp(`clases.${clase}`)}
      descripcion={nombre ?? undefined}
      icono={Scale}
      ancho={520}
      primario={{ etiqueta: t('cerrar'), onClick: onCerrar }}
      textoCancelar={t('volver')}
    >
      <div className="flex flex-col gap-4">
        <ListaDatos etiqueta={t('datos')} divisores>
          <FilaDato etiqueta={t('estado')} valor={<StatusBadge estado={embargo.estado} etiqueta={tp(`estados.${embargo.estado}`)} tono={TONO_DEDUCCION[embargo.estado]} />} />
          <FilaDato etiqueta={t('beneficiario')} valor={embargo.beneficiario ?? '—'} />
          <FilaDato etiqueta={t('oficio')} valor={embargo.oficio ?? '—'} />
          <FilaDato etiqueta={t('recibido')} valor={f.corta(embargo.recibido)} />
          <FilaDato etiqueta={t('vigencia')} valor={embargo.hasta ? f.rango(embargo.desde, embargo.hasta) : t('desdeSinFin', { fecha: f.corta(embargo.desde) })} />
          <FilaDato
            etiqueta={t('ordena')}
            valor={embargo.modo === 'porcentaje' ? t('porcentaje', { pct: Math.round(embargo.valor * 1000) / 10 }) : t('fijo', { valor: dinero(embargo.valor) })}
          />
          <FilaDato etiqueta={t('total')} valor={embargo.total === null ? t('sinTope') : dinero(embargo.total)} />
          <FilaDato etiqueta={t('aplicado')} valor={dinero(embargo.aplicado)} />
          <FilaDato etiqueta={t('saldo')} valor={saldo === null ? '—' : dinero(saldo)} tamano="lg" separadorAntes />
        </ListaDatos>
        <AvisoTonal tono="informacion" titulo={t('limiteTitulo')} descripcion={t(`limite.${embargo.tipo}`)} />
      </div>
    </Dialogo>
  );
}
