-- El comentario de `ai_settings.vertical` nombraba a un cliente real. Los
-- comentarios de esquema viajan al repositorio publico en cada migracion y en
-- los tipos generados, asi que no deben llevar nombres de organizaciones.
-- Mismo contenido, sin la identidad: la evidencia sigue siendo util.
comment on column public.ai_settings.vertical is
  'Vertical para el prompt del bot: retail | hotel | restaurante | gimnasio | parqueadero | servicios. NULL = se deduce de organization_types. Existe porque el tipo registrado no siempre corresponde: hay organizaciones que figuran como restaurant y su catalogo son jeans.';
