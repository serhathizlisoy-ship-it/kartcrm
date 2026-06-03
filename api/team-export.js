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

function addDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Giris gerekli' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Lider dogrulama
    const [me] = await sql`SELECT team_id, role FROM users WHERE id = ${user.userId}`;
    if (!me || !me.team_id || me.role !== 'leader') {
      return res.status(403).json({ error: 'Yetki yok' });
    }
    const [team] = await sql`SELECT id, name FROM teams WHERE id = ${me.team_id} AND leader_user_id = ${user.userId}`;
    if (!team) return res.status(403).json({ error: 'Yetki yok' });
    const teamId = me.team_id;

    const todayStr = new Date().toISOString().split('T')[0];
    const from = req.query.from || todayStr;
    const to = req.query.to || todayStr;
    const toExclusive = addDay(to);

    // Uyeler
    const members = await sql`
      SELECT id, full_name, email, role
      FROM users
      WHERE team_id = ${teamId}
      ORDER BY (role = 'leader') DESC, created_at ASC
    `;

    // Tum kisiler (rehber — donemden bagimsiz)
    const contacts = await sql`
      SELECT u.full_name AS member_name, p.full_name AS person_name,
             c.name AS company_name, pc.title, pc.phone, pc.gsm, pc.fax, pc.email,
             c.website AS web, c.sector
      FROM persons p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN person_companies pc ON pc.person_id = p.id AND pc.is_primary = true
      LEFT JOIN companies c ON c.id = pc.company_id
      WHERE u.team_id = ${teamId}
      ORDER BY u.full_name, p.full_name
    `;

    // Donemdeki gorusmeler (aksiyonlar bunlardan turetilecek)
    const meetings = await sql`
      SELECT u.full_name AS member_name, m.id, m.created_at, m.city, m.category,
             m.ai_summary, m.notes, m.ai_actions, p.full_name AS person_name,
             (
               SELECT json_agg(uc.company_name)
               FROM user_companies uc
               WHERE uc.id::text = ANY(SELECT jsonb_array_elements_text(m.user_company_ids))
             ) AS role_companies
      FROM meetings m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN persons p ON p.id = m.person_id
      WHERE u.team_id = ${teamId} AND m.created_at >= ${from} AND m.created_at < ${toExclusive}
      ORDER BY u.full_name, m.created_at DESC
    `;

    // Donem gorusmelerine bagli hatirlatmalar
    const reminders = await sql`
      SELECT u.full_name AS member_name, p.full_name AS person_name,
             r.reminder_date, r.reminder_time, r.message, r.is_sent
      FROM reminders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN persons p ON p.id = r.person_id
      JOIN meetings m ON m.id = r.meeting_id
      WHERE u.team_id = ${teamId} AND m.created_at >= ${from} AND m.created_at < ${toExclusive}
      ORDER BY u.full_name, r.reminder_date
    `;

    return res.status(200).json({
      team_name: team.name,
      from, to,
      members,
      contacts,
      meetings,
      reminders
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
