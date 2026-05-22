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
      const persons = await sql`SELECT id, full_name, created_at FROM persons WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
      const result = [];
      for (const p of persons) {
        const [pc] = await sql`SELECT pc.title, pc.phone, pc.gsm, pc.fax, pc.email, pc.web, c.name as company_name, c.sector, c.address FROM person_companies pc JOIN companies c ON c.id = pc.company_id WHERE pc.person_id = ${p.id} AND pc.is_primary = true LIMIT 1`;
        const [m] = await sql`SELECT category, notes, next_action, next_action_date FROM meetings WHERE person_id = ${p.id} ORDER BY created_at DESC LIMIT 1`;
        result.push({ ...p, ...(pc || {}), ...(m || {}) });
      }
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { full_name, company_name, title, phone, gsm, fax, email, web, address, sector, notes, category, next_action, next_action_date } = req.body;
    if (!full_name) return res.status(40



$content = @'
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
      const persons = await sql`SELECT id, full_name, created_at FROM persons WHERE user_id = ${user.userId} ORDER BY created_at DESC`;
      const result = [];
      for (const p of persons) {
        const [pc] = await sql`SELECT pc.title, pc.phone, pc.gsm, pc.fax, pc.email, c.website as web, c.name as company_name, c.sector, c.address FROM person_companies pc JOIN companies c ON c.id = pc.company_id WHERE pc.person_id = ${p.id} AND pc.is_primary = true LIMIT 1`;
        const [m] = await sql`SELECT category, notes, next_action, next_action_date FROM meetings WHERE person_id = ${p.id} ORDER BY created_at DESC LIMIT 1`;
        result.push({ ...p, ...(pc || {}), ...(m || {}) });
      }
      return res.status(200).json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { full_name, company_name, title, phone, gsm, fax, email, web, address, sector, notes, category, next_action, next_action_date } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Ad soyad gerekli' });
    try {
      const [person] = await sql`INSERT INTO persons (user_id, full_name) VALUES (${user.userId}, ${full_name}) RETURNING id`;
      let companyId = null;
      if (company_name) {
        const [company] = await sql`INSERT INTO companies (user_id, name, sector, address, website) VALUES (${user.userId}, ${company_name}, ${sector||''}, ${address||''}, ${web||''}) RETURNING id`;
        companyId = company.id;
        await sql`INSERT INTO person_companies (person_id, company_id, title, phone, gsm, fax, email, is_primary) VALUES (${person.id}, ${companyId}, ${title||''}, ${phone||''}, ${gsm||''}, ${fax||''}, ${email||''}, true)`;
      }
      if (notes || category || next_action) {
        await sql`INSERT INTO meetings (user_id, person_id, company_id, category, notes, next_action, next_action_date) VALUES (${user.userId}, ${person.id}, ${companyId}, ${category||''}, ${notes||''}, ${next_action||''}, ${next_action_date||null})`;
        if (next_action_date) {
          await sql`INSERT INTO reminders (user_id, person_id, reminder_date, message) VALUES (${user.userId}, ${person.id}, ${next_action_date}, ${full_name + ': ' + (next_action||notes)})`;
        }
      }
      return res.status(200).json({ id: person.id, full_name });
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
