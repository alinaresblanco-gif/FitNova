begin;

-- =====================================================================
-- Entrenamientos (etapa 1 del bloque Workouts, programas y vídeos).
--   - ejercicios: catálogo propio de cada profesional (nombre, categoría,
--     instrucciones y enlace opcional de YouTube/Vimeo).
--   - workouts: plantillas del profesional. La lista de ejercicios se
--     guarda en jsonb con una copia de los datos del ejercicio y lo
--     prescrito (series, repeticiones, carga, duración, descanso, notas).
--   - clientes_workouts: copia de un workout asignada a un cliente para un
--     día. Se puede ajustar solo para ese cliente; cambiar la plantilla no
--     altera lo ya asignado.
--   - clientes_workout_registros: lo que el cliente hizo (uno por workout
--     asignado): series reales, duración, esfuerzo 1-10 y comentario.
--   - clientes_workout_comentarios: comentarios del entrenador o
--     nutricionista asignado sobre un workout del cliente.
-- Supabase concede ALL por defecto a anon/authenticated en tablas nuevas:
-- se revoca y se concede solo lo necesario.
-- =====================================================================

create or replace function public.video_url_valida(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null or (
    length(p_url) <= 500
    and p_url ~ '^https://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/|live/)|youtu\.be/|(player\.)?vimeo\.com/)[A-Za-z0-9_./?=&%-]+$'
  );
$$;

-- Comprueba un valor jsonb opcional: null/ausente o número entre min y max.
create or replace function public.entreno_num_ok(p jsonb, p_min numeric, p_max numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or jsonb_typeof(p) = 'null'
    or (jsonb_typeof(p) = 'number' and (p #>> '{}')::numeric between p_min and p_max);
$$;

-- Comprueba un valor jsonb opcional: null/ausente o texto de hasta p_max caracteres.
create or replace function public.entreno_txt_ok(p jsonb, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or jsonb_typeof(p) = 'null'
    or (jsonb_typeof(p) = 'string' and length(p #>> '{}') <= p_max);
$$;

-- Lista de ejercicios prescritos (plantilla o workout asignado).
create or replace function public.entreno_ejercicios_validos(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 40 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(e) k
      where k not in ('ejercicio_id', 'nombre', 'instrucciones', 'video_url', 'series',
                      'repeticiones', 'carga_kg', 'duracion_seg', 'descanso_seg', 'notas')
    ) then return false; end if;
    if jsonb_typeof(e -> 'nombre') is distinct from 'string'
       or length(btrim(e ->> 'nombre')) = 0 or length(e ->> 'nombre') > 120 then return false; end if;
    if not (public.entreno_txt_ok(e -> 'ejercicio_id', 36)
            and public.entreno_txt_ok(e -> 'instrucciones', 2000)
            and public.entreno_txt_ok(e -> 'video_url', 500)
            and public.video_url_valida(e ->> 'video_url')
            and public.entreno_num_ok(e -> 'series', 1, 20)
            and public.entreno_txt_ok(e -> 'repeticiones', 20)
            and public.entreno_num_ok(e -> 'carga_kg', 0, 1000)
            and public.entreno_num_ok(e -> 'duracion_seg', 1, 36000)
            and public.entreno_num_ok(e -> 'descanso_seg', 0, 3600)
            and public.entreno_txt_ok(e -> 'notas', 500)) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Resultados registrados por el cliente: un elemento por ejercicio.
create or replace function public.entreno_resultados_validos(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  s jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 40 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(e) k where k not in ('indice', 'nombre', 'hecho', 'series')
    ) then return false; end if;
    if not (public.entreno_num_ok(e -> 'indice', 0, 39)
            and jsonb_typeof(e -> 'nombre') = 'string' and length(e ->> 'nombre') between 1 and 120
            and jsonb_typeof(e -> 'hecho') = 'boolean'
            and jsonb_typeof(e -> 'series') = 'array' and jsonb_array_length(e -> 'series') <= 20) then
      return false;
    end if;
    for s in select value from jsonb_array_elements(e -> 'series') loop
      if jsonb_typeof(s) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(s) k where k not in ('reps', 'kg', 'seg')) then
        return false;
      end if;
      if not (public.entreno_num_ok(s -> 'reps', 0, 1000)
              and public.entreno_num_ok(s -> 'kg', 0, 1000)
              and public.entreno_num_ok(s -> 'seg', 0, 36000)) then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
create table public.ejercicios (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  categoria varchar(20)
    check (categoria in ('fuerza', 'cardio', 'core', 'movilidad', 'estiramiento', 'otro')),
  instrucciones varchar(2000),
  video_url varchar(500) check (public.video_url_valida(video_url)),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index ejercicios_profesional_nombre_uidx
  on public.ejercicios (profesional_id, lower(btrim(nombre)));

create trigger ejercicios_actualizado_en before update on public.ejercicios
  for each row execute function public.set_actualizado_en();

alter table public.ejercicios enable row level security;
revoke all on public.ejercicios from anon, authenticated;
grant select, insert, delete on public.ejercicios to authenticated;
grant update (nombre, categoria, instrucciones, video_url) on public.ejercicios to authenticated;
grant all on public.ejercicios to service_role;

create policy ejercicios_propios
  on public.ejercicios for all to authenticated
  using (profesional_id = public.profesional_actual_id())
  with check (profesional_id = public.profesional_actual_id());

-- ---------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  descripcion varchar(2000),
  ejercicios jsonb not null check (public.entreno_ejercicios_validos(ejercicios)),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index workouts_profesional_idx on public.workouts (profesional_id, actualizado_en desc);

create trigger workouts_actualizado_en before update on public.workouts
  for each row execute function public.set_actualizado_en();

alter table public.workouts enable row level security;
revoke all on public.workouts from anon, authenticated;
grant select, insert, delete on public.workouts to authenticated;
grant update (nombre, descripcion, ejercicios) on public.workouts to authenticated;
grant all on public.workouts to service_role;

create policy workouts_propios
  on public.workouts for all to authenticated
  using (profesional_id = public.profesional_actual_id())
  with check (profesional_id = public.profesional_actual_id());

-- ---------------------------------------------------------------------
create table public.clientes_workouts (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  workout_origen_id uuid references public.workouts(id) on delete set null,
  fecha date not null check (fecha >= date '2000-01-01'),
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  descripcion varchar(2000),
  ejercicios jsonb not null check (public.entreno_ejercicios_validos(ejercicios)),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index clientes_workouts_cliente_fecha_idx on public.clientes_workouts (cliente_id, fecha desc);

create trigger clientes_workouts_actualizado_en before update on public.clientes_workouts
  for each row execute function public.set_actualizado_en();

-- ---------------------------------------------------------------------
create table public.clientes_workout_registros (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null unique references public.clientes_workouts(id),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null check (fecha >= date '2000-01-01'),
  duracion_min smallint check (duracion_min between 1 and 600),
  esfuerzo smallint check (esfuerzo between 1 and 10),
  comentario varchar(1000),
  resultados jsonb not null default '[]'::jsonb check (public.entreno_resultados_validos(resultados)),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index clientes_workout_registros_cliente_idx on public.clientes_workout_registros (cliente_id, fecha desc);

create trigger clientes_workout_registros_actualizado_en before update on public.clientes_workout_registros
  for each row execute function public.set_actualizado_en();

-- ---------------------------------------------------------------------
create table public.clientes_workout_comentarios (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.clientes_workouts(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  autor_nombre varchar(260),
  autor_rol text,
  texto varchar(1000) not null check (length(btrim(texto)) > 0),
  creado_en timestamptz not null default now()
);

create index clientes_workout_comentarios_workout_idx on public.clientes_workout_comentarios (workout_id, creado_en);
create index clientes_workout_comentarios_cliente_idx on public.clientes_workout_comentarios (cliente_id);

create or replace function public.workout_comentario_autor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select btrim(p.nombre || ' ' || coalesce(p.apellidos, ''))
    into new.autor_nombre
    from public.profesionales p
    where p.id = new.profesional_id;
  select pc.rol
    into new.autor_rol
    from public.profesional_cliente pc
    where pc.cliente_id = new.cliente_id
      and pc.profesional_id = new.profesional_id
      and pc.rol in ('entrenador', 'nutricionista')
    order by (pc.rol = 'entrenador') desc
    limit 1;
  new.creado_en := now();
  return new;
end;
$$;

revoke all on function public.workout_comentario_autor() from public;

create trigger clientes_workout_comentarios_autor before insert on public.clientes_workout_comentarios
  for each row execute function public.workout_comentario_autor();

-- Verdadero si el workout asignado pertenece al cliente indicado.
-- security definer para no depender de la RLS de quien llama.
create or replace function public.workout_es_de_cliente(p_workout_id uuid, p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clientes_workouts w
    where w.id = p_workout_id and w.cliente_id = p_cliente_id
  );
$$;

-- Verdadero si el cliente ya ha registrado el workout como realizado.
create or replace function public.workout_tiene_registro(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.clientes_workout_registros r where r.workout_id = p_workout_id);
$$;

-- Verdadero si la plantilla de origen es del profesional actual.
create or replace function public.workout_plantilla_propia(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_workout_id is null or exists (
    select 1 from public.workouts w
    where w.id = p_workout_id and w.profesional_id = public.profesional_actual_id()
  );
$$;

revoke all on function public.workout_es_de_cliente(uuid, uuid) from public;
revoke all on function public.workout_tiene_registro(uuid) from public;
revoke all on function public.workout_plantilla_propia(uuid) from public;
grant execute on function public.workout_es_de_cliente(uuid, uuid) to authenticated;
grant execute on function public.workout_tiene_registro(uuid) to authenticated;
grant execute on function public.workout_plantilla_propia(uuid) to authenticated;

-- Permisos de clientes_workouts
alter table public.clientes_workouts enable row level security;
revoke all on public.clientes_workouts from anon, authenticated;
grant select, insert, delete on public.clientes_workouts to authenticated;
grant update (fecha, nombre, descripcion, ejercicios) on public.clientes_workouts to authenticated;
grant all on public.clientes_workouts to service_role;

create policy clientes_workouts_select_related
  on public.clientes_workouts for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_workouts_insert_profesional
  on public.clientes_workouts for insert to authenticated
  with check (
    profesional_id = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
    and public.workout_plantilla_propia(workout_origen_id)
  );

create policy clientes_workouts_update_profesional
  on public.clientes_workouts for update to authenticated
  using (
    profesional_id = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
    and not public.workout_tiene_registro(id)
  )
  with check (
    profesional_id = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
  );

create policy clientes_workouts_delete_profesional
  on public.clientes_workouts for delete to authenticated
  using (
    profesional_id = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
    and not public.workout_tiene_registro(id)
  );

-- Permisos de clientes_workout_registros
alter table public.clientes_workout_registros enable row level security;
revoke all on public.clientes_workout_registros from anon, authenticated;
grant select, insert, delete on public.clientes_workout_registros to authenticated;
grant update (fecha, duracion_min, esfuerzo, comentario, resultados) on public.clientes_workout_registros to authenticated;
grant all on public.clientes_workout_registros to service_role;

create policy clientes_workout_registros_select_related
  on public.clientes_workout_registros for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_workout_registros_insert_own
  on public.clientes_workout_registros for insert to authenticated
  with check (
    cliente_id = public.cliente_actual_id()
    and public.workout_es_de_cliente(workout_id, cliente_id)
    and fecha <= current_date + 1
  );

create policy clientes_workout_registros_update_own
  on public.clientes_workout_registros for update to authenticated
  using (cliente_id = public.cliente_actual_id())
  with check (cliente_id = public.cliente_actual_id() and fecha <= current_date + 1);

create policy clientes_workout_registros_delete_own
  on public.clientes_workout_registros for delete to authenticated
  using (cliente_id = public.cliente_actual_id());

-- Permisos de clientes_workout_comentarios
alter table public.clientes_workout_comentarios enable row level security;
revoke all on public.clientes_workout_comentarios from anon, authenticated;
grant select, delete on public.clientes_workout_comentarios to authenticated;
grant insert (workout_id, cliente_id, profesional_id, texto) on public.clientes_workout_comentarios to authenticated;
grant all on public.clientes_workout_comentarios to service_role;

create policy clientes_workout_comentarios_select_related
  on public.clientes_workout_comentarios for select to authenticated
  using (public.can_access_client_health(cliente_id));

create policy clientes_workout_comentarios_insert_profesional
  on public.clientes_workout_comentarios for insert to authenticated
  with check (
    profesional_id = public.profesional_actual_id()
    and public.es_profesional_salud_de(cliente_id)
    and public.workout_es_de_cliente(workout_id, cliente_id)
  );

create policy clientes_workout_comentarios_delete_own
  on public.clientes_workout_comentarios for delete to authenticated
  using (profesional_id = public.profesional_actual_id());

commit;
