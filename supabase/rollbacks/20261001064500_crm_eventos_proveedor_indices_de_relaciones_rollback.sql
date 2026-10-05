-- Reversión funcional: conservar índices de soporte de FK.
-- No cambian datos, permisos ni firmas; retirarlos perjudicaría la conciliación conservada.
set lock_timeout='2s';
