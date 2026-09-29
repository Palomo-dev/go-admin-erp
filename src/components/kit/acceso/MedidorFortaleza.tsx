'use client';

/**
 * Medidor de fortaleza (Figma `MedidorFortaleza` 1126:35448): cuatro segmentos,
 * el nivel («Seguridad: fuerte») y los tres requisitos de la política única
 * (`lib/auth/politicaContrasena.ts`): 10 caracteres o más, no aparece en
 * filtraciones conocidas, distinta de tu correo.
 *
 * Sustituye al `PasswordField State=fortaleza` de la política vieja (8 + 4
 * reglas). La comprobación de filtraciones corre con retardo mientras se
 * escribe (k-anonimato: solo sale el prefijo del SHA-1); el servidor vuelve a
 * comprobarla al guardar.
 */
import * as React from 'react';
import { CheckCircle2, Circle, XCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import {
  LONGITUD_MINIMA_CONTRASENA,
  estaFiltrada,
  evaluarContrasena,
  type EvaluacionContrasena,
  type NivelFortaleza,
} from '@/lib/auth/politicaContrasena';

const SEGMENTOS: Record<NivelFortaleza, { llenos: number; color: string; texto: string }> = {
  vacia: { llenos: 0, color: 'bg-line', texto: 'text-fg-muted' },
  debil: { llenos: 1, color: 'bg-danger', texto: 'text-danger-text' },
  aceptable: { llenos: 3, color: 'bg-warning', texto: 'text-warning-text' },
  fuerte: { llenos: 4, color: 'bg-success', texto: 'text-success-text' },
};

/**
 * Evalúa la contraseña y comprueba filtraciones con retardo. `comprobando` es
 * true mientras la consulta está en vuelo.
 */
export function useEvaluacionContrasena(
  contrasena: string,
  correo?: string | null,
  opciones: { retardoMs?: number; comprobarFiltracion?: boolean } = {},
): EvaluacionContrasena & { comprobando: boolean } {
  const { retardoMs = 500, comprobarFiltracion = true } = opciones;
  const [filtrada, setFiltrada] = React.useState<boolean | null>(null);
  const [comprobando, setComprobando] = React.useState(false);

  React.useEffect(() => {
    setFiltrada(null);
    if (!comprobarFiltracion || contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
      setComprobando(false);
      return;
    }
    let vivo = true;
    setComprobando(true);
    const t = setTimeout(async () => {
      const r = await estaFiltrada(contrasena);
      if (!vivo) return;
      setFiltrada(r);
      setComprobando(false);
    }, retardoMs);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [contrasena, retardoMs, comprobarFiltracion]);

  const evaluacion = evaluarContrasena(contrasena, { correo, filtrada });
  return { ...evaluacion, comprobando };
}

function Requisito({ cumple, texto, pendiente }: { cumple: boolean | null; texto: string; pendiente?: boolean }) {
  const Icono = pendiente ? Loader2 : cumple === true ? CheckCircle2 : cumple === false ? XCircle : Circle;
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 text-xs',
        cumple === true ? 'text-success-text' : cumple === false ? 'text-danger-text' : 'text-fg-muted',
      )}
    >
      <Icono className={cn('size-3.5 shrink-0', pendiente && 'animate-spin')} aria-hidden="true" />
      <span>{texto}</span>
    </li>
  );
}

export interface MedidorFortalezaProps {
  evaluacion: EvaluacionContrasena & { comprobando?: boolean };
  /** Sin contraseña escrita aún, los requisitos se muestran neutros. */
  className?: string;
  id?: string;
}

export function MedidorFortaleza({ evaluacion, className, id }: MedidorFortalezaProps) {
  const t = useTranslations('acceso.contrasena');
  const { nivel, requisitos, comprobando } = evaluacion;
  const seg = SEGMENTOS[nivel];
  const vacia = nivel === 'vacia';
  return (
    <div id={id} className={cn('space-y-2', className)}>
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < seg.llenos ? seg.color : 'bg-line')} />
        ))}
      </div>
      <p className={cn('text-xs font-medium', seg.texto)} aria-live="polite">
        {t(`nivel.${nivel}`)}
      </p>
      <ul className="space-y-1" aria-label={t('requisitos')}>
        <Requisito cumple={vacia ? null : requisitos.longitud} texto={t('requisitoLongitud', { n: LONGITUD_MINIMA_CONTRASENA })} />
        <Requisito
          cumple={vacia ? null : requisitos.noFiltrada}
          pendiente={!vacia && !!comprobando}
          texto={t('requisitoFiltrada')}
        />
        <Requisito cumple={vacia ? null : requisitos.distintaDelCorreo} texto={t('requisitoCorreo')} />
      </ul>
    </div>
  );
}
