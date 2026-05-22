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

  // GET - kişinin görüşmelerini listele
  if (req.method === 'GET') {
    const { person_id } = req.query;
    if (!person_id) return res.status(400).json({ error: 'person_id gerekli' });
    try {
      const rows = await sql`
        SELECT m.*, 
          uc.company_name as user_company_name,
          uc.title as user_company_title
        FROM meetings m
        LEFT JOIN user_companies uc ON uc.id = m.user_company_id
        WHERE m.person_id = ${person_id} AND m.user_id = ${user.userId}
        ORDER BY m.created_at DESC
      `;
      return res.status(200).json(rows);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST - yeni görüşme ekle (AI özeti dahil)
  if (req.method === 'POST') {
    const {
      person_id, company_id, user_company_id,
      category, city, notes,
      ai_summary, ai_actions, ai_reminders, ai_followup,
      next_action, next_action_date
    } = req.body;

    if (!person_id) return res.status(400).json({ error: 'person_id gerekli' });

    try {
      const [meeting] = await sql`
        INSERT INTO meetings (
          user_id, person_id, company_id, user_company_id,
          category, notes, next_action, next_action_date,
          ai_summary, ai_actions, ai_reminders, ai_followup, city
        ) VALUES (
          ${user.userId}, ${person_id}, ${company_id || null}, ${user_company_id || null},
          ${category || ''}, ${notes || ''}, ${next_action || ''}, ${next_action_date || null},
          ${ai_summary || ''}, ${JSON.stringify(ai_actions || [])}, 
          ${JSON.stringify(ai_reminders || [])}, ${ai_followup || ''},
          ${city || ''}
        )
        RETURNING id
      `;

      // Hatırlatmaları kaydet
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

      // next_action_date varsa hatırlatma ekle
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

  // DELETE
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
