export default async function handler(req, res) {
  res.status(501).json({ error: "Cloudflare Calls integration removed as requested." });
}
