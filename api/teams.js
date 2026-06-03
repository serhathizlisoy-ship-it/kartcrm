import { neon } from '@neondatabase/serverless';
import { jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

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

// Karistirilmamis karakterlerden 6 haneli kod (O/0, I/1 gibi belirsizler yok)
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Giris gerekli' });
  const sql = neon(process.env.DATABASE_URL);

  // GET: mevcut kullanicinin ekip durumu (lider ise uye listesi + kod dahil)
  if (req.method === 'GET') {
    try {
      const [me] = await sql`SELECT team_id, role FROM users WHERE id = ${user.userId}`;
      if (!me || !me.team_id) {
        return res.status(200).json({ team: null });
      }
      const [team] = await sql`SELECT id, name, leader_user_id, join_code FROM teams WHERE id = ${me.team_id}`;
      if (!team) {
        return res.status(200).json({ team: null });
      }
      const isLeader = me.role === 'leader';
      let members = [];
      if (isLeader) {
        members = await sql`
          SELECT id, full_name, email, role
          FROM users
          WHERE team_id = ${team.id}
          ORDER BY (role = 'leader') DESC, created_at ASC
        `;
      }
      return res.status(200).json({
        team: {
          id: team.id,
          name: team.name,
          role: me.role,
          isLeader: isLeader,
          join_code: isLeader ? team.join_code : null,
          members: members
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST: action=create (ekip kur) veya action=join (koda katil)
  if (req.method === 'POST') {
    const { action, name, code, password } = req.body || {};

    // action=delete_account: hesabi ve tum veriyi kalici sil (KVKK silme hakki)
    if (action === 'delete_account') {
      if (!password) return res.status(400).json({ error: 'Şifre gerekli' });
      try {
        const [me] = await sql`SELECT id, email, password_hash, team_id, role FROM users WHERE id = ${user.userId}`;
        if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

        const valid = await bcrypt.compare(password, me.password_hash);
        if (!valid) return res.status(401).json({ error: 'Şifre hatalı' });

        // Lider ve ekipte baska uye varsa silmeyi engelle
        let leaderWithMembers = false;
        if (me.role === 'leader' && me.team_id) {
          const [{ cnt }] = await sql`SELECT COUNT(*)::int AS cnt FROM users WHERE team_id = ${me.team_id} AND id != ${me.id}`;
          if (cnt > 0) leaderWithMembers = true;
        }
        if (leaderWithMembers) {
          return res.status(400).json({ error: 'Ekipte üyeler var. Önce tüm üyeleri çıkarın, sonra hesabınızı silebilirsiniz.' });
        }

        const uid = me.id;
        // Cocuk -> ebeveyn sirasiyla sil
        await sql`DELETE FROM reminders WHERE user_id = ${uid}`;
        await sql`DELETE FROM meetings WHERE user_id = ${uid}`;
        await sql`DELETE FROM person_companies WHERE person_id IN (SELECT id FROM persons WHERE user_id = ${uid})`;
        await sql`DELETE FROM persons WHERE user_id = ${uid}`;
        await sql`DELETE FROM companies WHERE user_id = ${uid}`;
        await sql`DELETE FROM user_companies WHERE user_id = ${uid}`;
        await sql`DELETE FROM push_tokens WHERE user_id = ${uid}`;
        await sql`DELETE FROM rate_limits WHERE rl_key = ${String(uid)} OR rl_key = ${'login:' + String(me.email).toLowerCase()}`;
        // Lider ve uye yoksa ekibi de sil (once baglari kopar -> FK guvenligi)
        if (me.role === 'leader' && me.team_id) {
          await sql`UPDATE users SET team_id = NULL, role = NULL WHERE id = ${uid}`;
          await sql`DELETE FROM teams WHERE id = ${me.team_id}`;
        }
        await sql`DELETE FROM users WHERE id = ${uid}`;

        return res.status(200).json({ success: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // Zaten bir ekipte mi? (cift kayit engeli)
    const [me] = await sql`SELECT team_id FROM users WHERE id = ${user.userId}`;
    if (me && me.team_id) {
      return res.status(400).json({ error: 'Zaten bir ekiptesin' });
    }

    if (action === 'create') {
      if (!name) return res.status(400).json({ error: 'Ekip adi gerekli' });
      try {
        // benzersiz kod uret (cakisirsa tekrar dene)
        let joinCode = generateJoinCode();
        for (let i = 0; i < 5; i++) {
          const existing = await sql`SELECT id FROM teams WHERE join_code = ${joinCode}`;
          if (existing.length === 0) break;
          joinCode = generateJoinCode();
        }
        const [team] = await sql`
          INSERT INTO teams (name, leader_user_id, join_code)
          VALUES (${name}, ${user.userId}, ${joinCode})
          RETURNING id, name, join_code
        `;
        await sql`UPDATE users SET team_id = ${team.id}, role = 'leader' WHERE id = ${user.userId}`;
        return res.status(200).json({
          success: true,
          team: { id: team.id, name: team.name, role: 'leader', isLeader: true, join_code: team.join_code, members: [] }
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    if (action === 'join') {
      if (!code) return res.status(400).json({ error: 'Kod gerekli' });
      try {
        const [team] = await sql`SELECT id, name FROM teams WHERE join_code = ${String(code).toUpperCase().trim()}`;
        if (!team) return res.status(404).json({ error: 'Kod bulunamadi' });
        await sql`UPDATE users SET team_id = ${team.id}, role = 'member' WHERE id = ${user.userId}`;
        return res.status(200).json({
          success: true,
          team: { id: team.id, name: team.name, role: 'member', isLeader: false, join_code: null, members: [] }
        });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'Gecersiz islem' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
