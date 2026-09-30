/** Rutas del centro de reportes. El query conserva los filtros. */
export function rutaGrupo(grupo: string, query = ''): string {
  return `/app/reportes/${encodeURIComponent(grupo)}${query}`;
}

export function rutaReporte(grupo: string, id: string, query = ''): string {
  return `/app/reportes/${encodeURIComponent(grupo)}/${encodeURIComponent(id)}${query}`;
}

export function rutaCentro(query = ''): string {
  return `/app/reportes${query}`;
}
