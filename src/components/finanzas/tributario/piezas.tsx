'use client';

/**
 * Piezas comunes de las cuatro pantallas de Tributario (Finanzas R4-A): la
 * cabecera con migas Finanzas › Tributario, el aviso «pendiente de activar»
 * (migración propuesta sin aplicar: nunca se muestra cero) y el estado de una
 * lectura. Todo sobre el kit.
 */
import { useTranslations } from 'next-intl';
import { ListChecks, type LucideIcon } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader } from '@/components/kit';
import { RUTAS_TRIBUTARIO } from './tributarioCliente';

export type Lectura<T> = { estado: 'cargando' } | { estado: 'listo'; datos: T } | { estado: 'error'; codigo: string };

export function CabeceraTributario({
  titulo,
  subtitulo,
  acciones,
  icono = ListChecks,
  enCentro = false,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  acciones?: React.ReactNode;
  icono?: LucideIcon;
  /** El Centro tributario es la raíz del grupo: su miga final no enlaza a sí mismo. */
  enCentro?: boolean;
}) {
  const t = useTranslations('finanzasTributarioR4.comun');
  return (
    <PageHeader
      titulo={titulo}
      subtitulo={subtitulo}
      icono={icono}
      migas={[
        { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
        enCentro ? { etiqueta: t('migas.tributario') } : { etiqueta: t('migas.tributario'), href: RUTAS_TRIBUTARIO.centro },
        ...(enCentro ? [] : [{ etiqueta: titulo }]),
      ]}
      acciones={acciones}
    />
  );
}

/** La función o la tabla de esta pantalla aún no está en la base. */
export function AvisoPendienteActivar({ descripcion }: { descripcion: string }) {
  const t = useTranslations('finanzasTributarioR4.comun');
  return <AvisoTonal tono="informacion" titulo={t('pendiente.titulo')} descripcion={descripcion} />;
}

/** Sin permiso o error de lectura (nunca un vacío que parezca «no hay nada»). */
export function ErrorLectura({ codigo, onReintentar }: { codigo: string; onReintentar: () => void }) {
  const t = useTranslations('finanzasTributarioR4.comun');
  if (codigo === 'sin_permiso') {
    return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />;
  }
  return (
    <AvisoTonal
      tono="peligro"
      rol="alert"
      titulo={t('error.titulo')}
      descripcion={t('error.descripcion')}
      accion={{ etiqueta: t('error.reintentar'), onClick: onReintentar }}
    />
  );
}

/** Banda «Son borradores para revisar»: nada se presenta ante la DIAN desde aquí. */
export function AvisoBorradores() {
  const t = useTranslations('finanzasTributarioR4.comun');
  return <AvisoTonal tono="informacion" titulo={t('borradores.titulo')} descripcion={t('borradores.descripcion')} />;
}

export function codigoDe(err: unknown): string {
  const c = (err as { codigo?: unknown } | null)?.codigo;
  return typeof c === 'string' ? c : 'desconocido';
}
