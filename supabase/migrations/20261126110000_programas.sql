begin;

create table public.programas (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  descripcion varchar(2000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.programa_workouts (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas(id) on delete cascade,
  workout_id uuid not null references public.workouts(id),
  semana smallint not null check (semana between 1 and 52),
  dia smallint not null check (dia between 1 and 7),
  unique (programa_id, semana, dia, workout_id)
);

create index programa_workouts_programa_idx on public.programa_workouts (programa_id, semana, dia);
create trigger programas_actualizado_en before update on public.programas
  for each row execute function public.set_actualizado_en();

alter table public.programas enable row level security;
alter table public.programa_workouts enable row level security;
revoke all on public.programas, public.programa_workouts from anon, authenticated;
grant select, delete on public.programas to authenticated;
grant select on public.programa_workouts to authenticated;
grant all on public.programas, public.programa_workouts to service_role;

create policy programas_propios on public.programas for select to authenticated
  using (profesional_id = public.profesional_actual_id());
create policy programas_borrar_propios on public.programas for delete to authenticated
  using (profesional_id = public.profesional_actual_id());
create policy programa_workouts_propios on public.programa_workouts for select to authenticated
  using (exists (select 1 from public.programas p
                 where p.id = programa_id and p.profesional_id = public.profesional_actual_id()));

alter table public.clientes_workouts
  add column programa_nombre varchar(120),
  add column programa_semana smallint check (programa_semana between 1 and 52);

create function public.guardar_programa(p_id uuid, p_nombre text, p_descripcion text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_id uuid;
  v_item jsonb;
  v_workout uuid;
  v_semana integer;
  v_dia integer;
begin
  if v_profesional is null then raise exception 'No hay un perfil profesional asociado.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 120 then
    raise exception 'El nombre debe tener entre 1 y 120 caracteres.';
  end if;
  if length(p_descripcion) > 2000 then raise exception 'La descripción es demasiado larga.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'La lista de entrenamientos no es válida.'; end if;
  if jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'El programa debe tener entre 1 y 200 entrenamientos.';
  end if;
  if p_id is null then
    insert into public.programas (profesional_id, nombre, descripcion)
      values (v_profesional, btrim(p_nombre), nullif(btrim(p_descripcion), '')) returning id into v_id;
  else
    update public.programas set nombre = btrim(p_nombre), descripcion = nullif(btrim(p_descripcion), '')
      where id = p_id and profesional_id = v_profesional returning id into v_id;
    if v_id is null then raise exception 'No se encontró el programa propio.'; end if;
    delete from public.programa_workouts where programa_id = v_id;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'workout_id') is distinct from 'string'
       or jsonb_typeof(v_item->'semana') is distinct from 'number'
       or jsonb_typeof(v_item->'dia') is distinct from 'number'
       or (v_item->>'semana') !~ '^[0-9]+$'
       or (v_item->>'dia') !~ '^[0-9]+$' then
      raise exception 'Hay un entrenamiento del programa no válido.';
    end if;
    v_workout := (v_item->>'workout_id')::uuid;
    v_semana := (v_item->>'semana')::integer;
    v_dia := (v_item->>'dia')::integer;
    if v_semana not between 1 and 52 or v_dia not between 1 and 7 then
      raise exception 'La semana debe estar entre 1 y 52 y el día entre 1 y 7.';
    end if;
    if not exists (select 1 from public.workouts where id = v_workout and profesional_id = v_profesional) then
      raise exception 'El workout no existe o no pertenece a tu librería.';
    end if;
    insert into public.programa_workouts (programa_id, workout_id, semana, dia)
      values (v_id, v_workout, v_semana, v_dia);
  end loop;
  return v_id;
end;
$$;

create function public.asignar_programa(p_programa uuid, p_cliente uuid, p_inicio date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_nombre text;
  v_count integer;
begin
  if v_profesional is null or not coalesce(public.es_profesional_salud_de(p_cliente), false) then
    raise exception 'Solo un profesional asignado al cliente puede asignar programas.';
  end if;
  if p_inicio is null or p_inicio < date '2000-01-01' then
    raise exception 'Elige una fecha de inicio válida.';
  end if;
  select nombre into v_nombre from public.programas
    where id = p_programa and profesional_id = v_profesional for share;
  if not found then raise exception 'No se encontró el programa propio.'; end if;
  insert into public.clientes_workouts
    (cliente_id, profesional_id, workout_origen_id, fecha, nombre, descripcion, ejercicios, programa_nombre, programa_semana)
    select p_cliente, v_profesional, w.id, p_inicio + ((pw.semana - 1) * 7 + pw.dia - 1),
           w.nombre, w.descripcion, w.ejercicios, v_nombre, pw.semana
    from public.programa_workouts pw
    join public.workouts w on w.id = pw.workout_id and w.profesional_id = v_profesional
    where pw.programa_id = p_programa
    order by pw.semana, pw.dia, pw.id;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'El programa no contiene entrenamientos.'; end if;
  return v_count;
end;
$$;

revoke all on function public.guardar_programa(uuid, text, text, jsonb) from public, anon;
revoke all on function public.asignar_programa(uuid, uuid, date) from public, anon;
grant execute on function public.guardar_programa(uuid, text, text, jsonb) to authenticated;
grant execute on function public.asignar_programa(uuid, uuid, date) to authenticated;

commit;
