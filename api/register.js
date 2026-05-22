import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email ve şifre gerekli' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) return res.status(400).json({ error: 'Bu email zaten kayıtlı' });

    const hash = await bcrypt.hash(password, 10);
    const [user] = await sql`
      INSERT INTO users (email, full_name, password_hash)
      VALUES (${email}, ${full_name || ''}, ${hash})
      RETURNING id, email, full_name
    `;

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'kartcrm-secret-2024');
    const token = await new SignJWT({ userId: user.id, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(secret);

    return res.status(200).json({ token, user });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
