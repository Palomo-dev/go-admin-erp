-- El alias `p` del subselect chocaba con la variable PL/pgSQL del mismo nombre.
-- Esta corrección deja la función igual que el archivo de la migración anterior
-- ya enmendado en el repositorio.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.fn_rellenar_paginas_legales(jsonb,jsonb)'::regprocedure);
  src := replace(src, 'jsonb_array_elements(paginas) p where p->>''id'' = pagina_id', 'jsonb_array_elements(paginas) pag where pag->>''id'' = pagina_id');
  src := replace(src, 'select p->>''titulo'' from jsonb_array_elements(paginas) pag', 'select pag->>''titulo'' from jsonb_array_elements(paginas) pag');
  execute src;
end $$;
