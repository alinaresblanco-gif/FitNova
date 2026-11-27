begin;

alter table public.video_destinatarios add column publicado_en timestamptz;

create function public.video_destinatario_fecha_publicacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.biblioteca_videos where id = new.video_id and publicado) then
    new.publicado_en := now();
  end if;
  return new;
end;
$$;

create trigger video_destinatario_publicado
before insert on public.video_destinatarios
for each row execute function public.video_destinatario_fecha_publicacion();

create function public.video_cambiar_fecha_publicacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.publicado is distinct from old.publicado then
    update public.video_destinatarios
      set publicado_en = case when new.publicado then now() else null end
      where video_id = new.id;
  end if;
  return new;
end;
$$;

create trigger video_publicacion_fecha
after update of publicado on public.biblioteca_videos
for each row execute function public.video_cambiar_fecha_publicacion();

commit;
