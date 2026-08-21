import { supabaseAdmin, checkPin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { pin, number, lockAt, fixtures } = req.body;

  if (!checkPin(pin)) return res.status(401).json({ error: "Wrong PIN" });
  if (!number || !Array.isArray(fixtures) || fixtures.length === 0) {
    return res.status(400).json({ error: "Missing gameweek number or fixtures" });
  }

  const { data: gw, error: gwError } = await supabaseAdmin
    .from("gameweeks")
    .insert({ number, lock_at: lockAt || null })
    .select()
    .single();

  if (gwError) return res.status(400).json({ error: gwError.message });

  const rows = fixtures
    .filter((f) => f.home?.trim() && f.away?.trim())
    .map((f) => ({ gameweek_id: gw.id, home: f.home.trim(), away: f.away.trim() }));

  const { error: fxError } = await supabaseAdmin.from("fixtures").insert(rows);
  if (fxError) return res.status(400).json({ error: fxError.message });

  res.status(200).json({ ok: true, gameweek: gw });
}
