begin;

alter function public.completar_onboarding(
  text, varchar, varchar, varchar, date, text, text, numeric, numeric, numeric, text, text, jsonb, varchar, varchar
) rename to completar_onboarding_interno;

revoke all on function public.completar_onboarding_interno(
  text, varchar, varchar, varchar, date, text, text, numeric, numeric, numeric, text, text, jsonb, varchar, varchar
) from public, anon, authenticated;

create function public.completar_onboarding(
  p_token text,
  p_apellidos varchar(150),
  p_nombre_avatar varchar(40),
  p_telefono varchar(30),
  p_fecha_nacimiento date,
  p_genero text,
  p_objetivo_tipo text,
  p_altura_cm numeric,
  p_peso_inicial_kg numeric,
  p_peso_objetivo_kg numeric,
  p_notas_objetivo text,
  p_notas_lesiones text,
  p_parq jsonb,
  p_version_terminos varchar(40),
  p_version_privacidad varchar(40),
  p_acepta_terminos boolean,
  p_leido_privacidad boolean,
  p_acepta_salud boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
begin
  if p_acepta_terminos is not true or p_leido_privacidad is not true or p_acepta_salud is not true then
    raise exception 'Se requieren las tres confirmaciones para la prueba';
  end if;
  if p_version_terminos is distinct from 'borrador-20261124'
    or p_version_privacidad is distinct from 'borrador-20261124' then
    raise exception 'Versión de documentos de prueba no válida';
  end if;

  v_cliente_id := public.completar_onboarding_interno(
    p_token, p_apellidos, p_nombre_avatar, p_telefono, p_fecha_nacimiento,
    p_genero, p_objetivo_tipo, p_altura_cm, p_peso_inicial_kg, p_peso_objetivo_kg,
    p_notas_objetivo, p_notas_lesiones, p_parq, p_version_terminos, p_version_privacidad
  );
  insert into public.consentimientos (cliente_id, tipo, version_documento)
  values (v_cliente_id, 'salud', p_version_privacidad)
  on conflict (cliente_id, tipo, version_documento) do nothing;
  return v_cliente_id;
end;
$$;

revoke all on function public.completar_onboarding(
  text, varchar, varchar, varchar, date, text, text, numeric, numeric, numeric, text, text, jsonb, varchar, varchar, boolean, boolean, boolean
) from public, anon;
grant execute on function public.completar_onboarding(
  text, varchar, varchar, varchar, date, text, text, numeric, numeric, numeric, text, text, jsonb, varchar, varchar, boolean, boolean, boolean
) to authenticated;

commit;
