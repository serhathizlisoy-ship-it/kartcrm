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
    const type = req.query.type || 'summary';

    // ---------- TYPE: SELF (kullanicinin kendi verisi — lider kontrolu yok) ----------
    if (type === 'self') {
      const uid = user.userId;
      const contacts = await sql`
        SELECT p.full_name AS person_name, c.name AS company_name, pc.title,
               pc.phone, pc.gsm, pc.fax, pc.email, c.website AS web, c.sector
        FROM persons p
        LEFT JOIN person_companies pc ON pc.person_id = p.id AND pc.is_primary = true
        LEFT JOIN companies c ON c.id = pc.company_id
        WHERE p.user_id = ${uid}
        ORDER BY p.full_name`;
      const meetings = await sql`
        SELECT m.id, m.created_at, m.city, m.category, m.ai_summary, m.notes, m.ai_actions,
               p.full_name AS person_name,
               (
                 SELECT json_agg(uc.company_name)
                 FROM user_companies uc
                 WHERE uc.id::text = ANY(SELECT jsonb_array_elements_text(m.user_company_ids))
               ) AS role_companies
        FROM meetings m
        LEFT JOIN persons p ON p.id = m.person_id
        WHERE m.user_id = ${uid}
        ORDER BY m.created_at DESC`;
      const reminders = await sql`
        SELECT p.full_name AS person_name, r.reminder_date, r.reminder_time, r.message, r.is_sent
        FROM reminders r
        LEFT JOIN persons p ON p.id = r.person_id
        WHERE r.user_id = ${uid}
        ORDER BY r.reminder_date`;
      return res.status(200).json({ contacts, meetings, reminders });
    }

    // ---------- TYPE: ADMIN (sadece ilk/kurucu kullanici) ----------
    if (type === 'admin') {
      const [first] = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`;
      if (!first || String(first.id) !== String(user.userId)) {
        return res.status(403).json({ error: 'Yetki yok' });
      }

      const nowIso = new Date().toISOString();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [counts] = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM persons) AS persons,
          (SELECT COUNT(*)::int FROM meetings) AS meetings,
          (SELECT COUNT(*)::int FROM reminders WHERE is_sent = false) AS pending_reminders
      `;

      // AI/OCR kullanimi (rate_limits tablosundan, action='ai_ocr')
      const [usage] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ${dayAgo})::int AS today,
          COUNT(*) FILTER (WHERE created_at >= ${weekAgo})::int AS week,
          COUNT(*)::int AS total_30d
        FROM rate_limits
        WHERE action = 'ai_ocr' AND created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}
      `;

      // Son hatalar (error_logs varsa)
      let errors = [];
      let creditWarning = false;
      try {
        errors = await sql`
          SELECT endpoint, status, message, created_at
          FROM error_logs
          ORDER BY created_at DESC
          LIMIT 25
        `;
        creditWarning = errors.some(function (e) {
          const m = (e.message || '').toLowerCase();
          return m.includes('credit') || m.includes('balance') || m.includes('insufficient') || m.includes('quota');
        });
      } catch (e) {
        errors = [];
      }

      return res.status(200).json({
        isAdmin: true,
        stats: counts || {},
        usage: usage || {},
        errors: errors,
        creditWarning: creditWarning,
        generatedAt: nowIso
      });
    }

    // Lider dogrulama (summary ve export tipleri icin)
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

    // Uyeler (her iki tip icin)
    const members = await sql`
      SELECT id, full_name, email, role
      FROM users
      WHERE team_id = ${teamId}
      ORDER BY (role = 'leader') DESC, created_at ASC
    `;

    // ---------- TYPE: SUMMARY (lider panosu sayilari) ----------
    if (type === 'summary') {
      const tomorrowStr = addDay(todayStr);

      const mToday = await sql`
        SELECT m.user_id, COUNT(*)::int AS cnt
        FROM meetings m JOIN users u ON u.id = m.user_id
        WHERE u.team_id = ${teamId} AND m.created_at >= ${todayStr} AND m.created_at < ${tomorrowStr}
        GROUP BY m.user_id`;
      const mRange = await sql`
        SELECT m.user_id, COUNT(*)::int AS cnt
        FROM meetings m JOIN users u ON u.id = m.user_id
        WHERE u.team_id = ${teamId} AND m.created_at >= ${from} AND m.created_at < ${toExclusive}
        GROUP BY m.user_id`;
      const mTotal = await sql`
        SELECT m.user_id, COUNT(*)::int AS cnt
        FROM meetings m JOIN users u ON u.id = m.user_id
        WHERE u.team_id = ${teamId}
        GROUP BY m.user_id`;
      const rPending = await sql`
        SELECT r.user_id, COUNT(*)::int AS cnt
        FROM reminders r JOIN users u ON u.id = r.user_id
        WHERE u.team_id = ${teamId} AND r.is_sent = false AND r.reminder_date >= ${todayStr}
        GROUP BY r.user_id`;
      const aOpen = await sql`
        SELECT m.user_id, COUNT(*)::int AS cnt
        FROM meetings m
        JOIN users u ON u.id = m.user_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(m.ai_actions) = 'array' THEN m.ai_actions ELSE '[]'::jsonb END
        ) AS act
        WHERE u.team_id = ${teamId} AND COALESCE(act->>'done', 'false') <> 'true'
        GROUP BY m.user_id`;

      const toMap = (rows) => { const map = {}; rows.forEach((r) => { map[r.user_id] = r.cnt; }); return map; };
      const todayMap = toMap(mToday);
      const rangeMap = toMap(mRange);
      const totalMap = toMap(mTotal);
      const pendMap = toMap(rPending);
      const openMap = toMap(aOpen);

      const result = members.map((m) => ({
        id: m.id, full_name: m.full_name, email: m.email, role: m.role,
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
    }

    // ---------- TYPE: EXPORT (excel ham veri) ----------
    if (type === 'export') {
      const contacts = await sql`
        SELECT u.full_name AS member_name, p.full_name AS person_name,
               c.name AS company_name, pc.title, pc.phone, pc.gsm, pc.fax, pc.email,
               c.website AS web, c.sector
        FROM persons p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN person_companies pc ON pc.person_id = p.id AND pc.is_primary = true
        LEFT JOIN companies c ON c.id = pc.company_id
        WHERE u.team_id = ${teamId}
        ORDER BY u.full_name, p.full_name`;

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
        ORDER BY u.full_name, m.created_at DESC`;

      const reminders = await sql`
        SELECT u.full_name AS member_name, p.full_name AS person_name,
               r.reminder_date, r.reminder_time, r.message, r.is_sent
        FROM reminders r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN persons p ON p.id = r.person_id
        JOIN meetings m ON m.id = r.meeting_id
        WHERE u.team_id = ${teamId} AND m.created_at >= ${from} AND m.created_at < ${toExclusive}
        ORDER BY u.full_name, r.reminder_date`;

      return res.status(200).json({
        team_name: team.name, from, to, members, contacts, meetings, reminders
      });
    }

    return res.status(400).json({ error: 'Gecersiz type' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
