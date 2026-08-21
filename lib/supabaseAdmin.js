import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key and must only ever be
// imported from files inside pages/api/** (server-side code).
// It bypasses row-level security, which is exactly why it's
// kept out of anything that ships to the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function checkPin(pin) {
  return typeof pin === "string" && pin === process.env.ADMIN_PIN;
}
