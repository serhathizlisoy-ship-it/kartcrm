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
    // Lider dogrulama: istek yapan, bir ekibin lideri olmali
    const [me] = await sql`SELECT team_id, role FROM users WHERE id = ${user.userId}`;
    if (!me || !me.team_id || me.role !== 'leader') {
      return res.status(403).json({ error: 'Yetki yok' });
    }
    const [team] = await sql`SELECT id FROM teams WHERE id = ${me.team_id} AND leader_user_id = ${user.userId}`;
    if (!team) return res.status(403).json({ error: 'Yetki yok' });
    const teamId = me.team_id;

    // Tarih araligi (varsayilan: bugun)
    const todayStr = new Date().toISOString().split('T')[0];
    const from = req.query.from || todayStr;
    const to = req.query.to || todayStr;
    const toExclusive = addDay(to);
    const tomorrowStr = addDay(todayStr);

    // Uyeler
    const members = await sql`
      SELECT id, full_name, email, role
      FROM users
      WHERE team_id = ${teamId}
      ORDER BY (role = 'leader') DESC, created_at ASC
    `;

    // Bugunku gorusmeler
    const mToday = await sql`
      SELECT m.user_id, COUNT(*)::int AS cnt
      FROM meetings m JOIN users u ON u.id = m.user_id
      WHERE u.team_id = ${teamId} AND m.created_at >= ${todayStr} AND m.created_at < ${tomorrowStr}
      GROUP BY m.user_id
    `;

    // Donemdeki gorusmeler
    const mRange = await sql`
      SELECT m.user_id, COUNT(*)::int AS cnt
      FROM meetings m JOIN users u ON u.id = m.user_id
      WHERE u.team_id = ${teamId} AND m.created_at >= ${from} AND m.created_at < ${toExclusive}
      GROUP BY m.user_id
    `;

    // Toplam gorusme (tum zamanlar)
    const mTotal = await sql`
      SELECT m.user_id, COUNT(*)::int AS cnt
      FROM meetings m JOIN users u ON u.id = m.user_id
      WHERE u.team_id = ${teamId}
      GROUP BY m.user_id
    `;

    // Bekleyen hatirlatmalar (bugun ve sonrasi, gonderilmemis)
    const rPending = await sql`
      SELECT r.user_id, COUNT(*)::int AS cnt
      FROM reminders r JOIN users u ON u.id = r.user_id
      WHERE u.team_id = ${teamId} AND r.is_sent = false AND r.reminder_date >= ${todayStr}
      GROUP BY r.user_id
    `;

    // Acik (tamamlanmamis) aksiyonlar — ai_actions JSONB dizisini ac
    const aOpen = await sql`
      SELECT m.user_id, COUNT(*)::int AS cnt
      FROM meetings m
      JOIN users u ON u.id = m.user_id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(m.ai_actions) = 'array' THEN m.ai_actions ELSE '[]'::jsonb END
      ) AS act
      WHERE u.team_id = ${teamId} AND COALESCE(act->>'done', 'false') <> 'true'
      GROUP BY m.user_id
    `;

    const toMap = (rows) => {
      const map = {};
      rows.forEach((r) => { map[r.user_id] = r.cnt; });
      return map;
    };
    const todayMap = toMap(mToday);
    const rangeMap = toMap(mRange);
    const totalMap = toMap(mTotal);
    const pendMap = toMap(rPending);
    const openMap = toMap(aOpen);

    const result = members.map((m) => ({
      id: m.id,
      full_name: m.full_name,
      email: m.email,
      role: m.role,
      meetings_today: todayMap[m.id] || 0,
      meetings_range: rangeMap[m.id] || 0,
      meetings_total: totalMap[m.id] || 0,
      pending_reminders: pendMap[m.id] || 0,
      open_actions: openMap[m.id] || 0
    }));

    const totals = result.reduce((acc, m) => {
      acc.meetings_today += m.meetings_today;
      acc.meetings_range += m.meetings_range;
      acc.meetings_total += m.meetings_total;
      acc.pending_reminders += m.pending_reminders;
      acc.open_actions += m.open_actions;
      return acc;
    }, { meetings_today: 0, meetings_range: 0, meetings_total: 0, pending_reminders: 0, open_actions: 0 });

    return res.status(200).json({ from, to, members: result, totals });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
