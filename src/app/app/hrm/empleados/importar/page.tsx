import { ImportarEmpleados } from '@/components/hrm/personas/importar/ImportarEmpleados';

/**
 * Recursos humanos › Importar empleados. Cada fila pasa por el alta del
 * servidor; ya no se escribe salario, banco ni seguridad social desde el navegador.
 */
export default function ImportarEmpleadosPage() {
  return <ImportarEmpleados />;
}
