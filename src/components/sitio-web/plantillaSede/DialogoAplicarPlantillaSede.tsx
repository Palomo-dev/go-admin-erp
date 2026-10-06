'use client';

/**
 * «Aplicar plantilla de <tipo> a esta sede»: confirmación (patrón de Figma A/06c «Reemplaza…
 * se crea un borrador: nada cambia en línea hasta que publiques») y llamada a
 * `POST /api/sitio-web/sedes/<id>/plantilla { modo: 'confirmado', version }`.
 *
 * Lee el estado al abrirse (tipo y versión del borrador) para que el compare-and-swap use la
 * versión que hay en la base, no una vieja. Lo usan el editor (menú «⋯» con una sede abierta) y la
 * pantalla de Sucursales cuando el guardado responde `pendiente_confirmacion`.
 */
import { useEffect, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/kit';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import type { EstadoPlantillaSede, ResultadoPlantillaSede } from '@/lib/website/v2/plantillaSede';
import { useTextosPlantillaSede } from './textos';

export interface DialogoAplicarPlantillaSedeProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  branchId: number;
  nombreSede: string;
  /** El guardado de la sucursal respondió `pendiente_confirmacion` (cambia la descripción). */
  pendiente?: boolean;
  /** Antes de aplicar (p. ej. el editor guarda lo pendiente). `false` cancela. */
  antesDeAplicar?: () => Promise<boolean>;
  onAplicada?: (resultado: ResultadoPlantillaSede) => void | Promise<void>;
}

export function DialogoAplicarPlantillaSede(p: DialogoAplicarPlantillaSedeProps) {
  const t = useTextosPlantillaSede();
  const [estado, setEstado] = useState<EstadoPlantillaSede | null>(null);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const { abierto, branchId } = p;

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setEstado(null);
    setCargandoEstado(true);
    clienteSitiosV2
      .plantillaSede(branchId)
      .then((e) => vigente && setEstado(e))
      .catch(() => vigente && setEstado(null))
      .finally(() => vigente && setCargandoEstado(false));
    return () => {
      vigente = false;
    };
  }, [abierto, branchId]);

  const tipo = estado?.tipo ? t(`tipos.${estado.tipo}`) : '';
  const valores = { tipo, sede: p.nombreSede };

  const aplicar = async () => {
    if (!estado?.tipo) {
      toast.error(t('error'));
      return;
    }
    setAplicando(true);
    try {
      if (p.antesDeAplicar && !(await p.antesDeAplicar())) return;
      // Leer otra vez justo antes: el editor pudo guardar en `antesDeAplicar`.
      const actual = await clienteSitiosV2.plantillaSede(branchId);
      const r =
        actual.sitioId && actual.version
          ? await clienteSitiosV2.aplicarPlantillaSede(branchId, 'confirmado', actual.version)
          : await clienteSitiosV2.aplicarPlantillaSede(branchId, 'auto');
      if (r.accion === 'sin_cambios') toast.info(t('sinCambios', valores));
      else toast.success(t(r.accion === 'creado' ? 'creada' : 'aplicada', valores), { description: t('enBorrador') });
      await p.onAplicada?.(r);
      p.onAbiertoChange(false);
    } catch (error) {
      const noDisponible = error instanceof ErrorApiSitio && error.codigo === 'no_disponible';
      toast.error(t('error'), { description: noDisponible ? t('noDisponible') : error instanceof Error ? error.message : undefined });
    } finally {
      setAplicando(false);
    }
  };

  return (
    <ConfirmDialog
      abierto={p.abierto}
      onAbiertoChange={p.onAbiertoChange}
      titulo={t('titulo', valores)}
      descripcion={t(p.pendiente ? 'descripcionPendiente' : 'descripcion', valores)}
      textoConfirmar={t('confirmar')}
      textoCancelar={p.pendiente ? t('ahoraNo') : undefined}
      tono="advertencia"
      icono={LayoutTemplate}
      cargando={aplicando || cargandoEstado}
      onConfirmar={aplicar}
    />
  );
}
