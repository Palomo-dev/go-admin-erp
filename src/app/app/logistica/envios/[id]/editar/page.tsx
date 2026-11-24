/**
 * Logística › Envíos › Editar (Figma «21 Logística» 2965:9202): el formulario de nuevo envío con
 * las secciones bloqueadas según el estado.
 */
import { FormularioEnvio } from '@/components/logistica/envios/FormularioEnvio';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormularioEnvio id={id} />;
}
