import { supabaseAdmin, checkPin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { pin, gameweekId } = req.body;

  if (!checkPin(pin)) return res.status(401).json({ error: "Wrong PIN" });
  if (!gameweekId) return res.status(400).json({ error: "Missing gameweekId" });

  const { data: fixtures, error: fxError } = await supabaseAdmin
    .from("fixtures")
    .select("result_home, result_away")
    .eq("gameweek_id", gameweekId);

  if (fxError) return res.status(400).json({ error: fxError.message });
  const missing = fixtures.some((f) => f.result_home == null || f.result_away == null);
  if (missing) return res.status(400).json({ error: "Enter every final score first" });

  const { error } = await supabaseAdmin
    .from("gameweeks")
    .update({ finalized: true })
    .eq("id", gameweekId);

  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json({ ok: true });
}
