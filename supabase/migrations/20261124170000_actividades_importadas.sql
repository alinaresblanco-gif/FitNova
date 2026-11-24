begin;

-- =====================================================================
-- Importación de actividades desde archivos del reloj o app deportiva
-- (GPX, TCX o FIT; también .gz). El archivo se procesa en el navegador
-- de FitNova Go; aquí solo se guardan los datos resumidos.
--   - origen: 'manual' (formulario) o 'archivo' (importada).
--   - inicio: hora exacta de inicio que da el dispositivo; evita importar
--     dos veces la misma actividad (aunque sea en otro formato).
--   - calorias_kcal: calorías leídas del archivo (no estimadas).
-- Las tres columnas solo se fijan al crear: no tienen permiso de update.
-- =====================================================================

alter table public.clientes_actividades
  add column origen varchar(10) not null default 'manual' check (origen in ('manual', 'archivo')),
  add column inicio timestamptz,
  add column calorias_kcal integer check (calorias_kcal between 1 and 20000),
  add constraint clientes_actividades_importada_check
    check (origen = 'archivo' or (inicio is null and calorias_kcal is null));

create unique index clientes_actividades_cliente_inicio_key
  on public.clientes_actividades (cliente_id, inicio)
  where inicio is not null;

commit;
