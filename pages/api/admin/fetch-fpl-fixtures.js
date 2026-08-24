import { checkPin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { pin } = req.body;
  if (!checkPin(pin)) return res.status(401).json({ error: "Wrong PIN" });

  try {
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/");
    if (!bootstrapRes.ok) throw new Error("FPL bootstrap request failed");
    const bootstrap = await bootstrapRes.json();

    const teamNames = {};
    (bootstrap.teams || []).forEach((t) => { teamNames[t.id] = t.name; });

    const event =
      (bootstrap.events || []).find((e) => e.is_next) ||
      (bootstrap.events || []).find((e) => e.is_current);

    if (!event) return res.status(404).json({ error: "Couldn't find an upcoming FPL gameweek" });

    const fixturesRes = await fetch(`https://fantasy.premierleague.com/api/fixtures/?event=${event.id}`);
    if (!fixturesRes.ok) throw new Error("FPL fixtures request failed");
    const fixtures = await fixturesRes.json();

    const mapped = fixtures.map((f) => ({
      home: teamNames[f.team_h] || "TBC",
      away: teamNames[f.team_a] || "TBC",
      lockAt: f.kickoff_time || null, // ISO string, or null if not yet confirmed by the PL
    }));

    res.status(200).json({ ok: true, gwNumber: event.id, fixtures: mapped });
  } catch (e) {
    res.status(500).json({ error: "Couldn't reach the FPL site \u2014 try again in a moment" });
  }
}
