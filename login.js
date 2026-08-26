import bcrypt from "bcryptjs";
import crypto from "node:crypto";

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function createSession(payload) {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(500).json({ error: "Admin authentication is not configured" });
  }

  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || username.length > 128 || password.length > 256) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const usernameCorrect = timingSafeEqualText(username, process.env.ADMIN_USERNAME);
  let passwordCorrect = false;
  try {
    passwordCorrect = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  } catch {
    passwordCorrect = false;
  }

  if (!usernameCorrect || !passwordCorrect) return res.status(401).json({ error: "Invalid username or password" });

  const now = Math.floor(Date.now() / 1000);
  const session = createSession({ sub: username, iat: now, exp: now + 60 * 60 * 8, jti: crypto.randomUUID() });

  res.setHeader("Set-Cookie", `opm_admin_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
  return res.status(200).json({ ok: true });
}
