-- Rollback: Tabla de idempotencia para eventos de conversión
-- Revierte: 20260929230000_conversion_events_idempotencia.sql

DROP TABLE IF EXISTS public.conversion_events_sent CASCADE;
