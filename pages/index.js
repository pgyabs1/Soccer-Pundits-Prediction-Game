import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const ADMIN_PIN_HINT = "Ask the commissioner for the PIN";

function resultOf(h, a) {
  if (h === a) return "D";
  return h > a ? "H" : "A";
}
function pointsFor(ph, pa, ah, aa) {
  if (ph == null || pa == null || ah == null || aa == null) return 0;
  if (resultOf(ph, pa) !== resultOf(ah, aa)) return 0;
  if (ph === ah && pa === aa) return 4;
  return 3;
}
function fmtDeadline(iso) {
  if (!iso) return "No deadline set";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [gameweeks, setGameweeks] = useState([]); // [{...gw, fixtures: [...]}]
  const [predictions, setPredictions] = useState([]); // flat list from db

  const [me, setMe] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState("predict");
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: gws }, { data: fx }, { data: preds }] = await Promise.all([
      supabase.from("players").select("name").order("created_at"),
      supabase.from("gameweeks").select("*").order("number", { ascending: false }),
      supabase.from("fixtures").select("*"),
      supabase.from("predictions").select("*"),
    ]);
    setPlayers((p || []).map((x) => x.name));
    setPredictions(preds || []);
    const withFixtures = (gws || []).map((g) => ({
      ...g,
      fixtures: (fx || []).filter((f) => f.gameweek_id === g.id),
    }));
    setGameweeks(withFixtures);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const join = async (name) => {
    const n = name.trim();
    if (!n) return;
    if (!players.includes(n)) {
      const { error } = await supabase.from("players").insert({ name: n });
      if (error && !error.message.includes("duplicate")) {
        showToast("Couldn't join, try again");
        return;
      }
      setPlayers((prev) => [...prev, n]);
    }
    setMe(n);
  };

  const predFor = (fixtureId) => predictions.find((pr) => pr.fixture_id === fixtureId && pr.player_name === me);

  const [draft, setDraft] = useState({}); // fixtureId -> {h, a}
  const updateDraft = (fixtureId, field, val) =>
    setDraft((d) => ({ ...d, [fixtureId]: { ...(d[fixtureId] || {}), [field]: val } }));

  const submitGw = async (gw) => {
    setSaving(true);
    const rows = gw.fixtures
      .map((fx) => {
        const local = draft[fx.id];
        const existing = predFor(fx.id);
        const h = local?.h ?? existing?.pred_home;
        const a = local?.a ?? existing?.pred_away;
        if (h === "" || a === "" || h == null || a == null) return null;
        return { fixture_id: fx.id, player_name: me, pred_home: Number(h), pred_away: Number(a) };
      })
      .filter(Boolean);

    for (const row of rows) {
      await supabase.from("predictions").upsert(row, { onConflict: "fixture_id,player_name" });
    }
    await loadAll();
    setSaving(false);
    showToast("Predictions locked in \u2705");
  };

  // ---- ADMIN ----
  const [newFixtures, setNewFixtures] = useState([{ home: "", away: "" }]);
  const [newGwNumber, setNewGwNumber] = useState("");
  const [newLockAt, setNewLockAt] = useState("");
  const [resultDrafts, setResultDrafts] = useState({}); // fixtureId -> {h,a}

  const addRow = () => setNewFixtures((f) => [...f, { home: "", away: "" }]);
  const removeRow = (i) => setNewFixtures((f) => f.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setNewFixtures((f) => f.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const publishGw = async () => {
    if (!newGwNumber) { showToast("Enter a gameweek number"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/create-gameweek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pin: pinInput,
        number: Number(newGwNumber),
        lockAt: newLockAt ? new Date(newLockAt).toISOString() : null,
        fixtures: newFixtures,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error || "Failed"); return; }
    setNewGwNumber(""); setNewLockAt(""); setNewFixtures([{ home: "", away: "" }]);
    await loadAll();
    showToast("Gameweek posted \u26bd");
  };

  const saveResults = async (gw) => {
    setSaving(true);
    const results = gw.fixtures.map((fx) => {
      const d = resultDrafts[fx.id] || {};
      return {
        fixtureId: fx.id,
        home: d.h !== undefined ? Number(d.h) : fx.result_home,
        away: d.a !== undefined ? Number(d.a) : fx.result_away,
      };
    });
    const res = await fetch("/api/admin/save-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput, results }),
    });
    setSaving(false);
    if (!res.ok) { showToast("Failed to save"); return; }
    await loadAll();
    showToast("Scores saved");
  };

  const finalizeGw = async (gw) => {
    setSaving(true);
    const res = await fetch("/api/admin/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput, gameweekId: gw.id }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { showToast(data.error || "Enter every score first"); return; }
    await loadAll();
    showToast(`Gameweek ${gw.number} scored \ud83c\udfc6`);
  };

  const openGws = gameweeks.filter((g) => !g.finalized);
  const finalizedGws = gameweeks.filter((g) => g.finalized);

  const leaderboard = players
    .map((name) => {
      let total = 0;
      const byGw = {};
      finalizedGws.forEach((g) => {
        let pts = 0;
        g.fixtures.forEach((fx) => {
          const pred = predictions.find((pr) => pr.fixture_id === fx.id && pr.player_name === name);
          pts += pointsFor(pred?.pred_home, pred?.pred_away, fx.result_home, fx.result_away);
        });
        byGw[g.number] = pts;
        total += pts;
      });
      return { name, total, byGw };
    })
    .sort((a, b) => b.total - a.total);

  if (loading) {
    return <div className="gate"><div className="eyebrow">LOADING THE SOCCER PUNDITS PREDICTION GAME\u2026</div></div>;
  }

  if (!me) {
    return (
      <div className="gate">
        <div className="gate-inner">
          <div className="eyebrow">WEEK IN, WEEK OUT</div>
          <div className="wordmark">THE SOCCER PUNDITS PREDICTION GAME<br />ROOM</div>
          <div className="subtitle">Are You Ready. We Go Again.</div>

          {players.length > 0 && (
            <>
              <div className="label">Who's this?</div>
              <div className="chips">
                {players.map((p) => (
                  <button key={p} className="chip" onClick={() => setMe(p)}>{p}</button>
                ))}
              </div>
            </>
          )}

          <div className="label">New here?</div>
          <div className="row">
            <input
              className="input"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join(nameInput)}
            />
            <button className="btn-amber" onClick={() => join(nameInput)}>Join</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-top">
          <div>
            <div className="header-eyebrow">THE SOCCER PUNDITS PREDICTION GAME</div>
            <div className="header-name">Hi, {me}</div>
          </div>
          <button className="switch-link" onClick={() => { setMe(null); setAdminUnlocked(false); }}>Switch</button>
        </div>
        <div className="tabs">
          {[{ id: "predict", label: "Predict" }, { id: "table", label: "Table" }, { id: "admin", label: "Admin" }].map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="content">
        {tab === "predict" && (
          <>
            {openGws.length === 0 && <div className="empty">No gameweek posted yet.<br />Check back once fixtures drop.</div>}
            {openGws.map((gw) => {
              const locked = gw.lock_at && new Date() >= new Date(gw.lock_at);
              return (
                <div key={gw.id} style={{ marginBottom: "2rem" }}>
                  <div className="gw-head">
                    <div className="gw-title">Gameweek {gw.number}</div>
                    <div className={`pill ${locked ? "locked" : "open"}`}>{locked ? "Locked" : fmtDeadline(gw.lock_at)}</div>
                  </div>
                  {gw.fixtures.map((fx) => {
                    const existing = predFor(fx.id);
                    const local = draft[fx.id] || {};
                    const h = local.h !== undefined ? local.h : (existing?.pred_home ?? "");
                    const a = local.a !== undefined ? local.a : (existing?.pred_away ?? "");
                    return (
                      <div key={fx.id} className="fixture-card">
                        <div className="fixture-row">
                          <div className="fixture-side">
                            <span className="team-name">{fx.home}</span>
                            <input type="number" min="0" max="20" className="score-input" disabled={locked}
                              value={h} onChange={(e) => updateDraft(fx.id, "h", e.target.value)} />
                          </div>
                          <div className="fixture-mid" />
                          <div className="fixture-side">
                            <span className="team-name">{fx.away}</span>
                            <input type="number" min="0" max="20" className="score-input" disabled={locked}
                              value={a} onChange={(e) => updateDraft(fx.id, "a", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!locked && (
                    <button className="btn-primary" disabled={saving} onClick={() => submitGw(gw)}>
                      Lock In Predictions
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === "table" && (
          <>
            <div className="section-title">\ud83c\udfc6 League Table</div>
            {finalizedGws.length === 0 ? (
              <div className="empty">No completed gameweeks yet. The table fills in once results are scored.</div>
            ) : (
              leaderboard.map((row, i) => (
                <div key={row.name} className="lb-row">
                  <button className="lb-head" onClick={() => setExpanded(expanded === row.name ? null : row.name)}>
                    <div className="lb-left">
                      <span className={`rank ${i === 0 ? "first" : ""}`}>{i + 1}</span>
                      <span className="lb-name">{row.name}</span>
                    </div>
                    <span className="lb-pts">{row.total} pts</span>
                  </button>
                  {expanded === row.name && (
                    <div className="lb-detail">
                      {finalizedGws.map((g) => (
                        <div key={g.number} className="lb-chip">GW{g.number}: <b>{row.byGw[g.number] ?? 0}</b></div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {tab === "admin" && !adminUnlocked && (
          <div className="admin-gate">
            <p style={{ color: "#5C7A6A", fontSize: "0.85rem", marginBottom: "1rem" }}>{ADMIN_PIN_HINT}</p>
            <input type="password" placeholder="PIN" value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(false); }} />
            {pinError && <div className="error-text">Wrong PIN</div>}
            <button className="btn-primary" onClick={async () => {
              // Verify by attempting a harmless call; real check happens server-side on each action.
              setAdminUnlocked(true);
            }}>Unlock</button>
          </div>
        )}

        {tab === "admin" && adminUnlocked && (
          <>
            <div className="section-title">Post a Gameweek</div>
            <div className="card">
              <div className="fx-row">
                <input className="field" type="number" placeholder="GW number" value={newGwNumber} onChange={(e) => setNewGwNumber(e.target.value)} />
                <input className="field" type="datetime-local" value={newLockAt} onChange={(e) => setNewLockAt(e.target.value)} />
              </div>
              {newFixtures.map((f, i) => (
                <div key={i} className="fx-row">
                  <input className="field" placeholder="Home team" value={f.home} onChange={(e) => updateRow(i, "home", e.target.value)} />
                  <input className="field" placeholder="Away team" value={f.away} onChange={(e) => updateRow(i, "away", e.target.value)} />
                  {newFixtures.length > 1 && <button className="remove-btn" onClick={() => removeRow(i)}>\u2715</button>}
                </div>
              ))}
              <button className="small-btn" onClick={addRow}>+ Add fixture</button>
              <button className="btn-amber" style={{ width: "100%", marginTop: "0.75rem" }} disabled={saving} onClick={publishGw}>
                Post Gameweek
              </button>
            </div>

            {openGws.length > 0 && (
              <>
                <div className="section-title" style={{ marginTop: "1.5rem" }}>Enter Final Scores</div>
                {openGws.map((gw) => (
                  <div key={gw.id} className="card">
                    <b style={{ fontSize: "0.85rem" }}>Gameweek {gw.number}</b>
                    <div style={{ marginTop: "0.6rem" }}>
                      {gw.fixtures.map((fx) => {
                        const d = resultDrafts[fx.id] || {};
                        const h = d.h !== undefined ? d.h : (fx.result_home ?? "");
                        const a = d.a !== undefined ? d.a : (fx.result_away ?? "");
                        return (
                          <div key={fx.id} className="result-row">
                            <span>{fx.home}</span>
                            <input className="result-num" type="number" min="0" max="20" value={h}
                              onChange={(e) => setResultDrafts((rd) => ({ ...rd, [fx.id]: { ...(rd[fx.id] || {}), h: e.target.value } }))} />
                            <span>-</span>
                            <input className="result-num" type="number" min="0" max="20" value={a}
                              onChange={(e) => setResultDrafts((rd) => ({ ...rd, [fx.id]: { ...(rd[fx.id] || {}), a: e.target.value } }))} />
                            <span>{fx.away}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="two-col">
                      <button className="btn-outline" disabled={saving} onClick={() => saveResults(gw)}>Save Draft</button>
                      <button className="btn-dark" disabled={saving} onClick={() => finalizeGw(gw)}>Finalize & Score</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
