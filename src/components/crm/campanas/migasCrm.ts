'use client';

import { useTranslations } from 'next-intl';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import type { Miga } from '@/components/kit/Breadcrumbs';

/** Etiquetas y enlaces salen del catálogo canónico, también en formularios y detalles. */
export function useMigasAreaCrm(href: string): readonly Miga[] {
  const t = useTranslations('nav');
  const names = useNombresNav();
  const crm = moduloPorCodigo('crm');
  const page = crm?.paginas.find(p => p.href === href);
  if (!crm || !page) return [];
  return [{ etiqueta: t(crm.etiqueta), href: crm.rutas[0] }, { etiqueta: names.pagina(page) }];
}
