import { FormularioCargo } from '@/components/hrm/estructura/cargos/FormularioCargo';

/** Recursos humanos › Cargos › Nuevo cargo (con `?desde=` parte de otro cargo: «Duplicar cargo»). */
export default async function Page({ searchParams }: { searchParams: Promise<{ desde?: string | string[] }> }) {
  const { desde } = await searchParams;
  return <FormularioCargo id={null} desde={typeof desde === 'string' ? desde : null} />;
}
