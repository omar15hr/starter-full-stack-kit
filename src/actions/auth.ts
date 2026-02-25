import { z } from "astro/zod";
import { getSecret } from "astro:env/server";
import { createClient } from "@supabase/supabase-js";
import { defineAction, ActionError } from "astro:actions";

export const auth = {
  signin: defineAction({
    accept: "form",
    input: z.object({
      email: z.preprocess(
        (val) => val ?? "",
        z.string().email("Ingresa un email válido"),
      ),
      password: z.preprocess(
        (val) => val ?? "",
        z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
      ),
    }),
    handler: async (input, context) => {
      const supabase = createClient(
        getSecret("SUPABASE_URL")!,
        getSecret("SUPABASE_KEY")!,
      );

      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "Credenciales inválidas",
        });
      }

      const { access_token, refresh_token } = data.session;

      context.cookies.set("sb-access-token", access_token, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      context.cookies.set("sb-refresh-token", refresh_token, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      return { role: profile?.role || "user" };
    },
  }),

  register: defineAction({
    accept: "form",
    input: z.object({
      email: z.preprocess(
        (val) => val ?? "",
        z.string().email("Ingresa un email válido"),
      ),
      password: z.preprocess(
        (val) => val ?? "",
        z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
      ),
    }),
    handler: async (input, context) => {
      const supabase = createClient(
        getSecret("SUPABASE_URL")!,
        getSecret("SUPABASE_KEY")!,
      );

      const { error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
      });

      if (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Error al registrar el usuario",
        });
      }

      return { success: true };
    },
  }),

  signout: defineAction({
    accept: "form",
    input: z.object({}),
    handler: async (_input, context) => {
      const accessToken = context.cookies.get("sb-access-token");
      const refreshToken = context.cookies.get("sb-refresh-token");

      if (accessToken && refreshToken) {
        const supabase = createClient(
          getSecret("SUPABASE_URL")!,
          getSecret("SUPABASE_KEY")!,
        );
        await supabase.auth.setSession({
          access_token: accessToken.value,
          refresh_token: refreshToken.value,
        });
        await supabase.auth.signOut();
      }

      context.cookies.delete("sb-access-token", { path: "/" });
      context.cookies.delete("sb-refresh-token", { path: "/" });
      return { success: true };
    },
  }),
};
