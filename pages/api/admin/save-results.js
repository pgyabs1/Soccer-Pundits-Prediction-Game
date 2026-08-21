import { supabaseAdmin, checkPin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { pin, results } = req.body; // results: [{ fixtureId, home, away }]

  if (!checkPin(pin)) return res.status(401).json({ error: "Wrong PIN" });
  if (!Array.isArray(results)) return res.status(400).json({ error: "Missing results" });

  for (const r of results) {
    const { error } = await supabaseAdmin
      .from("fixtures")
      .update({ result_home: r.home, result_away: r.away })
      .eq("id", r.fixtureId);
    if (error) return res.status(400).json({ error: error.message });
  }

  res.status(200).json({ ok: true });
}
