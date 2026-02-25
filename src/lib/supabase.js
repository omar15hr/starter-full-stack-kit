import { getSecret } from "astro:env/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = getSecret("SUPABASE_URL");
const supabaseKey = getSecret("SUPABASE_KEY");

export const supabase = createClient(supabaseUrl, supabaseKey);
