'use client';

import { ListadoPlanes } from '@/components/membresias/planes/ListadoPlanes';

/** Planes de membresía (Figma B1 981:611296 · móvil B3 981:612770). Datos: GET /api/membresias/planes. */
export default function PlanesPage() {
  return (
    <div className="min-h-full bg-canvas">
      <ListadoPlanes />
    </div>
  );
}
