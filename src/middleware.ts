import { getSecret } from "astro:env/server";
import { defineMiddleware } from "astro:middleware";
import { createClient } from "@supabase/supabase-js";

const protectedRoutes = ["/dashboard", "/admin"];
const adminRoutes = ["/admin"];
const authRoutes = ["/signin", "/register"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(
    getSecret("SUPABASE_URL")!,
    getSecret("SUPABASE_KEY")!,
  );

  const accessToken = context.cookies.get("sb-access-token");
  const refreshToken = context.cookies.get("sb-refresh-token");

  const isLoggedIn = accessToken && refreshToken;

  const isProtectedRoute = protectedRoutes.some((route) =>
    context.url.pathname.startsWith(route),
  );
  const isAdminRoute = adminRoutes.some((route) =>
    context.url.pathname.startsWith(route),
  );

  if (isProtectedRoute && !isLoggedIn) {
    return context.redirect("/signin");
  }

  if (authRoutes.includes(context.url.pathname) && isLoggedIn) {
    return context.redirect("/dashboard");
  }
  if (isProtectedRoute && isLoggedIn) {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token: accessToken.value,
        refresh_token: refreshToken.value,
      });

    if (sessionError || !sessionData.user) {
      context.cookies.delete("sb-access-token", { path: "/" });
      context.cookies.delete("sb-refresh-token", { path: "/" });
      return context.redirect("/signin");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", sessionData.user.id)
      .single();

    const userRole = profile?.role || "user";

    if (isAdminRoute && userRole !== "admin") {
      return context.redirect("/dashboard");
    }
    context.locals.email = sessionData.user.email ?? "";
    context.locals.role = userRole;
    context.locals.userId = sessionData.user.id;
  }

  const response = await next();

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
});
