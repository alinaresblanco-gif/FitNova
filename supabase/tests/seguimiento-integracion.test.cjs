const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

test('Equipo, archivos y formularios con todas las migraciones y RLS reales', async () => {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const como = (n) => db.exec(`reset role; set role authenticated; select set_config('test.uid','${uid(n)}',false)`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions; create schema storage;
      create table auth.users (id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid',true),'')::uuid
      $$;
      create table storage.buckets (id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
      create table storage.objects (bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon;
    `);
    const migrations = path.join(__dirname, '..', 'migrations');
    for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
    }
    await db.exec(`
      insert into auth.users values ('${uid(1)}','dueno@example.com'),('${uid(2)}','colab@example.com'),
        ('${uid(3)}','cliente@example.com'),('${uid(4)}','ajeno@example.com'),('${uid(5)}','otro-cliente@example.com');
      insert into public.profesionales (id,auth_user_id,nombre,email,rol) values
        ('${uid(11)}','${uid(1)}','Responsable','dueno@example.com','entrenador'),
        ('${uid(12)}','${uid(2)}','Colaborador','colab@example.com','entrenador'),
        ('${uid(14)}','${uid(4)}','Ajeno','ajeno@example.com','entrenador');
      insert into public.clientes (id,auth_user_id,nombre,email,estado) values
        ('${uid(21)}','${uid(3)}','Cliente','cliente@example.com','activo'),
        ('${uid(22)}','${uid(5)}','Otro','otro-cliente@example.com','activo');
      insert into public.clientes_salud_parq (cliente_id,enfermedad_cardiaca_supervisada,
        dolor_pecho_actividad,dolor_pecho_reposo,perdida_consciencia_mareo,
        alteracion_osea_articular,medicacion_presion_arterial,otra_razon_medica)
        values ('${uid(21)}',false,false,false,false,false,false,false);
      insert into public.profesional_cliente (cliente_id,profesional_id,rol) values ('${uid(21)}','${uid(11)}','entrenador');
    `);
    await como(1);
    await db.query(`insert into public.ejercicios (id,profesional_id,nombre,especialidades,articulaciones)
      values ($1,$2,'Ejercicio de prueba',array['equilibrio','activacion'],array['rodilla','pie'])`, [uid(30), uid(11)]);
    await db.query("update public.ejercicios set especialidades=array['cardio','rehabilitacion'] where id=$1", [uid(30)]);
    const etiquetasEjercicio = (await db.query('select especialidades,articulaciones from public.ejercicios where id=$1', [uid(30)])).rows[0];
    assert.deepEqual(etiquetasEjercicio.especialidades, ['cardio', 'rehabilitacion']);
    assert.deepEqual(etiquetasEjercicio.articulaciones, ['rodilla', 'pie']);
    await assert.rejects(db.query("update public.ejercicios set articulaciones=array['invalida'] where id=$1", [uid(30)]), /check constraint/);
    const copiaEjercicios = [{ nombre: 'Ejercicio de prueba', especialidades: ['cardio', 'rehabilitacion'], articulaciones: ['rodilla', 'pie'] }];
    await db.query(`insert into public.clientes_workouts (id,cliente_id,profesional_id,fecha,nombre,ejercicios)
      values ($1,$2,$3,'2030-01-01','Prueba',$4::jsonb)`, [uid(31), uid(21), uid(11), JSON.stringify(copiaEjercicios)]);
    await como(3);
    assert.deepEqual((await db.query('select ejercicios from public.clientes_workouts where id=$1', [uid(31)])).rows[0].ejercicios, copiaEjercicios);
    await como(4);
    assert.equal((await db.query('select id from public.ejercicios where id=$1', [uid(30)])).rows.length, 0);
    await como(1);
    const etiquetaDueno = (await db.query("select public.crear_etiqueta('Nutrición') as id")).rows[0].id;
    assert.equal((await db.query("select public.crear_etiqueta(' nutrición ') as id")).rows[0].id, etiquetaDueno);
    await como(2);
    const etiquetaColaborador = (await db.query("select public.crear_etiqueta('Nutrición') as id")).rows[0].id;
    assert.notEqual(etiquetaColaborador, etiquetaDueno);
    assert.deepEqual((await db.query('select id from public.etiquetas')).rows.map((row) => row.id), [etiquetaColaborador]);
    await db.exec('reset role');
    await db.query('insert into auth.users values ($1,$2)', [uid(6), 'alta-prueba@example.com']);
    await como(1);
    const altaPrueba = (await db.query("select * from public.crear_invitacion('Prueba','alta-prueba@example.com')")).rows[0];
    await como(6);
    const parq = JSON.stringify({
      enfermedad_cardiaca_supervisada: false, dolor_pecho_actividad: false, dolor_pecho_reposo: false,
      perdida_consciencia_mareo: false, alteracion_osea_articular: false,
      medicacion_presion_arterial: false, otra_razon_medica: false,
    });
    const argumentos = [altaPrueba.token, 'Prueba', null, null, '1990-01-01', 'no_especificado',
      'ponerme_en_forma', 170, 70, null, null, null, parq, 'borrador-20261124',
      'borrador-20261124', true, true, true];
    const llamada = `select public.completar_onboarding(${argumentos.map((_, i) => `$${i + 1}`).join(',')}) as id`;
    for (const posicion of [15, 16, 17]) {
      const incompleta = argumentos.slice();
      incompleta[posicion] = false;
      await assert.rejects(db.query(llamada, incompleta), /tres confirmaciones/);
    }
    const versionAntigua = argumentos.slice();
    versionAntigua[13] = 'v1';
    await assert.rejects(db.query(llamada, versionAntigua), /documentos de prueba/);
    await assert.rejects(db.query(`select public.completar_onboarding_interno(${argumentos.slice(0, 15).map((_, i) => `$${i + 1}`).join(',')})`, argumentos.slice(0, 15)), /permission denied/);
    const clienteAlta = (await db.query(llamada, argumentos)).rows[0].id;
    assert.equal((await db.query('select id from public.clientes where id=$1 and auth_user_id=$2', [clienteAlta, uid(6)])).rows.length, 1);
    const aceptaciones = (await db.query('select tipo, version_documento from public.consentimientos where cliente_id=$1 order by tipo', [clienteAlta])).rows;
    assert.deepEqual(aceptaciones.map((a) => [a.tipo, a.version_documento]), [
      ['privacidad', 'borrador-20261124'], ['salud', 'borrador-20261124'], ['terminos', 'borrador-20261124'],
    ]);
    await db.exec('reset role');
    await db.query('delete from public.clientes where id=$1', [clienteAlta]);
    await db.query('delete from auth.users where id=$1', [uid(6)]);
    await como(1);
    const inv = (await db.query("select * from public.equipo_invitar('colab@example.com','entrenador')")).rows[0];
    const invRecepcion = (await db.query("select * from public.equipo_invitar('ajeno@example.com','recepcion')")).rows[0];
    await como(4);
    await db.query('select public.equipo_aceptar_invitacion($1)', [invRecepcion.token]);
    await como(2);
    await db.query('select public.equipo_aceptar_invitacion($1)', [inv.token]);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 0);
    await como(1);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(12),uid(21)]);
    await db.query('select public.equipo_asignar_cliente($1,$2)', [uid(14),uid(21)]);
    const fotoProfesional = `${uid(11)}/perfil.jpg`;
    await db.query("insert into storage.objects values ('profesionales-fotos',$1,'{}')", [fotoProfesional]);
    await db.query("update public.profesionales set nombre='Nuevo',foto_perfil=true where id=$1", [uid(11)]);
    await assert.rejects(db.query("update public.profesionales set rol='administrador' where id=$1", [uid(11)]));
    await como(2);
    assert.equal((await db.query('select name from storage.objects where name=$1', [fotoProfesional])).rows.length, 1);
    assert.equal((await db.query('select id from public.equipo_companeros() where id=$1', [uid(11)])).rows.length, 1);
    assert.equal((await db.query("update storage.objects set metadata='{\"v\":2}' where name=$1 returning name", [fotoProfesional])).rows.length, 0);
    await assert.rejects(db.query("insert into storage.objects values ('profesionales-fotos',$1,'{}')", [`${uid(11)}/otra.jpg`]));
    assert.equal((await db.query("update public.profesionales set nombre='Ajeno' where id=$1 returning id", [uid(11)])).rows.length, 0);
    await como(3);
    assert.equal((await db.query('select name from storage.objects where name=$1', [fotoProfesional])).rows.length, 1);
    assert.equal((await db.query('select foto_perfil from public.profesionales where id=$1', [uid(11)])).rows[0].foto_perfil, true);
    await como(4);
    assert.equal((await db.query('select name from storage.objects where name=$1', [fotoProfesional])).rows.length, 1);
    await como(5);
    assert.equal((await db.query('select name from storage.objects where name=$1', [fotoProfesional])).rows.length, 0);
    await como(1);
    const avatar = `${uid(21)}/perfil/avatar.jpg`;
    const progreso = `${uid(21)}/progreso.jpg`;
    await como(3);
    await db.query("insert into storage.objects values ('progreso-fotos',$1,'{}'),('progreso-fotos',$2,'{}')", [avatar, progreso]);
    assert.equal((await db.query("update storage.objects set metadata='{\"v\":1}' where name=$1 returning name", [avatar])).rows.length, 1);
    await assert.rejects(db.query('update storage.objects set name=$2 where name=$1', [avatar, progreso + '.otro']));
    assert.equal((await db.query("update storage.objects set metadata='{\"v\":1}' where name=$1 returning name", [progreso])).rows.length, 0);
    await como(1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [avatar])).rows.length, 1);
    assert.equal((await db.query("update storage.objects set metadata='{\"v\":2}' where name=$1 returning name", [avatar])).rows.length, 0);
    await como(4);
    assert.equal((await db.query('select name from storage.objects where name=$1', [avatar])).rows.length, 0);
    await como(1);
    const listado = (await db.query('select * from public.equipo_listar()')).rows;
    assert.equal(listado.find((miembro) => miembro.profesional_id === uid(12)).clientes, 1);
    assert.equal((await db.query('select * from public.equipo_clientes($1)', [uid(12)])).rows[0].asignado, true);
    await como(2);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 1);
    const cita = (await db.query("select public.guardar_sesion($1,'Revisión','seguimiento',now()+interval '10 days',now()+interval '10 days 1 hour',null,null) as id", [uid(21)])).rows[0].id;
    const preguntas = [{ texto:'¿Cómo te encuentras?',tipo:'texto' }];
    const plantilla = (await db.query('select public.guardar_formulario(null,$1,$2::jsonb) as id', ['Seguimiento',JSON.stringify(preguntas)])).rows[0].id;
    const envio = (await db.query('select public.enviar_formulario($1,$2) as id', [plantilla,uid(21)])).rows[0].id;
    const ruta = `${uid(21)}/${uid(2)}/${uid(31)}`;
    await db.query("insert into storage.objects values ('seguimiento-archivos',$1,$2::jsonb)", [ruta,JSON.stringify({ mimetype:'application/pdf',size:120 })]);
    await db.query('select public.registrar_archivo_seguimiento($1,$2,$3,$4)', [uid(21),ruta,'informe.pdf','application/pdf']);
    await como(3);
    assert.equal((await db.query('select id from public.formularios_enviados where id=$1', [envio])).rows.length, 1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 1);
    await db.query('select public.responder_formulario($1,$2::jsonb)', [envio,JSON.stringify(['Bien'])]);
    await como(4);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 1);
    assert.equal((await db.query('select cliente_id from public.clientes_salud_parq')).rows.length, 0);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    await como(1);
    await db.query('select public.equipo_retirar_miembro($1)', [uid(12)]);
    await como(2);
    assert.equal((await db.query('select id from public.clientes')).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [fotoProfesional])).rows.length, 0);
    assert.equal((await db.query('select id from public.equipo_companeros()')).rows.length, 0);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 0);
    await como(3);
    assert.equal((await db.query('select id from public.formularios_enviados')).rows.length, 1);
    assert.equal((await db.query('select name from storage.objects where name=$1', [ruta])).rows.length, 1);
    assert.equal((await db.query('select estado from public.sesiones where id=$1', [cita])).rows[0].estado, 'cancelada');
    await db.exec(`reset role;
      with nuevos as (
        insert into public.clientes (nombre,email,estado)
        select 'Pendiente', 'test' || n || '@example.test', 'invitacion_enviada'
        from generate_series(1,56) n returning id,email
      ), asignaciones as (
        insert into public.profesional_cliente (cliente_id,profesional_id,rol)
        select id,'${uid(11)}','entrenador' from nuevos
      )
      insert into public.invitaciones (cliente_id,profesional_id,token_hash,email_destino,estado,fecha_expiracion,creado_en)
      select id,'${uid(11)}',md5(email)||md5(email),email,'enviada',
        case when email='test56@example.test' then now()-interval '1 day' else now()+interval '1 day' end,
        now()-interval '2 days' from nuevos;
    `);
    await como(1);
    const contadores = (await db.query('select * from public.manager_dashboard_contadores()')).rows[0];
    assert.equal(Number(contadores.activos), 1);
    assert.equal(Number(contadores.invitaciones), 55);
    await como(2);
    assert.equal(Number((await db.query('select * from public.manager_dashboard_contadores()')).rows[0].invitaciones), 0);
  } finally { await db.close(); }
});
