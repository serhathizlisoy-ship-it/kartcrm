// Basit pencere-tabanli rate limit (Neon uzerinde).
// key: kimlik (user_id veya 'login:email'), action: 'ai_ocr' | 'login'
// perMinute / perDay: limitler (0 verilirse o pencere kontrol edilmez)
export async function checkRateLimit(sql, key, action, perMinute, perDay) {
  const now = Date.now();
  const minuteAgo = new Date(now - 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Bu anahtarin eski kayitlarini temizle (tablo sismesin)
    await sql`DELETE FROM rate_limits WHERE rl_key = ${key} AND action = ${action} AND created_at < ${dayAgo}`;

    const [row] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${minuteAgo})::int AS last_minute,
        COUNT(*)::int AS last_day
      FROM rate_limits
      WHERE rl_key = ${key} AND action = ${action} AND created_at >= ${dayAgo}
    `;
    const lastMinute = row ? row.last_minute : 0;
    const lastDay = row ? row.last_day : 0;

    if (perMinute && lastMinute >= perMinute) return { allowed: false, reason: 'minute' };
    if (perDay && lastDay >= perDay) return { allowed: false, reason: 'day' };

    await sql`INSERT INTO rate_limits (rl_key, action) VALUES (${key}, ${action})`;
    return { allowed: true };
  } catch (e) {
    // Rate limit altyapisi hata verirse istegi engelleme (servisi acik tut)
    return { allowed: true, error: e.message };
  }
}
