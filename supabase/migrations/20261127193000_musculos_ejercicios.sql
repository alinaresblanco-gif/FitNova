begin;

alter table public.ejercicios
  add column musculos_principales text[] not null default '{}',
  add constraint ejercicios_musculos_principales_check check (public.entreno_etiquetas_validas(musculos_principales,
    array['abdominales','abductores','aductores','antebrazo','biceps','cuello','cuadriceps','dorsal','espalda','gemelo','trapecio','gluteo','hombro','isquiotibiales','lumbar','oblicuos','pecho','pectoral','tibial','triceps']));

grant update (musculos_principales) on public.ejercicios to authenticated;

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
                      'especialidades', 'articulaciones', 'musculos_principales')
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
              array['brazo','cadera','codo','escapulas','mano','muneca','pie','pierna','raquis','rodilla','rotula','tobillo'])
            and public.entreno_etiquetas_json_validas(e -> 'musculos_principales',
              array['abdominales','abductores','aductores','antebrazo','biceps','cuello','cuadriceps','dorsal','espalda','gemelo','trapecio','gluteo','hombro','isquiotibiales','lumbar','oblicuos','pecho','pectoral','tibial','triceps'])) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

commit;
