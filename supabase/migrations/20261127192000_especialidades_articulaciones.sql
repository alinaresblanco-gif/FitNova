begin;

create function public.entreno_etiquetas_validas(p text[], permitidas text[])
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and array_position(p, null) is null
    and p <@ permitidas
    and cardinality(p) = (select count(distinct x) from unnest(p) as t(x));
$$;

alter table public.ejercicios
  add column especialidades text[] not null default '{}',
  add column articulaciones text[] not null default '{}',
  add constraint ejercicios_especialidades_check check (public.entreno_etiquetas_validas(especialidades,
    array['fuerza','cardio','core','movilidad','estiramiento','otro','equilibrio','activacion','propiocepcion','rehabilitacion','hipopresivos','fortalecimiento'])),
  add constraint ejercicios_articulaciones_check check (public.entreno_etiquetas_validas(articulaciones,
    array['brazo','cadera','codo','escapulas','mano','muneca','pie','pierna','raquis','rodilla','rotula','tobillo']));

update public.ejercicios set especialidades = array[categoria] where categoria is not null;
grant update (especialidades, articulaciones) on public.ejercicios to authenticated;

create function public.ejercicio_categoria_compatibilidad()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.especialidades) = 0 and new.categoria is not null then
      new.especialidades := array[new.categoria];
    end if;
  elsif new.categoria is distinct from old.categoria
    and new.especialidades is not distinct from old.especialidades then
    if old.categoria is not null then
      new.especialidades := array_remove(new.especialidades, old.categoria);
    end if;
    if new.categoria is not null and not (new.categoria = any(new.especialidades)) then
      new.especialidades := array_append(new.especialidades, new.categoria);
    end if;
  end if;
  select value into new.categoria from unnest(new.especialidades) with ordinality as e(value, posicion)
    where value = any(array['fuerza','cardio','core','movilidad','estiramiento','otro'])
    order by posicion limit 1;
  return new;
end;
$$;
create trigger ejercicio_categoria_compatibilidad
before insert or update on public.ejercicios
for each row execute function public.ejercicio_categoria_compatibilidad();

create function public.entreno_etiquetas_json_validas(p jsonb, permitidas text[])
returns boolean language plpgsql immutable set search_path = '' as $$
declare etiquetas text[];
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > cardinality(permitidas) then return false; end if;
  if exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string') then return false; end if;
  select coalesce(array_agg(value), '{}'::text[]) into etiquetas from jsonb_array_elements_text(p);
  return public.entreno_etiquetas_validas(etiquetas, permitidas);
end;
$$;

create or replace function public.entreno_ejercicios_validos(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 40 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(e) k
      where k not in ('ejercicio_id', 'nombre', 'instrucciones', 'video_url', 'series',
                      'repeticiones', 'carga_kg', 'duracion_seg', 'descanso_seg', 'notas',
                      'especialidades', 'articulaciones')
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
            and public.entreno_txt_ok(e -> 'notas', 500)
            and public.entreno_etiquetas_json_validas(e -> 'especialidades',
              array['fuerza','cardio','core','movilidad','estiramiento','otro','equilibrio','activacion','propiocepcion','rehabilitacion','hipopresivos','fortalecimiento'])
            and public.entreno_etiquetas_json_validas(e -> 'articulaciones',
              array['brazo','cadera','codo','escapulas','mano','muneca','pie','pierna','raquis','rodilla','rotula','tobillo'])) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

commit;
