import crypto from "node:crypto";

function verifySession(token) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(body)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export default function handler(req, res) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("opm_admin_session="));

  const token = cookie ? cookie.slice("opm_admin_session=".length) : null;
  const session = verifySession(token);

  if (!session) return res.status(401).json({ authenticated: false });
  return res.status(200).json({ authenticated: true, username: session.sub });
}

