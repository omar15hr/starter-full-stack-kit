1. Levantamiento de la app
2. Añadimos dependencias
3. Añadimos la configuración con Supabase

SUPABASE_URL=
SUPABASE_KEY=

4. Aplicamos seguridad con middleware y rutas protegidas
5. Definimos roles de usuario (admin, user)
6. Aplicamos los cambios en Supabase (RLS)
7. Mejoramos lógica de auth

Plan: Tablas Categorías y Productos con Control de Acceso por Roles (RLS)
Crear las tablas categorias y productos en Supabase con Row Level Security (RLS) basado en el rol del usuario (user o admin) almacenado en la tabla profiles existente.

IMPORTANT

Este plan es funcional, no incluye cambios de UI ni clases de Tailwind CSS. Se enfoca en la base de datos, políticas RLS y la lógica server-side en Astro. Todos los ejemplos incluyen instrucciones paso a paso para la UI de Supabase.

Contexto del Proyecto
Proyecto Supabase: Good Menu (ID: utsdczvpaucbxmcjnsrv)
Tabla existente: profiles con columna role ('user' | 'admin')
Middleware existente: Ya verifica roles y redirige rutas /admin
Cliente Supabase: Configurado en
src/lib/supabase.js
con SUPABASE_URL y SUPABASE_KEY
Paso 1 — Crear la función auxiliar private.is_admin()
Esta función optimiza el rendimiento de las políticas RLS al usar security definer para consultar la tabla profiles sin penalización de RLS. Según la documentación oficial de Supabase, esta es la mejor práctica para verificar roles.

En la UI de Supabase:
Ir a SQL Editor en el Dashboard
Ejecutar el siguiente SQL:
sql
-- 1. Crear el esquema privado si no existe (no expuesto por la API)
create schema if not exists private;
-- 2. Crear función que verifica si el usuario actual es admin
create or replace function private.is_admin()
returns boolean
language plpgsql
security definer -- se ejecuta con los permisos del creador (bypassa RLS)
as $$
begin
return exists (
select 1 from public.profiles
where id = (select auth.uid())
and role = 'admin'
);
end;

$$
;
NOTE

El schema private nunca se expone a través de la API de Supabase, lo cual protege esta función de ser llamada directamente por un cliente. Además, envolvemos auth.uid() en un (select ...) para que Postgres cachee el resultado por consulta, mejorando el rendimiento (ver benchmarks).

Paso 2 — Crear la tabla categorias
En la UI de Supabase (opción Table Editor):
Ir a Table Editor → New Table
Nombre: categorias
✅ Activar Enable Row Level Security (RLS)
Columnas:
Nombre	Tipo	Default	Nullable	Primary Key
id	uuid	gen_random_uuid()	No	✅
nombre	text	—	No	—
descripcion	text	—	Sí	—
created_at	timestamptz	now()	No	—
O por SQL Editor:
sql
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  created_at timestamptz not null default now()
);
-- Habilitar RLS (obligatorio para tablas en el schema public)
alter table public.categorias enable row level security;
Paso 3 — Crear la tabla productos
En la UI de Supabase (opción Table Editor):
Ir a Table Editor → New Table
Nombre: productos
✅ Activar Enable Row Level Security (RLS)
Columnas:
Nombre	Tipo	Default	Nullable	Primary Key	Foreign Key
id	uuid	gen_random_uuid()	No	✅	—
nombre	text	—	No	—	—
precio	numeric	—	No	—	—
categoria_id	uuid	—	No	—	categorias.id
created_at	timestamptz	now()	No	—	—
En la columna categoria_id, configurar Foreign Key apuntando a categorias.id
O por SQL Editor:
sql
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric not null check (precio >= 0),
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Habilitar RLS
alter table public.productos enable row level security;
-- Índice para mejorar rendimiento en consultas por categoría
create index idx_productos_categoria_id on public.productos using btree (categoria_id);
TIP

Se incluye on delete cascade para que al eliminar una categoría, sus productos asociados se eliminen automáticamente. Se añade un check (precio >= 0) para garantizar integridad de datos.

Paso 4 — Crear políticas RLS para categorias
Las políticas siguen el principio: todos los usuarios autenticados (user y admin) pueden leer, pero solo admin puede crear, actualizar y eliminar.

En la UI de Supabase:
Ir a Authentication → Policies
Buscar la tabla categorias
Click en New Policy para cada política
Política 1: SELECT — Todos los autenticados pueden ver:
sql
create policy "Usuarios autenticados pueden ver categorias"
on public.categorias
for select
to authenticated
using ( true );
En la UI: New Policy → SELECT → Target roles: authenticated → USING: true

Política 2: INSERT — Solo admin puede crear:
sql
create policy "Solo admin puede crear categorias"
on public.categorias
for insert
to authenticated
with check ( (select private.is_admin()) );
En la UI: New Policy → INSERT → Target roles: authenticated → WITH CHECK: (select private.is_admin())

Política 3: UPDATE — Solo admin puede actualizar:
sql
create policy "Solo admin puede actualizar categorias"
on public.categorias
for update
to authenticated
using ( (select private.is_admin()) )
with check ( (select private.is_admin()) );
En la UI: New Policy → UPDATE → Target roles: authenticated → USING: (select private.is_admin()) → WITH CHECK: (select private.is_admin())

Política 4: DELETE — Solo admin puede eliminar:
sql
create policy "Solo admin puede eliminar categorias"
on public.categorias
for delete
to authenticated
using ( (select private.is_admin()) );
En la UI: New Policy → DELETE → Target roles: authenticated → USING: (select private.is_admin())

Paso 5 — Crear políticas RLS para productos
Las mismas reglas aplican para productos.

Política 1: SELECT — Todos los autenticados pueden ver:
sql
create policy "Usuarios autenticados pueden ver productos"
on public.productos
for select
to authenticated
using ( true );
Política 2: INSERT — Solo admin puede crear:
sql
create policy "Solo admin puede crear productos"
on public.productos
for insert
to authenticated
with check ( (select private.is_admin()) );
Política 3: UPDATE — Solo admin puede actualizar:
sql
create policy "Solo admin puede actualizar productos"
on public.productos
for update
to authenticated
using ( (select private.is_admin()) )
with check ( (select private.is_admin()) );
Política 4: DELETE — Solo admin puede eliminar:
sql
create policy "Solo admin puede eliminar productos"
on public.productos
for delete
to authenticated
using ( (select private.is_admin()) );
Paso 6 — API Routes en Astro (CRUD server-side)
Crear API endpoints en Astro para que el frontend pueda interactuar con las tablas. Al usar el cliente Supabase con la sesión del usuario, las políticas RLS se aplican automáticamente.

6.1 — API para Categorías
[NEW]
categorias.ts
typescript
import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
// GET — Listar todas las categorías
export const GET: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  // Establecer sesión del usuario para que RLS aplique
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
// POST — Crear una categoría (solo admin, protegido por RLS)
export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const body = await request.json();
  const { nombre, descripcion } = body;
  if (!nombre) {
    return new Response(
      JSON.stringify({ error: "El nombre es obligatorio" }),
      { status: 400 },
    );
  }
  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre, descripcion })
    .select()
    .single();
  if (error) {
    // RLS denegará la operación si el usuario no es admin
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
    });
  }
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
[NEW]
categoria.ts
typescript
import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
// PUT — Actualizar categoría (solo admin, protegido por RLS)
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const body = await request.json();
  const { nombre, descripcion } = body;
  const { data, error } = await supabase
    .from("categorias")
    .update({ nombre, descripcion })
    .eq("id", params.id)
    .select()
    .single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
    });
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
// DELETE — Eliminar categoría (solo admin, protegido por RLS)
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const { error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", params.id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
    });
  }
  return new Response(null, { status: 204 });
};
6.2 — API para Productos
[NEW]
productos.ts
typescript
import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
// GET — Listar productos con su categoría
export const GET: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  // Consulta con join a la tabla categorias
  const { data, error } = await supabase
    .from("productos")
    .select("*, categorias(nombre)")
    .order("created_at", { ascending: true });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
// POST — Crear producto (solo admin, protegido por RLS)
export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const body = await request.json();
  const { nombre, precio, categoria_id } = body;
  if (!nombre || precio === undefined || !categoria_id) {
    return new Response(
      JSON.stringify({
        error: "nombre, precio y categoria_id son obligatorios",
      }),
      { status: 400 },
    );
  }
  const { data, error } = await supabase
    .from("productos")
    .insert({ nombre, precio, categoria_id })
    .select("*, categorias(nombre)")
    .single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
    });
  }
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
[NEW]
producto.ts
typescript
import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
// PUT — Actualizar producto (solo admin, protegido por RLS)
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const body = await request.json();
  const { nombre, precio, categoria_id } = body;
  const { data, error } = await supabase
    .from("productos")
    .update({ nombre, precio, categoria_id })
    .eq("id", params.id)
    .select("*, categorias(nombre)")
    .single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
    });
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
// DELETE — Eliminar producto (solo admin, protegido por RLS)
export const DELETE: APIRoute = async ({ params, cookies }) => {
  const accessToken = cookies.get("sb-access-token")?.value;
  const refreshToken = cookies.get("sb-refresh-token")?.value;
  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
    });
  }
  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  const { error } = await supabase
    .from("productos")
    .delete()
    .eq("id", params.id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
    });
  }
  return new Response(null, { status: 204 });
};
Resumen de Archivos
Archivos nuevos
Archivo	Descripción
src/pages/api/categorias.ts	GET (listar) y POST (crear) categorías
src/pages/api/categorias/[id].ts	PUT (actualizar) y DELETE (eliminar) categoría
src/pages/api/productos.ts	GET (listar) y POST (crear) productos
src/pages/api/productos/[id].ts	PUT (actualizar) y DELETE (eliminar) producto
Sin cambios
Archivo	Razón
src/middleware.ts
Ya maneja autenticación y roles
src/lib/supabase.js
Ya configurado
astro.config.mjs
Ya tiene output: 'server'
Diagrama de Arquitectura
Supabase
Frontend (Astro)
setSession()
JWT
Verifica rol
Consulta
FK
Páginas Astro(dashboard, admin)
API Routes/api/categorias/api/productos
Middleware(auth + roles)
Auth(JWT tokens)
RLS Policies
private.is_admin()
Tabla: categorias
Tabla: productos
Tabla: profiles
Plan de Verificación
Verificación en el Dashboard de Supabase
Ir a Table Editor → Verificar que las tablas categorias y productos aparecen con RLS habilitado
Ir a Authentication → Policies → Verificar que cada tabla tiene 4 políticas (SELECT, INSERT, UPDATE, DELETE)
Verificación manual con usuario admin
Iniciar sesión como usuario con rol admin
Hacer request POST /api/categorias con body { "nombre": "Bebidas", "descripcion": "Todas las bebidas" } → Debe retornar 201
Hacer request POST /api/productos con body { "nombre": "Coca Cola", "precio": 25.50, "categoria_id": "<id-de-la-categoria>" } → Debe retornar 201
Hacer request GET /api/productos → Debe retornar la lista de productos con la categoría asociada
Verificación manual con usuario user
Iniciar sesión como usuario con rol user
Hacer request GET /api/productos → Debe retornar 200 con la lista de productos
Hacer request POST /api/categorias con body { "nombre": "Test" } → Debe fallar con 403
Hacer request DELETE /api/productos/<id> → Debe fallar con 403
Verificación con SQL en el Dashboard
Ir a SQL Editor y ejecutar:

sql
-- Verificar que las tablas existen
select table_name, is_insertable_into
from information_schema.tables
where table_schema = 'public' and table_name in ('categorias', 'productos');
-- Verificar que RLS está habilitado
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('categorias', 'productos');
-- Verificar las políticas
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('categorias', 'productos');
$$
