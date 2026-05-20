export default async function handler(req, res) {
  const appId = process.env.CLOUDFLARE_CALLS_APP_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!appId || !apiToken) {
    return res.status(500).json({ error: "Cloudflare credentials not configured" });
  }

  // Get the path from the query (e.g. [...path])
  const queryPath = req.query.path || [];
  const apiPath = Array.isArray(queryPath) ? queryPath.join('/') : queryPath;
  const url = `https://rtc.live.cloudflare.com/v1/apps/${appId}/${apiPath}`;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' && req.body ? JSON.stringify(req.body) : undefined
    });

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Cloudflare API error:", error);
    res.status(500).json({ error: "Failed to communicate with Cloudflare Realtime API" });
  }
}
