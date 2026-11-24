import { crearHandler } from './handler.mjs';

Deno.serve(crearHandler({
  env: (nombre: string) => Deno.env.get(nombre),
  fetch,
}));
