import { useState, useEffect } from "react";

const CLIENT_ID = "daac0a3489394cd3bf19d9a85987c4a9";
const REDIRECT_URI = "https://sage-boba-e40b86.netlify.app/callback";
const SCOPES = "user-library-read playlist-modify-public playlist-modify-private";

function getSpotifyAuthURL() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export default function App() {
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [days, setDays] = useState(7);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      window.history.replaceState({}, document.title, "/");
      exchangeCode(code);
    }
  }, []);

  async function exchangeCode(code: string) {
    setStatus("Connecting to Spotify...");
    try {
      const res = await fetch("/.netlify/functions/token-exchange", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.access_token) {
        setToken(data.access_token);
        setStatus("");
      } else {
        setError("Token exchange failed: " + JSON.stringify(data));
      }
    } catch (err: any) {
      setError("Auth error: " + err.message);
    }
  }

  async function runPipeline() {
    if (!apiKey) { setError("Please enter your Claude API key"); return; }
    if (!token) { setError("Please connect Spotify first"); return; }
    setLoading(true);
    setError("");
    setEpisodes([]);

    try {
      setStatus("Fetching your podcasts from Spotify...");
      const showsRes = await fetch("https://api.spotify.com/v1/me/shows?limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const showsData = await showsRes.json();

      if (!showsData.items) {
        setError("Couldn't fetch podcasts. Try reconnecting Spotify.");
        setLoading(false);
        return;
      }

      const podcasts = showsData.items.map((item: any) => item.show.name);
      setStatus(`Found ${podcasts.length} podcasts. Classifying with Claude...`);

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          system: `Classify podcasts as "energy" (motivating, high-energy, business, fitness, entrepreneurship, tech, news) or "other". Reply ONLY with JSON: {"energy": [], "other": []}`,
          messages: [{ role: "user", content: podcasts.join("\n") }],
        }),
      });
      const claudeData = await claudeRes.json();
      const text = claudeData.content[0].text.replace(/```json|```/g, "").trim();
      const classified = JSON.parse(text);
      const energyNames: string[] = classified.energy;

      setStatus(`Found ${energyNames.length} energy podcasts. Checking last ${days} day${days > 1 ? "s" : ""}...`);

      const energyShows = showsData.items
        .filter((item: any) => energyNames.includes(item.show.name))
        .map((item: any) => item.show);

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const newEpisodes: any[] = [];

      for (const show of energyShows) {
        const epRes = await fetch(
          `https://api.spotify.com/v1/shows/${show.id}/episodes?limit=5&market=IN`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const epData = await epRes.json();
        for (const ep of epData.items || []) {
          if (!ep || !ep.release_date) continue;
          const releaseDate = new Date(ep.release_date).getTime();
          if (releaseDate >= cutoff) {
            newEpisodes.push({
              id: ep.id,
              name: ep.name,
              show: show.name,
              duration: Math.round(ep.duration_ms / 60000),
              date: ep.release_date,
              url: ep.external_urls?.spotify,
              image: show.images?.[1]?.url || show.images?.[0]?.url,
            });
          }
        }
      }

      setEpisodes(newEpisodes);
      setStatus(`⚡ Found ${newEpisodes.length} energy episodes from the last ${days} day${days > 1 ? "s" : ""}`);

    } catch (err: any) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "680px", margin: "40px auto", fontFamily: "monospace", padding: "0 20px" }}>
      <h1>🎧 PodSort</h1>
      <p style={{ color: "#666" }}>AI-powered podcast sorter — Energy vs Everything Else.</p>

      {!token ? (
        <a href={getSpotifyAuthURL()}>
          <button style={{ padding: "12px 24px", background: "#1DB954", color: "white", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "24px", fontSize: "1rem" }}>
            Connect Spotify
          </button>
        </a>
      ) : (
        <p style={{ color: "#1DB954" }}>✅ Spotify connected!</p>
      )}

      <div style={{ marginTop: "20px" }}>
        <label>Your Claude API Key</label><br />
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          style={{ width: "100%", padding: "8px", marginTop: "6px" }}
        />
      </div>

      <div style={{ marginTop: "20px" }}>
        <label>Show episodes from the last:</label>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          {[1, 3, 7, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: "8px 16px",
                background: days === d ? "#e8ff47" : "#1a1a1a",
                color: days === d ? "black" : "#aaa",
                border: days === d ? "none" : "1px solid #333",
                borderRadius: "20px",
                fontWeight: "bold",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              {d} {d === 1 ? "day" : "days"}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={runPipeline}
        disabled={loading}
        style={{ marginTop: "20px", padding: "10px 24px", background: "#e8ff47", border: "none", fontWeight: "bold", cursor: "pointer" }}
      >
        {loading ? "Running..." : "⚡ Run PodSort"}
      </button>

      {status && <p style={{ color: "#aaa", marginTop: "10px" }}>{status}</p>}
      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}

      {episodes.length > 0 && (
        <div style={{ marginTop: "30px" }}>
          <h2 style={{ color: "#e8ff47" }}>⚡ New Energy Episodes</h2>
          {episodes.map((ep) => (
            
              key={ep.id}
              href={ep.url}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px",
                  marginBottom: "10px",
                  background: "#1a1a1a",
                  borderRadius: "8px",
                  cursor: "pointer",
                  border: "1px solid #333",
                }}
                onMouseEnter={e => (e.currentTarget.style.border = "1px solid #1DB954")}
                onMouseLeave={e => (e.currentTarget.style.border = "1px solid #333")}
              >
                {ep.image && <img src={ep.image} alt={ep.show} style={{ width: "56px", height: "56px", borderRadius: "6px", flexShrink: 0 }} />}
                <div>
                  <p style={{ margin: 0, color: "white", fontWeight: "bold", fontSize: "0.9rem" }}>{ep.name}</p>
                  <p style={{ margin: "4px 0 0", color: "#1DB954", fontSize: "0.8rem" }}>{ep.show}</p>
                  <p style={{ margin: "2px 0 0", color: "#666", fontSize: "0.75rem" }}>{ep.date} · {ep.duration} min</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
