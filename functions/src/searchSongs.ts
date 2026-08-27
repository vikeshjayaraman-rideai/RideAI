import {onRequest} from "firebase-functions/v2/https";

export const searchSongs = onRequest(
  {region: "asia-southeast1"},
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const query = String(req.body?.query || req.query?.query || "tamil melody");
    const count = parseInt(String(req.body?.count || req.query?.count || "10"), 10);
    // Random page (1-5) for variety on each call
    const page = parseInt(String(req.query?.page || "1"), 10) || Math.floor(Math.random() * 5) + 1;

    const endpoint =
      `https://api-jio-saavan.vercel.app/api/search/songs` +
      `?query=${encodeURIComponent(query)}&limit=${count}&page=${page}`;

    try {
      console.log("JioSaavn:", query, "page:", page);
      const response = await fetch(endpoint, {
        headers: {"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
      });
      const text = await response.text();
      if (!response.ok) {
        res.status(502).json({success: false, songs: [], message: text.substring(0, 200)});
        return;
      }
      let data: any;
      try { data = JSON.parse(text); } catch {
        res.status(500).json({success: false, songs: [], raw: text.substring(0, 200)});
        return;
      }

      const results = data?.data?.results || data?.results || data?.songs || [];

      const decodeHtml = (str: string) => (str || "")
        .replace(/&quot;/g, "\"").replace(/&amp;/g, "&")
        .replace(/&#039;/g, "'").trim();

      // Deduplicate by title
      const seen = new Set<string>();
      const songs = results
        .map((s: any) => {
          const urls: any[] = s.downloadUrl || [];
          const best =
            urls.find((u) => u.quality === "320kbps") ||
            urls.find((u) => u.quality === "160kbps") ||
            urls.find((u) => u.quality === "96kbps") ||
            urls[urls.length - 1];
          const imgArr = Array.isArray(s.image) ? s.image : [];
          const artwork =
            imgArr.find((i: any) => i.quality === "500x500")?.url ||
            imgArr[imgArr.length - 1]?.url || "";
          const artists = s.artists?.primary || [];
          const artistName = Array.isArray(artists)
            ? artists.map((a: any) => a.name).filter(Boolean).join(", ")
            : (s.primaryArtists || s.primary_artists || "Unknown");
          return {
            id: s.id || "",
            url: best?.url || "",
            title: decodeHtml(s.name || s.title || "Unknown"),
            artist: decodeHtml(artistName),
            artwork,
            duration: Number(s.duration || 0),
            language: s.language || "",
          };
        })
        .filter((s: any) => {
          if (!s.url || s.duration < 60 || s.duration > 480) return false;
          const key = s.title.toLowerCase().replace(/\s+/g, "");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      console.log(`Found ${songs.length} unique songs (page ${page})`);
      res.json({success: true, songs: songs.slice(0, count)});
    } catch (error) {
      res.status(500).json({
        success: false, songs: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);