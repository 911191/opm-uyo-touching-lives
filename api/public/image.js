function allowedHost(hostname) {
  const h = hostname.toLowerCase();
  return h === 'ibb.co' || h === 'www.ibb.co' || h === 'i.ibb.co' || h === 'imgbb.com' || h === 'www.imgbb.com';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const raw = typeof req.query?.url === 'string' ? req.query.url : '';
  let target;
  try { target = new URL(raw); } catch { return res.status(400).send('Invalid image URL'); }
  if (target.protocol !== 'https:' || !allowedHost(target.hostname)) return res.status(403).send('Image host not allowed');

  try {
    const r = await fetch(target.toString(), { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(r.status).send('Unable to fetch image');
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('image/')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.setHeader('Content-Type', ct);
      const buf = Buffer.from(await r.arrayBuffer());
      return res.status(200).send(buf);
    }
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return res.status(404).send('Direct image could not be found');
    const imageUrl = new URL(m[1], r.url);
    if (!allowedHost(imageUrl.hostname) || imageUrl.protocol !== 'https:') return res.status(403).send('Image host not allowed');
    return res.redirect(302, imageUrl.toString());
  } catch (e) {
    console.error('Public image proxy error:', e);
    return res.status(502).send('Unable to load image');
  }
}
