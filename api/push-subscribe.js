import { neon } from '@neondatabase/serverless';
import { jwtVerify } from 'jose';

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch { return null; }
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Giris gerekli' });
  const sql = neon(process.env.DATABASE_URL);

  // VAPID public key'i frontend'e ver (subscribe oncesi gerek)
  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
  }

  if (req.method === 'POST') {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'subscription gerekli' });
    }
    try {
      // Ayni endpoint varsa update, yoksa insert
      await sql`
        INSERT INTO push_tokens (user_id, endpoint, subscription)
        VALUES (${user.userId}, ${subscription.endpoint}, ${JSON.stringify(subscription)})
        ON CONFLICT (endpoint) DO UPDATE
        SET subscription = ${JSON.stringify(subscription)},
            user_id = ${user.userId}
      `;
      return res.status(200).json({ success: true });
    } catch (e) {
      // ON CONFLICT calismadiysa (unique constraint yoksa) fallback
      try {
        const existing = await sql`SELECT id FROM push_tokens WHERE endpoint = ${subscription.endpoint}`;
        if (existing.length > 0) {
          await sql`UPDATE push_tokens SET subscription = ${JSON.stringify(subscription)}, user_id = ${user.userId} WHERE endpoint = ${subscription.endpoint}`;
        } else {
          await sql`INSERT INTO push_tokens (user_id, endpoint, subscription) VALUES (${user.userId}, ${subscription.endpoint}, ${JSON.stringify(subscription)})`;
        }
        return res.status(200).json({ success: true });
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint gerekli' });
    try {
      await sql`DELETE FROM push_tokens WHERE endpoint = ${endpoint} AND user_id = ${user.userId}`;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
