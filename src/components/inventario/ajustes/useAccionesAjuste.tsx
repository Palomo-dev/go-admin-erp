'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ClipboardCheck, Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import { Dialogo, DialogoMotivo, type AccionFila } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { puede } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { adjustmentService, type EstadoAjuste, type ResultadoAplicar } from '@/lib/services/adjustmentService';
import { nuevaClaveAplicar, rutaAjuste, rutaEditarAjuste, rutaNuevoAjuste } from './logica';
import { useMensajeErrorAjuste } from './piezas';

/** Lo mínimo de un ajuste para armar su menú (fila del listado o cabecera del detalle). */
export interface AjusteAccionable {
  id: number;
  codigo: string;
  estado: EstadoAjuste;
  sucursal: { id: number; nombre: string };
}

/**
 * Acciones de un ajuste (menú «⋯» de la fila, hoja móvil, barra de selección y
 * cabecera del detalle; Figma 586:306452, 586:309146 y 587:306460) con sus dos
 * diálogos: «Aplicar» (confirmación; aplica cada ajuste en UNA transacción con
 * su clave de idempotencia) y «Descartar borrador» (con motivo). La RPC vuelve a
 * exigir el permiso `ajustar`: aquí solo se ocultan las acciones que no se pueden hacer.
 */
export function useAccionesAjuste({
  permisos,
  onCambio,
  enDetalle = false,
}: {
  permisos: PermisosInventario;
  onCambio: (resultado?: ResultadoAplicar) => void;
  enDetalle?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioAjustes.acciones');
  const mensajeError = useMensajeErrorAjuste();
  const [aAplicar, setAAplicar] = useState<AjusteAccionable[] | null>(null);
  const [aDescartar, setADescartar] = useState<AjusteAccionable[] | null>(null);
  const [claves, setClaves] = useState<Record<number, string>>({});
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeAjustar = puede(permisos, 'ajustar');

  const pedirAplicar = useCallback((lista: readonly AjusteAccionable[]) => {
    const borradores = lista.filter((a) => a.estado === 'draft');
    if (borradores.length === 0) return;
    // Una clave por intento: si la red corta y se reintenta, el servidor no aplica dos veces.
    setClaves(Object.fromEntries(borradores.map((a) => [a.id, nuevaClaveAplicar(a.id)])));
    setError(null);
    setAAplicar(borradores);
  }, []);

  const pedirDescartar = useCallback((lista: readonly AjusteAccionable[]) => {
    const borradores = lista.filter((a) => a.estado === 'draft');
    if (borradores.length === 0) return;
    setError(null);
    setADescartar(borradores);
  }, []);

  const aplicar = async () => {
    if (!aAplicar) return;
    const org = getOrganizationId();
    setTrabajando(true);
    setError(null);
    let aplicados = 0;
    let ultimo: ResultadoAplicar | undefined;
    const fallos: string[] = [];
    for (const a of aAplicar) {
      try {
        ultimo = await adjustmentService.aplicar(org, a.id, claves[a.id] ?? nuevaClaveAplicar(a.id));
        aplicados += 1;
        if (ultimo.recalculados.length > 0) {
          toast({
            title: t('aplicar.recalculadoTitulo', { codigo: a.codigo }),
            description: t('aplicar.recalculadoDescripcion', { count: ultimo.recalculados.length }),
          });
        }
      } catch (e) {
        fallos.push(`${a.codigo}: ${mensajeError(e)}`);
      }
    }
    setTrabajando(false);
    if (fallos.length > 0 && aAplicar.length === 1) {
      // Un solo ajuste: el error se queda en el diálogo para corregir o cancelar.
      setError(fallos[0].replace(/^[^:]+:\s*/, ''));
      return;
    }
    setAAplicar(null);
    if (aplicados > 0) {
      toast({
        title:
          aAplicar.length === 1 && ultimo
            ? ultimo.ya_aplicado
              ? t('aplicar.yaAplicado', { codigo: ultimo.code })
              : t('aplicar.listo', { codigo: ultimo.code, count: ultimo.movimientos })
            : t('aplicar.listoVarios', { count: aplicados }),
      });
    }
    if (fallos.length > 0) {
      toast({ variant: 'destructive', title: t('aplicar.fallos', { count: fallos.length }), description: fallos.join(' · ') });
    }
    onCambio(aAplicar.length === 1 ? ultimo : undefined);
  };

  const descartar = async (motivo: string) => {
    if (!aDescartar) return;
    const org = getOrganizationId();
    setTrabajando(true);
    setError(null);
    const fallos: string[] = [];
    for (const a of aDescartar) {
      try {
        await adjustmentService.descartar(org, a.id, motivo);
      } catch (e) {
        fallos.push(`${a.codigo}: ${mensajeError(e)}`);
      }
    }
    setTrabajando(false);
    if (fallos.length > 0 && aDescartar.length === 1) {
      setError(fallos[0].replace(/^[^:]+:\s*/, ''));
      return;
    }
    const n = aDescartar.length - fallos.length;
    setADescartar(null);
    if (n > 0) toast({ title: t('descartar.listo', { count: n }) });
    if (fallos.length > 0) toast({ variant: 'destructive', title: t('descartar.fallos', { count: fallos.length }), description: fallos.join(' · ') });
    onCambio();
  };

  const accionesDe = useCallback(
    (a: AjusteAccionable): AccionFila[] => {
      const borrador = a.estado === 'draft';
      const motivoSinPermiso = t('sinPermiso');
      return [
        { id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => router.push(rutaAjuste(a.id)), oculta: enDetalle },
        {
          id: 'editar',
          etiqueta: t('editar'),
          icono: Pencil,
          onSelect: () => router.push(rutaEditarAjuste(a.id)),
          oculta: !borrador || enDetalle,
          deshabilitada: !puedeAjustar,
          motivo: puedeAjustar ? undefined : motivoSinPermiso,
        },
        {
          id: 'aplicar',
          etiqueta: t('aplicar.accion'),
          icono: CheckCircle2,
          onSelect: () => pedirAplicar([a]),
          oculta: !borrador || enDetalle,
          deshabilitada: !puedeAjustar,
          motivo: puedeAjustar ? undefined : motivoSinPermiso,
        },
        {
          id: 'duplicar',
          etiqueta: t('duplicar'),
          icono: Copy,
          onSelect: () => router.push(rutaNuevoAjuste({ desde: a.id, sucursal: a.sucursal.id })),
          oculta: !puedeAjustar || (enDetalle && !borrador),
        },
        {
          id: 'kardex',
          etiqueta: t('verKardex'),
          icono: ClipboardCheck,
          onSelect: () => {
            const el = document.getElementById('movimientos-ajuste');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
          oculta: !enDetalle,
          deshabilitada: borrador,
          motivo: borrador ? t('kardexAlAplicar') : undefined,
        },
        {
          id: 'descartar',
          etiqueta: t('descartar.accion'),
          icono: Trash2,
          onSelect: () => pedirDescartar([a]),
          destructiva: true,
          oculta: !borrador || !puedeAjustar,
        },
      ].filter((x) => !x.oculta);
    },
    [t, router, puedeAjustar, pedirAplicar, pedirDescartar, enDetalle],
  );

  const uno = aAplicar?.length === 1 ? aAplicar[0] : null;
  const dialogos = (
    <>
      <Dialogo
        abierto={aAplicar !== null}
        onAbiertoChange={(v) => {
          if (!v && !trabajando) setAAplicar(null);
        }}
        icono={CheckCircle2}
        titulo={uno ? t('aplicar.titulo', { codigo: uno.codigo }) : t('aplicar.tituloVarios', { count: aAplicar?.length ?? 0 })}
        descripcion={t('aplicar.descripcion')}
        primario={{ etiqueta: t('aplicar.confirmar'), onClick: () => void aplicar(), cargando: trabajando }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          <li>{t('aplicar.punto1')}</li>
          <li>{t('aplicar.punto2')}</li>
          <li>{t('aplicar.punto3')}</li>
        </ul>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </Dialogo>
      <DialogoMotivo
        abierto={aDescartar !== null}
        onAbiertoChange={(v) => {
          if (!v && !trabajando) setADescartar(null);
        }}
        icono={Trash2}
        titulo={
          aDescartar?.length === 1
            ? t('descartar.titulo', { codigo: aDescartar[0].codigo })
            : t('descartar.tituloVarios', { count: aDescartar?.length ?? 0 })
        }
        descripcion={t('descartar.descripcion')}
        textoConfirmar={t('descartar.confirmar')}
        onConfirmar={descartar}
        consecuencias={[t('descartar.consecuencia1'), t('descartar.consecuencia2')]}
        motivosRapidos={[t('descartar.rapido1'), t('descartar.rapido2'), t('descartar.rapido3')]}
        cargando={trabajando}
        error={error}
      />
    </>
  );

  return { accionesDe, pedirAplicar, pedirDescartar, dialogos, puedeAjustar };
}
