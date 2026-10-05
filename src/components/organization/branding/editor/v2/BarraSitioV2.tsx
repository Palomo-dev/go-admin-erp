'use client';

import { AlertTriangle, CheckCircle2, CircleDot, History, Loader2, MoreHorizontal, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/Utils';

/** Estados del guardado del borrador (FASE-03 UX, Figma 05h/05i). */
export type EstadoGuardadoV2 = 'guardado' | 'cambios' | 'guardando' | 'conflicto' | 'error' | 'publicado';

const ESTADO: Record<EstadoGuardadoV2, { texto: string; clase: string; Icono: typeof CircleDot }> = {
  guardado: { texto: 'Guardado en borrador', clase: 'bg-white/15 text-white', Icono: CircleDot },
  cambios: { texto: 'Cambios sin guardar', clase: 'bg-amber-300/30 text-white', Icono: CircleDot },
  guardando: { texto: 'Guardando…', clase: 'bg-white/15 text-white', Icono: Loader2 },
  conflicto: { texto: 'Conflicto', clase: 'bg-red-500/80 text-white', Icono: AlertTriangle },
  error: { texto: 'No se guardó', clase: 'bg-red-500/80 text-white', Icono: XCircle },
  publicado: { texto: 'Publicado', clase: 'bg-emerald-500/80 text-white', Icono: CheckCircle2 },
};

interface AccionesSitioV2Props {
  estado: EstadoGuardadoV2;
  nombrePublicar: string;
  publicando: boolean;
  puedePublicar: boolean;
  onHistorial: () => void;
  onPublicar: () => void;
  /** Acciones del menú «…»: adopción, volver al editor actual, menús. */
  acciones: { id: string; texto: string; onSelect: () => void; deshabilitada?: boolean; peligro?: boolean }[];
}

/** Estado del borrador + Historial + Publicar + menú «…», a la derecha del encabezado del editor. */
export function AccionesSitioV2({ estado, nombrePublicar, publicando, puedePublicar, onHistorial, onPublicar, acciones }: AccionesSitioV2Props) {
  const { texto, clase, Icono } = ESTADO[estado];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', clase)}>
        <Icono className={cn('h-3 w-3', estado === 'guardando' && 'animate-spin')} aria-hidden />
        {texto}
      </span>
      <Button type="button" size="sm" variant="ghost" className="h-8 text-white hover:bg-white/10 hover:text-white" onClick={onHistorial}>
        <History className="h-3.5 w-3.5 mr-1.5" />
        Historial
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8 bg-white text-blue-700 hover:bg-blue-50"
        onClick={onPublicar}
        disabled={!puedePublicar || publicando}
      >
        {publicando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
        {nombrePublicar}
      </Button>
      {acciones.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" aria-label="Más acciones del sitio">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-xs text-gray-500">Sitio V2</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {acciones.map((a) => (
              <DropdownMenuItem
                key={a.id}
                disabled={a.deshabilitada}
                onSelect={a.onSelect}
                className={cn(a.peligro && 'text-red-600 focus:text-red-700')}
              >
                {a.texto}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

interface BandaSitioV2Props {
  esSede: boolean;
  nombreSitio: string;
  v2Adoptado: boolean;
  personalizados: number;
  baseDesdeLegacy: boolean;
  erroresContrato: number;
  onVerPersonalizado?: () => void;
  onIrPrincipal?: () => void;
}

/**
 * Banda bajo el encabezado del editor. Sede: «Editando Sede … — lo que no personalices se
 * hereda del sitio principal» (Figma 05-22). Principal: aclara que la web sigue igual hasta
 * activar V2 (ADR-002 D4).
 */
export function BandaSitioV2({
  esSede,
  nombreSitio,
  v2Adoptado,
  personalizados,
  baseDesdeLegacy,
  erroresContrato,
  onVerPersonalizado,
  onIrPrincipal,
}: BandaSitioV2Props) {
  return (
    <div
      className={cn(
        'w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs border-b',
        esSede
          ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900'
          : 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/30 dark:text-sky-100 dark:border-sky-900',
      )}
    >
      <p className="flex-1 min-w-[240px]">
        {esSede ? (
          <>
            <strong>Editando {nombreSitio}</strong> — lo que no personalices se hereda del sitio principal
            {baseDesdeLegacy ? ' (su versión actual, porque aún no tiene versión V2 publicada)' : ' (su última versión publicada)'}.
          </>
        ) : (
          <>
            <strong>Editando el borrador V2 del sitio principal.</strong>{' '}
            {v2Adoptado
              ? 'V2 está activo: lo que publiques es lo que ven tus clientes.'
              : 'La web sigue mostrando el sitio actual hasta que actives V2. Guardar y publicar no la cambian.'}
          </>
        )}
        {erroresContrato > 0 ? ` · El borrador tiene ${erroresContrato} problema(s) de formato: corrígelos antes de publicar.` : ''}
      </p>
      {esSede && onVerPersonalizado ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onVerPersonalizado}>
          Ver lo personalizado ({personalizados})
        </Button>
      ) : null}
      {esSede && onIrPrincipal ? (
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs bg-white dark:bg-transparent" onClick={onIrPrincipal}>
          Ir al sitio principal
        </Button>
      ) : null}
    </div>
  );
}
