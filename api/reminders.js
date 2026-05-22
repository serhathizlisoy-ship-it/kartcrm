import { neon } from '@neondatabase/serverless';
import { jwtVerify } from 'jose';

async function getUser(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'kartcrm-secret-2024');
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch { return null; }
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Giriş gerekli' });

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const reminders = await sql`
        SELECT r.*, p.full_name
        FROM reminders r
        LEFT JOIN persons p ON p.id = r.person_id
        WHERE r.user_id = ${user.userId}
        AND r.reminder_date <= ${today}
        AND r.is_sent = false
        ORDER BY r.reminder_date ASC
      `;
      return res.status(200).json(reminders);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
