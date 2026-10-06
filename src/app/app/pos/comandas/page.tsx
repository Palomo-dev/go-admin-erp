'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { ESTACIONES_COCINA } from '@/lib/pos/estacionEfectiva';
import { aspectoEstacion } from '@/lib/pos/cocina/tableroComandas';
import { ComandasV2 } from '@/components/pos/comandas/v2/ComandasV2';
import { PantallaCocina } from '@/components/pos/comandas/v2/PantallaCocina';
import { HistorialComandas } from '@/components/pos/comandas/v2/HistorialComandas';
import { useComandasTurno } from '@/components/pos/comandas/v2/useComandasTurno';

/**
 * /app/pos/comandas — Comandas v2 (Figma «POS — Comandas v2 (propuesta)»,
 * 959:583911). Dos modos sobre los mismos datos:
 * - Tablero (por defecto): gestión en escritorio y móvil.
 * - Cocina (`?modo=cocina&estacion=hot_kitchen`): KDS a pantalla completa en la
 *   tablet, enlazable como acceso directo.
 * `?vista=historial`: entregadas y canceladas, paginadas.
 */
const CLAVE_SONIDO = 'goadmin.comandas.sonido';

function leerSonido(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SONIDO) !== '0';
  } catch {
    return true;
  }
}

function PaginaComandas() {
  const router = useRouter();
  const pathname = usePathname() ?? '/app/pos/comandas';
  const params = useSearchParams() ?? new URLSearchParams();
  const { toast } = useToast();
  const t = useTranslations('posComandasV2');
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const { timezone } = useOrgTimezone();
  const [sonido, setSonido] = React.useState(true);
  React.useEffect(() => setSonido(leerSonido()), []);
  const alternarSonido = () =>
    setSonido((s) => {
      try {
        window.localStorage.setItem(CLAVE_SONIDO, s ? '0' : '1');
      } catch {
        // sin almacenamiento: solo esta sesión
      }
      return !s;
    });

  const modo = params.get('modo') === 'cocina' ? 'cocina' : 'tablero';
  const vista = params.get('vista') === 'historial' ? 'historial' : 'tablero';
  const estacionUrl = params.get('estacion');
  const [estacionTablero, setEstacionTablero] = React.useState<string>('todas');
  const estacionesKds = (ESTACIONES_COCINA as readonly string[]).filter((e) => aspectoEstacion(e).preparacion);
  const estacionKds = estacionUrl && /^[a-z0-9_]{1,60}$/.test(estacionUrl) ? estacionUrl : estacionesKds[0];

  const irA = React.useCallback(
    (cambios: Record<string, string | null>) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    },
    [params, pathname, router],
  );

  const aviso = React.useCallback(
    (a: { titulo: string; descripcion?: string; tono?: 'error' | 'ok'; accion?: { etiqueta: string; onClick: () => void } }) => {
      toast({
        title: a.titulo,
        description: a.descripcion,
        variant: a.tono === 'error' ? 'destructive' : undefined,
        action: a.accion ? (
          <ToastAction altText={a.accion.etiqueta} onClick={a.accion.onClick}>
            {a.accion.etiqueta}
          </ToastAction>
        ) : undefined,
      });
    },
    [toast],
  );

  const turno = useComandasTurno({
    organizationId: organization?.id,
    branchId: branchFilter,
    timezone,
    aviso,
    sonido,
  });
  const sede = branchFilter != null ? branches.find((b) => b.id === branchFilter)?.name ?? null : t('cabecera.todasSedes');

  if (vista === 'historial' && organization?.id) {
    return (
      <HistorialComandas
        organizationId={organization.id}
        branchId={branchFilter}
        timezone={timezone}
        onVolver={() => irA({ vista: null })}
      />
    );
  }

  if (modo === 'cocina') {
    return (
      <PantallaCocina
        turno={turno}
        estacion={estacionKds}
        estaciones={estacionesKds}
        onEstacion={(e) => irA({ estacion: e })}
        onSalir={() => irA({ modo: null, estacion: null })}
        timezone={timezone}
        sonido={sonido}
        onSonido={alternarSonido}
      />
    );
  }

  return (
    <ComandasV2
      turno={turno}
      sedeNombre={sede}
      timezone={timezone}
      sonido={sonido}
      onSonido={alternarSonido}
      estacion={estacionTablero}
      onEstacion={setEstacionTablero}
      onPantallaCocina={() => irA({ modo: 'cocina', estacion: estacionTablero !== 'todas' ? estacionTablero : estacionKds })}
      onHistorial={() => irA({ vista: 'historial' })}
      onConfigurar={() => router.push('/app/pos/configuracion')}
    />
  );
}

export default function ComandasPage() {
  return (
    <Suspense fallback={null}>
      <PaginaComandas />
    </Suspense>
  );
}
