'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, type PageHeaderMovil } from '../PageHeader';
import { StatusBadge } from '../StatusBadge';
import type { Miga } from '../Breadcrumbs';
import { ICONO_DOCUMENTO, type TipoDocumento } from './documentos';

/**
 * Cabecera de un documento (Figma `DocumentHeader`, Variant detalle ·
 * formulario × Layout desktop · mobile): `PageHeader` con el icono del tipo,
 * el estado (`StatusBadge`) y las insignias del documento (DIAN, documento
 * soporte, origen) junto al título. En `debajo` va la cadena del documento
 * o las pestañas; en móvil el `PageHeader` publica título y acción en el
 * `MobileHeader`.
 *
 * Una sola primaria en `acciones` («Registrar pago» en el detalle, «Emitir
 * factura» / «Confirmar factura» en el formulario); el resto en «⋯».
 */
export interface DocumentoCabeceraProps {
  variante?: 'detalle' | 'formulario';
  /** Define el icono (CATALOGO-ICONOS) si no se pasa `icono`. */
  tipo?: TipoDocumento;
  icono?: LucideIcon;
  /** «Factura FV-00042», «Nueva factura de compra». */
  titulo: string;
  /** «Cliente · 12 sep 2026» (fecha ya formateada en la zona de la organización). */
  subtitulo?: ReactNode;
  migas?: readonly Miga[];
  /** Estado del documento (`issued`, `paid`, «Vencida 12 d»). */
  estado?: string | null;
  /** Chips junto al estado: DIAN, documento soporte, origen. */
  insignias?: ReactNode;
  acciones?: ReactNode;
  /** Formulario: a dónde vuelve «←». */
  volverA?: string;
  cargando?: boolean;
  /** Cadena del documento, `TabBar` o `BranchBadgeActiva`. */
  debajo?: ReactNode;
  movil?: PageHeaderMovil | false;
  className?: string;
}

export function DocumentoCabecera({
  variante = 'detalle',
  tipo,
  icono,
  titulo,
  subtitulo,
  migas,
  estado,
  insignias,
  acciones,
  volverA,
  cargando,
  debajo,
  movil,
  className,
}: DocumentoCabeceraProps) {
  const Icono = icono ?? (tipo ? ICONO_DOCUMENTO[tipo] : undefined);
  const badge =
    estado || insignias ? (
      <span className="flex flex-wrap items-center gap-1.5">
        {estado && <StatusBadge estado={estado} />}
        {insignias}
      </span>
    ) : undefined;
  return (
    <PageHeader
      variante={variante === 'formulario' ? 'form' : 'detail'}
      titulo={titulo}
      subtitulo={subtitulo}
      icono={Icono}
      migas={migas}
      badge={badge}
      acciones={acciones}
      volverA={volverA}
      cargando={cargando}
      debajo={debajo}
      movil={movil}
      className={className}
    />
  );
}
