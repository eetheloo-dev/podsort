import { useState, useEffect } from "react";

const CLIENT_ID = "daac0a3489394cd3bf19d9a85987c4a9";
const REDIRECT_URI = "https://localhost:5173/callback";
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

function getTokenFromURL() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get("access_token");
}

export default function App() {
  const [token, setToken] = useState("");
  const [podcasts, setPodcasts] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getTokenFromURL();
    if (token) {
      setToken(token);
      window.location.hash = "";
    }
  }, []);

  const handleSort = async () => {
    const list = podcasts.split("\n").filter(p => p.trim() !== "");
    if (list.length === 0) return;
    if (!apiKey) { setError("Please enter your API key"); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          system: "Classify podcasts as energy or other. Reply ONLY with JSON: {\"energy\": [], \"other\": []}",
          messages: [{ role: "user", content: list.join("\n") }]
        })
      });
      const data = await response.json();
      const text = data.content[0].text.trim();
      const clean = text.replace(/```json|```/g, "").trim();
      setResults(JSON.parse(clean));
    } catch (err) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "40px auto", fontFamily: "monospace", padding: "0 20px" }}>
      <h1>🎧 PodSort</h1>
      <p style={{ color: "#666" }}>AI-powered podcast sorter — Energy vs Everything Else.</p>

      {!token ? (
        <div style={{ marginTop: "20px" }}>
          <a href={getSpotifyAuthURL()}>
            <button style={{ padding: "12px 24px", background: "#1DB954", color: "white", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "24px", fontSize: "1rem" }}>
              Connect Spotify
            </button>
          </a>
        </div>
      ) : (
        <p style={{ color: "#1DB954", marginTop: "10px" }}>✅ Spotify connected!</p>
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
        <label>Your Podcasts (one per line)</label><br />
        <textarea
          value={podcasts}
          onChange={e => setPodcasts(e.target.value)}
          placeholder={"The Energy Gang\nMy Favorite Murder\nPlanet Money"}
          style={{ width: "100%", height: "150px", padding: "8px", marginTop: "6px" }}
        />
      </div>

      <button
        onClick={handleSort}
        disabled={loading}
        style={{ marginTop: "16px", padding: "10px 24px", background: "#e8ff47", border: "none", fontWeight: "bold", cursor: "pointer" }}
      >
        {loading ? "Sorting..." : "→ Sort My Podcasts"}
      </button>

      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}

      {results && (
        <div style={{ marginTop: "30px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <h3 style={{ color: "green" }}>⚡ Energy ({results.energy?.length})</h3>
            {results.energy?.map((p, i) => <p key={i}>— {p}</p>)}
          </div>
          <div>
            <h3 style={{ color: "red" }}>🎧 Everything Else ({results.other?.length})</h3>
            {results.other?.map((p, i) => <p key={i}>— {p}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
