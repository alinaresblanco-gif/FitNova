begin;

-- =====================================================================
-- Cierre del seguimiento corporal:
--   1. Editar mediciones sin borrarlas (cliente: las suyas).
--   2. El profesional (entrenador/nutricionista asignado) registra,
--      edita y borra las mediciones que él mismo ha creado.
--   3. Fotos de progreso en un bucket privado de Storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mediciones
-- ---------------------------------------------------------------------
alter table public.clientes_metricas
  add column registrado_por uuid references public.profesionales(id) on delete set null;

alter table public.clientes_metricas
  add constraint clientes_metricas_autor_profesional
  check (origen = 'profesional' or registrado_por is null);

-- Nuevas filas y ediciones deben conservar al menos una medida.
alter table public.clientes_metricas
  add constraint clientes_metricas_alguna_medida
  check (num_nonnulls(
    peso_kg, grasa_corporal_pct, pecho_cm, cuello_cm, hombros_cm,
    biceps_izq_cm, biceps_der_cm, antebrazo_izq_cm, antebrazo_der_cm,
    cintura_cm, cadera_cm, muslo_izq_cm, muslo_der_cm, gemelo_izq_cm, gemelo_der_cm
  ) > 0) not valid;

-- cliente_id, origen y registrado_por no son editables.
grant update (
  fecha, peso_kg, grasa_corporal_pct, pecho_cm, cuello_cm, hombros_cm,
  biceps_izq_cm, biceps_der_cm, antebrazo_izq_cm, antebrazo_der_cm,
  cintura_cm, cadera_cm, muslo_izq_cm, muslo_der_cm, gemelo_izq_cm, gemelo_der_cm
) on public.clientes_metricas to authenticated;

create policy clientes_metricas_update_own
  on public.clientes_metricas for update to authenticated
  using (cliente_id = public.cliente_actual_id() and origen = 'cliente')
  with check (cliente_id = public.cliente_actual_id() and origen = 'cliente');

-- Verdadero solo si quien llama es un profesional asignado como entrenador
-- o nutricionista (a diferencia de can_access_client_health, excluye al cliente).
create or replace function public.es_profesional_salud_de(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profesional_cliente pc
    join public.profesionales p on p.id = pc.profesional_id
    where pc.cliente_id = p_cliente_id
      and p.auth_user_id = (select auth.uid())
      and pc.rol in ('entrenador', 'nutricionista')
  );
$$;

revoke all on function public.es_profesional_salud_de(uuid) from public;
grant execute on function public.es_profesional_salud_de(uuid) to authenticated;

create policy clientes_metricas_insert_profesional
  on public.clientes_metricas for insert to authenticated
  with check (
    origen = 'profesional'
    and registrado_por = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
  );

create policy clientes_metricas_update_profesional
  on public.clientes_metricas for update to authenticated
  using (
    origen = 'profesional'
    and registrado_por = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
  )
  with check (
    origen = 'profesional'
    and registrado_por = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
  );

create policy clientes_metricas_delete_profesional
  on public.clientes_metricas for delete to authenticated
  using (
    origen = 'profesional'
    and registrado_por = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
  );

-- ---------------------------------------------------------------------
-- Fotos de progreso
-- Ruta en Storage: <cliente_id>/<uuid>.jpg dentro del bucket progreso-fotos.
-- ---------------------------------------------------------------------
create or replace function public.cliente_de_ruta_foto(p_ruta text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_ruta, '/', 1)::uuid
  end;
$$;

grant execute on function public.cliente_de_ruta_foto(text) to authenticated;

create table public.clientes_fotos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ruta text not null unique,
  fecha date not null default current_date,
  creado_en timestamptz not null default now(),
  check (public.cliente_de_ruta_foto(ruta) = cliente_id)
);

create index clientes_fotos_cliente_fecha_idx
  on public.clientes_fotos (cliente_id, fecha desc, creado_en desc);

alter table public.clientes_fotos enable row level security;
grant select, insert, delete on public.clientes_fotos to authenticated;
grant all on public.clientes_fotos to service_role;

create policy clientes_fotos_select_related
  on public.clientes_fotos for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_fotos_insert_own
  on public.clientes_fotos for insert to authenticated
  with check (cliente_id = public.cliente_actual_id());

create policy clientes_fotos_delete_own
  on public.clientes_fotos for delete to authenticated
  using (cliente_id = public.cliente_actual_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progreso-fotos', 'progreso-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy progreso_fotos_select_related
  on storage.objects for select to authenticated
  using (
    bucket_id = 'progreso-fotos'
    and public.can_access_client_health(public.cliente_de_ruta_foto(name))
  );

create policy progreso_fotos_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'progreso-fotos'
    and public.cliente_de_ruta_foto(name) = public.cliente_actual_id()
  );

create policy progreso_fotos_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'progreso-fotos'
    and public.cliente_de_ruta_foto(name) = public.cliente_actual_id()
  );

commit;
