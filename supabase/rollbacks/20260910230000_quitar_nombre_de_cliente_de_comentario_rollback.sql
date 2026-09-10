-- Reversion deliberadamente PARCIAL.
--
-- Restaurar el comentario exacto significaria volver a escribir el nombre de un
-- cliente en el esquema de una base de produccion, que es justo lo que la
-- migracion vino a quitar. Se deja el texto neutro y se documenta cual era el
-- anterior en terminos genericos: mencionaba por su nombre a la organizacion
-- 120 como ejemplo de tipo registrado que no corresponde al catalogo.
--
-- Un comentario de columna no afecta a ninguna consulta: revertirlo no arregla
-- nada que la migracion pudiera haber roto.
comment on column public.ai_settings.vertical is
  'Vertical para el prompt del bot: retail | hotel | restaurante | gimnasio | parqueadero | servicios. NULL = se deduce de organization_types. Existe porque el tipo registrado no siempre corresponde.';
