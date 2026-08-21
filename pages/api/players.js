import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("name")
    .order("created_at");

  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json({ players: (data || []).map((p) => p.name) });
}
