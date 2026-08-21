import { supabaseAdmin, checkPin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { pin, gameweekId } = req.body;

  if (!checkPin(pin)) return res.status(401).json({ error: "Wrong PIN" });
  if (!gameweekId) return res.status(400).json({ error: "Missing gameweekId" });

  const { error } = await supabaseAdmin.from("gameweeks").delete().eq("id", gameweekId);
  if (error) return res.status(400).json({ error: error.message });

  res.status(200).json({ ok: true });
}
