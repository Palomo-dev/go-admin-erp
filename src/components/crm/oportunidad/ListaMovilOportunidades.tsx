'use client';

import { OpportunityCard } from '@/components/crm/kit/OpportunityCard';
import { OpportunityRowMenu } from '@/components/crm/kit/OpportunityRowMenu';
import { CargarMas } from '@/components/crm/kit/CargarMas';
import { estadoAccionesRapidas } from '@/components/crm/kit/quickActionLogica';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrgDefaultCountry } from '@/components/crm/shared/useOrgDefaultCountry';
import { aTarjeta, permisosFila, type OportunidadApi, type PermisosPantalla } from './oportunidadLogica';
import type { useAccionesOportunidad } from './useAccionesOportunidad';

/**
 * Lista móvil (Figma 775:471491 Oportunidades, 771:37311 Pipeline por etapa,
 * 845:82719 selección): `OpportunityCard` en densidad lista con casilla, menú
 * en hoja y «Cargar 25 más».
 */
export interface ListaMovilOportunidadesProps {
  filas: readonly OportunidadApi[];
  total: number | null;
  cargando: boolean;
  error?: string | null;
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  acciones: ReturnType<typeof useAccionesOportunidad>;
  seleccion: ReadonlySet<string>;
  onSeleccion: (id: string) => void;
  onAbrir: (id: string) => void;
  onCargarMas: () => void;
  /** Pipeline móvil: tarjeta de kanban (sin casilla), una columna a la vez. */
  densidad?: 'lista' | 'kanban';
}

export function ListaMovilOportunidades(p: ListaMovilOportunidadesProps) {
  const moneda = useMonedaOrganizacion();
  const pais = useOrgDefaultCountry() ?? undefined;
  return (
    <div className="flex flex-col gap-2">
      {p.filas.map((op) => (
        <OpportunityCard
          key={op.id}
          oportunidad={aTarjeta(op, p.usuarios)}
          moneda={moneda.paraDocumento(op.currency)}
          densidad={p.densidad ?? 'lista'}
          seleccionada={p.seleccion.has(op.id)}
          onSeleccionChange={() => p.onSeleccion(op.id)}
          onAbrir={p.onAbrir}
          estadosAcciones={estadoAccionesRapidas({ cliente: op.cliente ?? null, tieneDestino: true, paisPorDefecto: pais })}
          onAccion={(a) => p.acciones.alAccionRapida(op, a)}
          menu={<OpportunityRowMenu titulo={op.name} status={op.status} permisos={permisosFila(p.permisos, p.usuarioId, op)} onAccion={(a) => p.acciones.alMenu(op, a)} />}
        />
      ))}
      <CargarMas mostrados={p.filas.length} total={p.total} tamanoPagina={25} cargando={p.cargando} error={p.error} onCargar={p.onCargarMas} entidad="oportunidades" />
    </div>
  );
}
