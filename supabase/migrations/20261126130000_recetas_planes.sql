begin;

create table public.recetas (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  titulo varchar(120) not null check (length(btrim(titulo)) > 0),
  descripcion varchar(2000),
  ingredientes varchar(5000) not null check (length(btrim(ingredientes)) > 0),
  preparacion varchar(5000) not null check (length(btrim(preparacion)) > 0),
  kcal integer check (kcal between 1 and 10000),
  raciones integer check (raciones between 1 and 100),
  foto_ruta text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (foto_ruta is null or foto_ruta ~ ('^' || profesional_id::text || '/[0-9a-f-]{36}\.jpg$'))
);

create table public.planes_nutricionales (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  nombre varchar(120) not null check (length(btrim(nombre)) > 0),
  descripcion varchar(2000),
  dias jsonb not null check (jsonb_typeof(dias) = 'array'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.clientes_planes_nutricionales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  inicio date not null,
  fin date not null,
  nombre varchar(120) not null,
  descripcion text,
  dias jsonb not null check (jsonb_typeof(dias) = 'array'),
  creado_en timestamptz not null default now(),
  check (inicio <= fin)
);

create table public.plan_nutricional_recetas (
  plan_id uuid not null references public.planes_nutricionales(id) on delete cascade,
  receta_id uuid not null references public.recetas(id) on delete restrict,
  primary key (plan_id, receta_id)
);

create index clientes_planes_nutricionales_fechas_idx on public.clientes_planes_nutricionales (cliente_id, inicio, fin);
create trigger recetas_actualizado_en before update on public.recetas for each row execute function public.set_actualizado_en();
create trigger planes_nutricionales_actualizado_en before update on public.planes_nutricionales for each row execute function public.set_actualizado_en();

alter table public.recetas enable row level security;
alter table public.planes_nutricionales enable row level security;
alter table public.clientes_planes_nutricionales enable row level security;
alter table public.plan_nutricional_recetas enable row level security;
revoke all on public.recetas, public.planes_nutricionales, public.clientes_planes_nutricionales, public.plan_nutricional_recetas from anon, authenticated;
grant select, delete on public.recetas, public.planes_nutricionales to authenticated;
grant insert (profesional_id, titulo, descripcion, ingredientes, preparacion, kcal, raciones, foto_ruta),
  update (titulo, descripcion, ingredientes, preparacion, kcal, raciones, foto_ruta) on public.recetas to authenticated;
grant select on public.clientes_planes_nutricionales to authenticated;
grant all on public.recetas, public.planes_nutricionales, public.clientes_planes_nutricionales, public.plan_nutricional_recetas to service_role;

create policy recetas_select on public.recetas for select to authenticated using (profesional_id = public.profesional_actual_id());
create policy recetas_insert on public.recetas for insert to authenticated with check (profesional_id = public.profesional_actual_id());
create policy recetas_update on public.recetas for update to authenticated using (profesional_id = public.profesional_actual_id()) with check (profesional_id = public.profesional_actual_id());
create policy recetas_delete on public.recetas for delete to authenticated using (profesional_id = public.profesional_actual_id());
create policy planes_select on public.planes_nutricionales for select to authenticated using (profesional_id = public.profesional_actual_id());
create policy planes_delete on public.planes_nutricionales for delete to authenticated using (profesional_id = public.profesional_actual_id());
create policy clientes_planes_select on public.clientes_planes_nutricionales for select to authenticated using (public.can_access_client_health(cliente_id));

create function public.guardar_plan_nutricional(p_id uuid, p_nombre text, p_descripcion text, p_dias jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_dia jsonb;
  v_comida jsonb;
  v_num integer;
  v_vistos integer[] := '{}';
  v_id uuid;
begin
  if v_profesional is null then raise exception 'No hay un perfil profesional asociado.'; end if;
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 120 then raise exception 'Escribe un nombre válido para el plan.'; end if;
  if length(p_descripcion) > 2000 then raise exception 'La descripción es demasiado larga.'; end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) <> 7 then raise exception 'El plan debe contener siete días.'; end if;
  for v_dia in select value from jsonb_array_elements(p_dias) loop
    if jsonb_typeof(v_dia) <> 'object' or coalesce(v_dia->>'dia', '') !~ '^[1-7]$'
       or jsonb_typeof(v_dia->'comidas') is distinct from 'array' then
      raise exception 'Hay un día del plan no válido.';
    end if;
    v_num := (v_dia->>'dia')::integer;
    if v_num = any(v_vistos) then raise exception 'El plan tiene días duplicados.'; end if;
    v_vistos := array_append(v_vistos, v_num);
    if (v_dia->>'kcal' is not null and (v_dia->>'kcal' !~ '^[0-9]{1,5}$' or (v_dia->>'kcal')::integer not between 1 and 10000))
       or (v_dia->>'agua_ml' is not null and (v_dia->>'agua_ml' !~ '^[0-9]{1,5}$' or (v_dia->>'agua_ml')::integer not between 1 and 20000)) then
      raise exception 'Los objetivos diarios no son válidos.';
    end if;
    if jsonb_array_length(v_dia->'comidas') > 30 then raise exception 'Demasiadas comidas en un día.'; end if;
    for v_comida in select value from jsonb_array_elements(v_dia->'comidas') loop
      if jsonb_typeof(v_comida) <> 'object' or coalesce(v_comida->>'tipo', '') not in ('desayuno','media_manana','comida','merienda','cena','snack','otro')
         or length(coalesce(v_comida->>'texto', '')) > 2000
         or (length(btrim(coalesce(v_comida->>'texto', ''))) = 0 and nullif(v_comida->>'receta_id', '') is null) then
        raise exception 'Cada comida necesita texto o una receta.';
      end if;
      if nullif(v_comida->>'receta_id', '') is not null and not exists (
        select 1 from public.recetas r where r.id::text = v_comida->>'receta_id' and r.profesional_id = v_profesional
      ) then raise exception 'Una receta no existe o no pertenece a tu recetario.'; end if;
    end loop;
  end loop;
  if p_id is null then
    insert into public.planes_nutricionales (profesional_id,nombre,descripcion,dias)
    values (v_profesional,btrim(p_nombre),nullif(btrim(p_descripcion),''),p_dias) returning id into v_id;
  else
    update public.planes_nutricionales set nombre=btrim(p_nombre), descripcion=nullif(btrim(p_descripcion),''), dias=p_dias
    where id=p_id and profesional_id=v_profesional returning id into v_id;
    if v_id is null then raise exception 'No se encontró el plan propio.'; end if;
  end if;
  delete from public.plan_nutricional_recetas where plan_id=v_id;
  insert into public.plan_nutricional_recetas (plan_id,receta_id)
    select distinct v_id, (c->>'receta_id')::uuid
    from jsonb_array_elements(p_dias) d, jsonb_array_elements(d->'comidas') c
    where nullif(c->>'receta_id', '') is not null;
  return v_id;
end;
$$;

create function public.asignar_plan_nutricional(p_plan uuid, p_cliente uuid, p_inicio date, p_fin date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profesional uuid := public.profesional_actual_id();
  v_plan public.planes_nutricionales%rowtype;
  v_dias jsonb;
  v_id uuid;
begin
  if v_profesional is null or not coalesce(public.es_profesional_salud_de(p_cliente), false)
     or not exists (select 1 from public.clientes where id = p_cliente and estado = 'activo') then
    raise exception 'Solo puedes asignar planes a clientes activos asignados a ti.';
  end if;
  if p_inicio is null or p_fin is null or p_inicio < date '2000-01-01' or p_fin > date '2100-12-31' or p_inicio > p_fin then
    raise exception 'Elige un periodo válido de inicio y fin.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plan-nutricional:' || p_cliente::text, 0));
  if exists (select 1 from public.clientes_planes_nutricionales where cliente_id=p_cliente and inicio <= p_fin and fin >= p_inicio) then
    raise exception 'Ya existe un plan para parte de esas fechas. Cambia el periodo o finaliza el plan anterior.';
  end if;
  select * into v_plan from public.planes_nutricionales where id=p_plan and profesional_id=v_profesional for share;
  if not found then raise exception 'No se encontró el plan propio.'; end if;
  perform 1 from public.recetas r where r.profesional_id=v_profesional and exists (
    select 1 from jsonb_array_elements(v_plan.dias) d, jsonb_array_elements(d->'comidas') c
    where r.id::text=c->>'receta_id'
  ) for share;
  if exists (
    select 1 from jsonb_array_elements(v_plan.dias) d, jsonb_array_elements(d->'comidas') c
    where nullif(c->>'receta_id', '') is not null and not exists (
      select 1 from public.recetas r where r.id::text=c->>'receta_id' and r.profesional_id=v_profesional
    )
  ) then raise exception 'El plan contiene una receta eliminada. Edita el plan antes de asignarlo.'; end if;
  select jsonb_agg(
    jsonb_build_object('dia', d->'dia', 'kcal', d->'kcal', 'agua_ml', d->'agua_ml', 'comidas',
      (select coalesce(jsonb_agg(
        jsonb_build_object('tipo', c->'tipo', 'texto', c->'texto', 'receta',
          (select jsonb_build_object('titulo',r.titulo,'descripcion',r.descripcion,'ingredientes',r.ingredientes,
            'preparacion',r.preparacion,'kcal',r.kcal,'raciones',r.raciones,'foto_ruta',r.foto_ruta)
           from public.recetas r where r.id::text=c->>'receta_id' and r.profesional_id=v_profesional))
        order by c_ord), '[]'::jsonb)
       from jsonb_array_elements(d->'comidas') with ordinality as comida(c,c_ord)))
    order by d_ord) into v_dias
  from jsonb_array_elements(v_plan.dias) with ordinality as dia(d,d_ord);
  insert into public.clientes_planes_nutricionales (cliente_id,profesional_id,inicio,fin,nombre,descripcion,dias)
  values (p_cliente,v_profesional,p_inicio,p_fin,v_plan.nombre,v_plan.descripcion,v_dias) returning id into v_id;
  return v_id;
end;
$$;

create function public.finalizar_plan_nutricional(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.clientes_planes_nutricionales%rowtype;
begin
  select * into v_plan from public.clientes_planes_nutricionales where id=p_id;
  if not found or v_plan.profesional_id is distinct from public.profesional_actual_id()
     or not coalesce(public.es_profesional_salud_de(v_plan.cliente_id), false) then
    raise exception 'No puedes modificar este plan.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plan-nutricional:' || v_plan.cliente_id::text, 0));
  select * into v_plan from public.clientes_planes_nutricionales where id=p_id;
  if not found then raise exception 'El plan ya no está disponible.'; end if;
  if v_plan.fin < current_date then raise exception 'El plan ya ha terminado.'; end if;
  if v_plan.inicio >= current_date then
    delete from public.clientes_planes_nutricionales where id=p_id;
  else
    update public.clientes_planes_nutricionales set fin=current_date - 1 where id=p_id;
  end if;
end;
$$;

revoke all on function public.guardar_plan_nutricional(uuid,text,text,jsonb), public.asignar_plan_nutricional(uuid,uuid,date,date), public.finalizar_plan_nutricional(uuid) from public, anon;
grant execute on function public.guardar_plan_nutricional(uuid,text,text,jsonb), public.asignar_plan_nutricional(uuid,uuid,date,date), public.finalizar_plan_nutricional(uuid) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('recetas-fotos','recetas-fotos',false,5242880,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.puede_ver_foto_receta(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(split_part(p_ruta,'/',1)=public.profesional_actual_id()::text, false)
    or exists (
      select 1 from public.clientes_planes_nutricionales p,
        jsonb_array_elements(p.dias) d, jsonb_array_elements(d->'comidas') c
      where public.can_access_client_health(p.cliente_id) and c->'receta'->>'foto_ruta'=p_ruta
    );
$$;
revoke all on function public.puede_ver_foto_receta(text) from public, anon;
grant execute on function public.puede_ver_foto_receta(text) to authenticated;
create policy recetas_fotos_select on storage.objects for select to authenticated
  using (bucket_id='recetas-fotos' and public.puede_ver_foto_receta(name));
create policy recetas_fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id='recetas-fotos' and split_part(name,'/',1)=public.profesional_actual_id()::text);
create function public.puede_borrar_foto_receta(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_ruta,'/',1)=public.profesional_actual_id()::text
    and not exists (select 1 from public.recetas r where r.foto_ruta=p_ruta)
    and not exists (
      select 1 from public.clientes_planes_nutricionales p, jsonb_array_elements(p.dias) d,
        jsonb_array_elements(d->'comidas') c where c->'receta'->>'foto_ruta'=p_ruta
    );
$$;
revoke all on function public.puede_borrar_foto_receta(text) from public, anon;
grant execute on function public.puede_borrar_foto_receta(text) to authenticated;
create policy recetas_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id='recetas-fotos' and public.puede_borrar_foto_receta(name));
commit;
