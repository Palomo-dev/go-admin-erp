import { redirect } from 'next/navigation';

/**
 * Los reportes solo viven en el módulo Reportes (decisión del dueño): los de
 * Recursos humanos (nómina, asistencia, ausencias, préstamos, productividad y
 * comisiones) están en `/app/reportes/personas`.
 */
export default function ReportesHrmPage() {
  redirect('/app/reportes/personas');
}
