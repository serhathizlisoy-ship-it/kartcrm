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
  if (!user) return res.status(401).json({ error: 'Giris gerekli' });
  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM user_companies WHERE user_id = ${user.userId} ORDER BY is_default DESC, created_at ASC`;
      return res.status(200).json(rows);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { company_name, title, is_default } = req.body;
    if (!company_name) return res.status(400).json({ error: 'Şirket adı gerekli' });
    try {
      if (is_default) {
        await sql`UPDATE user_companies SET is_default = false WHERE user_id = ${user.userId}`;
      }
      const [row] = await sql`INSERT INTO user_companies (user_id, company_name, title, is_default) VALUES (${user.userId}, ${company_name}, ${title||''}, ${is_default||false}) RETURNING *`;
      return res.status(200).json(row);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    try {
      await sql`DELETE FROM user_companies WHERE id = ${id} AND user_id = ${user.userId}`;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}