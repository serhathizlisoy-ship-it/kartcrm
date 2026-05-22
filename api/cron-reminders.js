import { neon } from '@neondatabase/serverless';
import webpush from 'web-push';

export default async function handler(req, res) {
  // Vercel cron veya manuel test icin kontrol
  // (Production'da Vercel kendi Authorization header'i ekler ama Hobby'de optional)
  const sql = neon(process.env.DATABASE_URL);

  // VAPID ayarla
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:no-reply@kartcrm.app';

  if (!vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'VAPID keyleri eksik' });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  try {
    const today = new Date().toISOString().split('T')[0];

    // Her kullanici icin bugun aktif hatirlatma sayisini cek
    const rows = await sql`
      SELECT user_id, COUNT(*) AS cnt
      FROM reminders
      WHERE is_sent = false
        AND reminder_date <= ${today}
      GROUP BY user_id
    `;

    if (rows.length === 0) {
      return res.status(200).json({ sent: 0, message: 'Bugun hatirlatma yok' });
    }

    let sent = 0;
    let failed = 0;
    let removed = 0;

    for (const row of rows) {
      const userId = row.user_id;
      const cnt = Number(row.cnt);
      if (!cnt) continue;

      // Kullanicinin tum push subscription'larini al
      const subs = await sql`
        SELECT id, endpoint, subscription FROM push_tokens WHERE user_id = ${userId}
      `;
      if (subs.length === 0) continue;

      const payload = JSON.stringify({
        title: 'KartCRM',
        body: 'Bugün ' + cnt + ' hatırlatman var',
        url: '/',
        tag: 'daily-summary-' + today
      });

      for (const s of subs) {
        let subObj = s.subscription;
        if (typeof subObj === 'string') {
          try { subObj = JSON.parse(subObj); } catch (e) { continue; }
        }
        try {
          await webpush.sendNotification(subObj, payload);
          sent++;
        } catch (err) {
          failed++;
          // 410 Gone veya 404 = subscription artik gecersiz, sil
          if (err.statusCode === 410 || err.statusCode === 404) {
            try {
              await sql`DELETE FROM push_tokens WHERE id = ${s.id}`;
              removed++;
            } catch (e) {}
          }
        }
      }
    }

    return res.status(200).json({ sent, failed, removed, users: rows.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
