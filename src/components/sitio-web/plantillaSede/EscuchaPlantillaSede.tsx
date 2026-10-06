'use client';

/**
 * Escucha el resultado de `sincronizarPlantillaSede` (lo emite `branchService` al crear una
 * sucursal con tipo de negocio o al cambiárselo) y lo cuenta:
 * - `creado` / `reemplazado`: aviso «El sitio de <sede> se creó con la plantilla de <tipo>».
 * - `pendiente_confirmacion`: el sitio ya tiene contenido propio → abre «Aplicar plantilla de
 *   <tipo>» con confirmación; si se cancela, no se toca nada.
 * Se monta en la pantalla que guarda sucursales (no dentro del formulario).
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EVENTO_PLANTILLA_SEDE } from '@/lib/website/v2/sincronizarPlantillaSede';
import type { ResultadoPlantillaSede } from '@/lib/website/v2/plantillaSede';
import { DialogoAplicarPlantillaSede } from './DialogoAplicarPlantillaSede';
import { useTextosPlantillaSede } from './textos';

export function EscuchaPlantillaSede({
  nombreSede,
  onCambio,
}: {
  nombreSede: (branchId: number) => string;
  /** El sitio de una sede se creó o cambió (p. ej. recargar la lista). */
  onCambio?: () => void;
}) {
  const t = useTextosPlantillaSede();
  const [pendiente, setPendiente] = useState<ResultadoPlantillaSede | null>(null);

  useEffect(() => {
    const alRecibir = (e: Event) => {
      const r = (e as CustomEvent<ResultadoPlantillaSede>).detail;
      if (!r || !r.tipo) return;
      const valores = { tipo: t(`tipos.${r.tipo}`), sede: nombreSede(r.branchId) };
      if (r.accion === 'creado') toast.success(t('creada', valores), { description: t('enBorrador') });
      else if (r.accion === 'reemplazado') toast.success(t('aplicada', valores), { description: t('enBorrador') });
      else if (r.accion === 'pendiente_confirmacion') setPendiente(r);
      if (r.accion === 'creado' || r.accion === 'reemplazado') onCambio?.();
    };
    window.addEventListener(EVENTO_PLANTILLA_SEDE, alRecibir);
    return () => window.removeEventListener(EVENTO_PLANTILLA_SEDE, alRecibir);
  }, [t, nombreSede, onCambio]);

  if (!pendiente) return null;
  return (
    <DialogoAplicarPlantillaSede
      abierto
      onAbiertoChange={(a) => !a && setPendiente(null)}
      branchId={pendiente.branchId}
      nombreSede={nombreSede(pendiente.branchId)}
      pendiente
      onAplicada={() => onCambio?.()}
    />
  );
}
