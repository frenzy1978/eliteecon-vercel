import { getBearerToken, getSupabaseServerClient } from "@/lib/supabase";

export type AuthUser = {
  id: string;
  email?: string;
  source: "supabase" | "header" | "demo";
};

export function isAuthEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getAuthUserFromRequest(req: Request): Promise<AuthUser | null> {
  // Preferred: verify Supabase bearer token when configured.
  const token = getBearerToken(req);
  const supabase = getSupabaseServerClient();
  if (token && supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { id: data.user.id, email: data.user.email, source: "supabase" };
    }
  }

  // Temporary scaffold fallback (internal testing only)
  const fromHeader = req.headers.get("x-eliteecon-user")?.trim();
  if (fromHeader && /^[a-zA-Z0-9_-]{6,64}$/.test(fromHeader)) {
    return { id: fromHeader, source: "header" };
  }

  if (process.env.ELITEECON_ALLOW_DEMO_AUTH === "true") {
    return { id: "demo-user", source: "demo" };
  }

  return null;
}
