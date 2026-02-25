import { createClient } from "@supabase/supabase-js";
import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";

export const POST: APIRoute = async ({ request, redirect }) => {
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

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return redirect("/signin");
};
