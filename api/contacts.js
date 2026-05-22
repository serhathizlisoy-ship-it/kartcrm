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

  // GET - kişileri listele
  if (req.method === 'GET') {
    try {
      const contacts = await sql`
        SELECT 
          p.id, p.full_name, p.created_at,
          pc.title, pc.phone, pc.gsm, pc.fax, pc.email, pc.web,
          c.name as company_name, c.sector, c.address, c.id as company_id,
          m.category, m.notes, m.next_action, m.next_action_date,
          m.id as meeting_id, m.created_at as meeting_date
        FROM persons p
        LEFT JOIN person_companies pc ON pc.person_id = p.id
        LEFT JOIN companies c ON c.id = pc.company_id
        LEFT JOIN LATERAL (
          SELECT * FROM meetings 
          WHERE person_id = p.id 
          ORDER BY created_at DESC LIMIT 1
        ) m ON true
        WHERE p.user_id = ${user.userId}
        ORDER BY p.created_at DESC
      `;
      return res.status(200).json(contacts);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST - yeni kişi ekle
  if (req.method === 'POST') {
    const { full_name, company_name, title, phone, gsm, fax, email, web, address, sector, notes, category, next_action, next_action_date } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Ad soyad gerekli' });

    try {
      // Kişiyi ekle
      const [person] = await sql`
        INSERT INTO persons (user_id, full_name)
        VALUES (${user.userId}, ${full_name})
        RETURNING id
      `;

      // Firmayı ekle
      let companyId = null;
      if (company_name) {
        const [company] = await sql`
          INSERT INTO companies (user_id, name, sector, address, website)
          VALUES (${user.userId}, ${company_name}, ${sector || ''}, ${address || ''}, ${web || ''})
          RETURNING id
        `;
        companyId = company.id;

        // Kişi-firma ilişkisi
        await sql`
          INSERT INTO person_companies (person_id, company_id, title, phone, gsm, fax, email, is_primary)
          VALUES (${person.id}, ${companyId}, ${title || ''}, ${phone || ''}, ${gsm || ''}, ${fax || ''}, ${email || ''}, true)
        `;
      }

      // Görüşme notu ekle
      if (notes || category) {
        await sql`
          INSERT INTO meetings (user_id, person_id, company_id, category, notes, next_action, next_action_date)
          VALUES (${user.userId}, ${person.id}, ${companyId}, ${category || ''}, ${notes || ''}, ${next_action || ''}, ${next_action_date || null})
        `;

        // Hatırlatma ekle
        if (next_action_date) {
          await sql`
            INSERT INTO reminders (user_id, person_id, reminder_date, message)
            VALUES (${user.userId}, ${person.id}, ${next_action_date}, ${`${full_name} için hatırlatma: ${next_action || notes}`})
          `;
        }
      }

      return res.status(200).json({ id: person.id, full_name });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE - kişiyi sil
  if (req.method === 'DELETE') {
    const { id } = req.query;
    try {
      await sql`DELETE FROM persons WHERE id = ${id} AND user_id = ${user.userId}`;
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
