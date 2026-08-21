import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { name, pin } = req.body;
  const trimmed = (name || "").trim();

  if (!trimmed) return res.status(400).json({ error: "Enter your name" });
  if (!/^\d{4}$/.test(pin || "")) return res.status(400).json({ error: "PIN must be 4 digits" });

  const { data: existing, error } = await supabaseAdmin
    .from("players")
    .select("id, name, pin")
    .ilike("name", trimmed)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });

  if (existing) {
    if (existing.pin !== pin) {
      return res.status(401).json({ error: "Wrong PIN for that name" });
    }
    return res.status(200).json({ ok: true, name: existing.name });
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from("players")
    .insert({ name: trimmed, pin })
    .select()
    .single();

  if (insErr) return res.status(400).json({ error: insErr.message });
  return res.status(200).json({ ok: true, name: created.name, created: true });
}
