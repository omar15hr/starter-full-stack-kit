import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import { createClient } from "@supabase/supabase-js";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return new Response("Email and password are required", { status: 400 });
  }

  const supabase = createClient(
    getSecret("SUPABASE_URL")!,
    getSecret("SUPABASE_KEY")!,
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const { access_token, refresh_token } = data.session;

  cookies.set("sb-access-token", access_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });
  cookies.set("sb-refresh-token", refresh_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  const userRole = profile?.role || "user";

  return redirect(userRole === "admin" ? "/admin" : "/dashboard");
};
