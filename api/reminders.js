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

// member_id verilmisse, istek yapanin o uyenin LIDERI oldugunu dogrular.
// Dogruysa hedef uyenin id'sini, degilse null (yetki yok) doner.
// member_id yoksa istek yapanin kendi id'si doner.
async function resolveTargetUserId(sql, requesterId, memberId) {
  if (!memberId || String(memberId) === String(requesterId)) return requesterId;
  const rows = await sql`
    SELECT u.id
    FROM users u
    JOIN teams t ON t.id = u.team_id
    WHERE u.id = ${memberId} AND t.leader_user_id = ${requesterId}
  `;
  return rows.length > 0 ? memberId : null;
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Giriş gerekli' });

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    const targetId = await resolveTargetUserId(sql, user.userId, req.query.member_id);
    if (!targetId) return res.status(403).json({ error: 'Yetki yok' });
    const { meeting_id } = req.query;
    try {
      if (meeting_id) {
        // Belirli bir gorusmenin hatirlatmalari (duzenleme icin; tarih filtresi yok)
        const rows = await sql`
          SELECT r.*, p.full_name
          FROM reminders r
          LEFT JOIN persons p ON p.id = r.person_id
          WHERE r.meeting_id = ${meeting_id}
          AND r.user_id = ${targetId}
          AND r.is_sent = false
          ORDER BY r.reminder_date ASC
        `;
        return res.status(200).json(rows);
      }
      const today = new Date().toISOString().split('T')[0];
      const reminders = await sql`
        SELECT r.*, p.full_name
        FROM reminders r
        LEFT JOIN persons p ON p.id = r.person_id
        WHERE r.user_id = ${targetId}
        AND r.reminder_date >= ${today}
        AND r.is_sent = false
        ORDER BY r.reminder_date ASC
      `;
      return res.status(200).json(reminders);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id gerekli' });
    const targetId = await resolveTargetUserId(sql, user.userId, req.query.member_id);
    if (!targetId) return res.status(403).json({ error: 'Yetki yok' });
    const { reminder_date, message, reminder_time } = req.body || {};
    try {
      // Duzenleme: tarih, metin ve/veya saat gonderildiyse guncelle
      if (reminder_date !== undefined || message !== undefined || reminder_time !== undefined) {
        const [current] = await sql`
          SELECT reminder_date, message, reminder_time FROM reminders
          WHERE id = ${id} AND user_id = ${targetId}
        `;
        if (!current) return res.status(404).json({ error: 'Bulunamadi' });
        const newDate = reminder_date !== undefined ? reminder_date : current.reminder_date;
        const newMsg = message !== undefined ? message : current.message;
        // reminder_time gonderildiyse: dolu ise set et, bos string/null ise NULL yap
        const newTime = reminder_time !== undefined ? (reminder_time || null) : current.reminder_time;
        await sql`
          UPDATE reminders SET reminder_date = ${newDate}, message = ${newMsg}, reminder_time = ${newTime}
          WHERE id = ${id} AND user_id = ${targetId}
        `;
        return res.status(200).json({ success: true });
      }
      // Bos govde = tamamla (mevcut ana ekran ✓ butonu davranisi korunur)
      await sql`
        UPDATE reminders SET is_sent = true
        WHERE id = ${id} AND user_id = ${targetId}
      `;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id gerekli' });
    const targetId = await resolveTargetUserId(sql, user.userId, req.query.member_id);
    if (!targetId) return res.status(403).json({ error: 'Yetki yok' });
    try {
      await sql`DELETE FROM reminders WHERE id = ${id} AND user_id = ${targetId}`;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
