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
  if (!user) return res.status(401).json({ error: 'Giris gerekli' });
  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    const { person_id } = req.query;
    if (!person_id) return res.status(400).json({ error: 'person_id gerekli' });
    const targetId = await resolveTargetUserId(sql, user.userId, req.query.member_id);
    if (!targetId) return res.status(403).json({ error: 'Yetki yok' });
    try {
      const rows = await sql`
        SELECT m.*,
          m.user_company_ids,
          (
            SELECT json_agg(json_build_object('id', uc.id, 'company_name', uc.company_name, 'title', uc.title))
            FROM user_companies uc
            WHERE uc.id::text = ANY(
              SELECT jsonb_array_elements_text(m.user_company_ids)
            )
          ) as user_companies_data
        FROM meetings m
        WHERE m.person_id = ${person_id} AND m.user_id = ${targetId}
        ORDER BY m.created_at DESC
      `;
      return res.status(200).json(rows);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const {
      person_id, company_id, user_company_ids,
      category, city, notes,
      ai_summary, ai_actions, ai_reminders, ai_followup,
      next_action, next_action_date
    } = req.body;

    if (!person_id) return res.status(400).json({ error: 'person_id gerekli' });

    try {
      const ucIds = Array.isArray(user_company_ids) ? user_company_ids : (user_company_ids ? [user_company_ids] : []);

      const [meeting] = await sql`
        INSERT INTO meetings (
          user_id, person_id, company_id, user_company_id, user_company_ids,
          category, notes, next_action, next_action_date,
          ai_summary, ai_actions, ai_reminders, ai_followup, city
        ) VALUES (
          ${user.userId}, ${person_id}, ${company_id || null}, 
          ${ucIds[0] || null}, ${JSON.stringify(ucIds)},
          ${category || ''}, ${notes || ''}, ${next_action || ''}, ${next_action_date || null},
          ${ai_summary || ''}, ${JSON.stringify(ai_actions || [])},
          ${JSON.stringify(ai_reminders || [])}, ${ai_followup || ''},
          ${city || ''}
        )
        RETURNING id
      `;

      if (ai_reminders && ai_reminders.length > 0) {
        for (const r of ai_reminders) {
          if (r.date) {
            await sql`
              INSERT INTO reminders (user_id, person_id, meeting_id, reminder_date, message)
              VALUES (${user.userId}, ${person_id}, ${meeting.id}, ${r.date}, ${r.text})
            `;
          }
        }
      }

      if (next_action_date && next_action) {
        await sql`
          INSERT INTO reminders (user_id, person_id, meeting_id, reminder_date, message)
          VALUES (${user.userId}, ${person_id}, ${meeting.id}, ${next_action_date}, ${next_action})
        `;
      }

      return res.status(200).json({ id: meeting.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id gerekli' });
    const targetId = await resolveTargetUserId(sql, user.userId, req.query.member_id);
    if (!targetId) return res.status(403).json({ error: 'Yetki yok' });
    const { ai_actions, ai_summary, ai_reminders } = req.body;
    try {
      // Mevcut kaydı al, sadece gönderilen alanları guncelle
      const [current] = await sql`
        SELECT ai_actions, ai_summary, ai_reminders FROM meetings
        WHERE id = ${id} AND user_id = ${targetId}
      `;
      if (!current) return res.status(404).json({ error: 'Bulunamadi' });

      const newActions = ai_actions !== undefined ? ai_actions : current.ai_actions;
      const newSummary = ai_summary !== undefined ? ai_summary : current.ai_summary;
      const newReminders = ai_reminders !== undefined ? ai_reminders : current.ai_reminders;

      await sql`
        UPDATE meetings
        SET ai_actions = ${JSON.stringify(newActions)},
            ai_summary = ${newSummary},
            ai_reminders = ${JSON.stringify(newReminders)}
        WHERE id = ${id} AND user_id = ${targetId}
      `;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    try {
      await sql`DELETE FROM meetings WHERE id = ${id} AND user_id = ${user.userId}`;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
