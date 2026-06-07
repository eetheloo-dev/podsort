import { useState, useEffect } from "react";

const CLIENT_ID = "daac0a3489394cd3bf19d9a85987c4a9";
const REDIRECT_URI = "https://sage-boba-e40b86.netlify.app/callback";
const SCOPES = "user-library-read playlist-modify-public playlist-modify-private ugc-image-upload";

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
  const [done, setDone] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      window.history.replaceState({}, document.title, "/");
      exchangeCode(code);
    } else {
      const saved = localStorage.getItem("spotify_token");
      if (saved) setToken(saved);
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
        localStorage.setItem("spotify_token", data.access_token);
        setStatus("Spotify connected!");
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
    setDone(false);
    setPlaylistUrl("");

    try {
      // Step 1: Fetch followed podcasts
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

      // Step 2: Claude classifies energy podcasts
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

      setStatus(`Found ${energyNames.length} energy podcasts. Checking for new episodes...`);

      // Step 3: Get show IDs for energy podcasts
      const energyShows = showsData.items
        .filter((item: any) => energyNames.includes(item.show.name))
        .map((item: any) => item.show);

      // Step 4: Fetch episodes from last 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const newEpisodeUris: string[] = [];

      for (const show of energyShows) {
        const epRes = await fetch(
          `https://api.spotify.com/v1/shows/${show.id}/episodes?limit=5&market=IN`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const epData = await epRes.json();
        for (const ep of epData.items || []) {
          if (!ep || !ep.release_date) continue;
          const releaseDate = new Date(ep.release_date).getTime();
          if (releaseDate >= sevenDaysAgo) {
            newEpisodeUris.push(ep.uri);
          }
        }
      }

      if (newEpisodeUris.length === 0) {
        setStatus("No new episodes in the last 7 days from your energy podcasts.");
        setLoading(false);
        return;
      }

      setStatus(`Found ${newEpisodeUris.length} new episodes. Creating playlist...`);

      // Step 5: Get Spotify user ID
      const userRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = await userRes.json();

      // Step 6: Find or create ⚡ Energy Pods playlist
      const playlistsRes = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const playlistsData = await playlistsRes.json();
      let playlist = playlistsData.items?.find((p: any) => p.name === "⚡ Energy Pods");

      if (!playlist) {
  const createRes = await fetch(`https://api.spotify.com/v1/users/${userData.id}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "⚡ Energy Pods",
      description: "Auto-updated energy podcast episodes by PodSort",
      public: false,
    }),
  });
  const createData = await createRes.json();
  playlist = createData;
  setStatus(`Playlist created: ${JSON.stringify(createData).substring(0, 100)}`);
  await new Promise(r => setTimeout(r, 3000));
}

      // Step 7: Add episodes to playlist
      await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: newEpisodeUris }),
      });

      setPlaylistUrl(`https://open.spotify.com/playlist/${playlist.id}`);
      setStatus(`✅ Done! Added ${newEpisodeUris.length} episodes to ⚡ Energy Pods`);
      setDone(true);
    } catch (err: any) {
      setError("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "600px", margin: "40px auto", fontFamily: "monospace", padding: "0 20px" }}>
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

      <button
        onClick={runPipeline}
        disabled={loading}
        style={{ marginTop: "16px", padding: "10px 24px", background: "#e8ff47", border: "none", fontWeight: "bold", cursor: "pointer" }}
      >
        {loading ? "Running..." : "⚡ Run PodSort"}
      </button>

      {status && <p style={{ color: "#aaa", marginTop: "10px" }}>{status}</p>}
      {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}

      {done && (
        <div style={{ marginTop: "20px", padding: "16px", background: "#1a1a1a", borderRadius: "8px" }}>
          <p style={{ color: "#1DB954" }}>⚡ Energy Pods playlist updated!</p>
          <a href={playlistUrl} target="_blank" rel="noreferrer" style={{ color: "#1DB954", fontWeight: "bold", fontSize: "1.1rem" }}>
            → Open ⚡ Energy Pods in Spotify
          </a>
        </div>
      )}
    </div>
  );
}
