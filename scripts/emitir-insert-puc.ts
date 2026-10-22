/**
 * Emite los VALUES de puc_plantilla. Lo usa quien regenera la migración;
 * el archivo aplicado es la fuente que se compara con la base.
 */
import { writeFileSync } from 'node:fs';
import { PLANTILLA_PUC } from '../src/lib/finanzas/pucPlantilla';

const q = (s: string | null): string => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`);

const values = PLANTILLA_PUC.map((c) =>
  `  (${[
    q(c.codigo),
    q(c.nombre),
    q(c.tipo),
    q(c.padre),
    q(c.descripcion),
    q(c.naturaleza),
    c.esMovimiento ? 'true' : 'false',
    c.requiereTercero ? 'true' : 'false',
    c.requiereCentroCosto ? 'true' : 'false',
  ].join(', ')})`,
).join(',\n');

const destino = process.argv[2] ?? '/tmp/puc-insert.sql';
writeFileSync(destino, values);
console.log(`${PLANTILLA_PUC.length} cuentas, ${values.length} bytes → ${destino}`);
