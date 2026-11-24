begin;

-- =====================================================================
-- Actividades personales del cliente (registro manual desde FitNova Go).
--   - El cliente crea, edita y borra las suyas.
--   - Sus profesionales asignados (entrenador/nutricionista) solo las leen.
--   - La foto de la ruta va al bucket privado progreso-fotos con la ruta
--     <cliente_id>/actividades/<uuid>.jpg, cubierta por sus políticas.
-- Pasos y calorías no se guardan: son estimaciones que se calculan al
-- mostrar la distancia.
-- =====================================================================

create table public.clientes_actividades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  fecha date not null,
  duracion_min integer check (duracion_min between 1 and 1440),
  distancia_km numeric(6, 2) check (distancia_km > 0 and distancia_km <= 1000),
  comentario varchar(1000),
  foto_ruta text unique check (
    foto_ruta is null
    or (public.cliente_de_ruta_foto(foto_ruta) = cliente_id and split_part(foto_ruta, '/', 2) = 'actividades')
  ),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index clientes_actividades_cliente_fecha_idx
  on public.clientes_actividades (cliente_id, fecha desc, creado_en desc);

create trigger clientes_actividades_actualizado_en before update on public.clientes_actividades
  for each row execute function public.set_actualizado_en();

alter table public.clientes_actividades enable row level security;
grant select, insert, delete on public.clientes_actividades to authenticated;
grant update (nombre, fecha, duracion_min, distancia_km, comentario, foto_ruta)
  on public.clientes_actividades to authenticated;
grant all on public.clientes_actividades to service_role;

create policy clientes_actividades_select_related
  on public.clientes_actividades for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_actividades_insert_own
  on public.clientes_actividades for insert to authenticated
  with check (cliente_id = public.cliente_actual_id());

create policy clientes_actividades_update_own
  on public.clientes_actividades for update to authenticated
  using (cliente_id = public.cliente_actual_id())
  with check (cliente_id = public.cliente_actual_id());

create policy clientes_actividades_delete_own
  on public.clientes_actividades for delete to authenticated
  using (cliente_id = public.cliente_actual_id());

commit;
