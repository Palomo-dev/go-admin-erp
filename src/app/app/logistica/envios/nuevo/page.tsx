/**
 * Logística › Envíos › Nuevo envío (Figma «21 Logística» 2963:8719). `?duplicar=<id>` abre el
 * mismo formulario ya lleno con los datos de otro envío.
 */
import { FormularioEnvio } from '@/components/logistica/envios/FormularioEnvio';

export default async function Page({ searchParams }: { searchParams: Promise<{ duplicar?: string | string[] }> }) {
  const { duplicar } = await searchParams;
  return <FormularioEnvio duplicarDe={typeof duplicar === 'string' && duplicar ? duplicar : null} />;
}
