'use client';

/**
 * Envolturas de las páginas de detalle de Asistencia: leen el vínculo y el día
 * de la ruta y el período de la URL (`desde`/`hasta`, por defecto la quincena).
 */
import { useParams } from 'next/navigation';
import { HojaPersona } from './HojaPersona';
import { HorasRecargos } from './HorasRecargos';
import { TurnoVigencias } from './TurnoVigencias';
import { usePeriodo } from './comunAsistencia';

function parametro(p: Record<string, string | string[]> | null, nombre: string): string {
  const v = p?.[nombre];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export function PaginaHoja() {
  const p = useParams();
  const { desde, hasta } = usePeriodo();
  return <HojaPersona vinculo={parametro(p, 'vinculo')} desde={desde} hasta={hasta} />;
}

export function PaginaHoras() {
  const p = useParams();
  const { desde, hasta } = usePeriodo();
  return <HorasRecargos vinculo={parametro(p, 'vinculo')} desde={desde} hasta={hasta} />;
}

export function PaginaTurno() {
  const p = useParams();
  const { desde, hasta } = usePeriodo();
  return <TurnoVigencias vinculo={parametro(p, 'vinculo')} fecha={parametro(p, 'fecha')} desde={desde} hasta={hasta} />;
}
