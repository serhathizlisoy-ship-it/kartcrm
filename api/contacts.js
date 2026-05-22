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
      // Kişileri getir
      const contacts = await sql`
        SELECT 
          p.id, p.full_name, p.created_at,
          pc.title, pc.phone, pc.gsm, pc.fax, pc.email,
          c.website as web, c.name as company_name, c.sector, c.address, c.id as company_id,
          m.category, m.notes, m.next_action, m.next_action_date,
          m.user_company_ids
        FROM persons p
        LEFT JOIN person_companies pc ON pc.person_id = p.id AND pc.is_primary = true
        LEFT JOIN companies c ON c.id = pc.company_id
        LEFT JOIN meetings m ON m.id = (
          SELECT id FROM meetings WHERE person_id = p.id ORDER BY created_at DESC LIMIT 1
        )
        WHERE p.user_id = ${user.userId}
        ORDER BY p.created_at DESC
      `;

      // Kullanıcı şirketlerini getir
      const userCompanies = await sql`
        SELECT id, company_name, title, is_default
        FROM user_companies
        WHERE user_id = ${user.userId}
        ORDER BY is_default DESC, created_at ASC
      `;

      return res.status(200).json({ contacts, userCompanies });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { full_name, company_name, title, phone, gsm, fax, email, web, address, sector } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Ad soyad gerekli' });
    try {
      const [person] = await sql`
        INSERT INTO persons (user_id, full_name)
        VALUES (${user.userId}, ${full_name})
        RETURNING id
      `;

      let companyId = null;
      if (company_name) {
        const [company] = await sql`
          INSERT INTO companies (user_id, name, sector, address, website)
          VALUES (${user.userId}, ${company_name}, ${sector||''}, ${address||''}, ${web||''})
          RETURNING id
        `;
        companyId = company.id;
        await sql`
          INSERT INTO person_companies (person_id, company_id, title, phone, gsm, fax, email, is_primary)
          VALUES (${person.id}, ${companyId}, ${title||''}, ${phone||''}, ${gsm||''}, ${fax||''}, ${email||''}, true)
        `;
      }

      return res.status(200).json({ id: person.id, full_name, company_id: companyId });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    const { full_name, company_name, title, phone, gsm, fax, email, web, address, sector } = req.body;
    try {
      if (full_name) {
        await sql`UPDATE persons SET full_name = ${full_name} WHERE id = ${id} AND user_id = ${user.userId}`;
      }
      const existing = await sql`SELECT id FROM person_companies WHERE person_id = ${id} AND is_primary = true LIMIT 1`;
      if (existing.length > 0) {
        await sql`UPDATE person_companies SET title=${title||''}, phone=${phone||''}, gsm=${gsm||''}, fax=${fax||''}, email=${email||''} WHERE person_id = ${id} AND is_primary = true`;
        if (company_name) {
          const [pc] = await sql`SELECT company_id FROM person_companies WHERE person_id = ${id} AND is_primary = true LIMIT 1`;
          if (pc) await sql`UPDATE companies SET name=${company_name}, sector=${sector||''}, address=${address||''}, website=${web||''} WHERE id = ${pc.company_id}`;
        }
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

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
