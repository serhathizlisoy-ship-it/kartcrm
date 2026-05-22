export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { notes, person_name } = req.body;
  if (!notes) return res.status(400).json({ error: 'notes gerekli' });

  const now = new Date();
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const todayStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${days[now.getDay()]}`;
  const todayISO = now.toISOString().split('T')[0];

  // Yarın tarihi
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().split('T')[0];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `Sen deneyimli bir iş asistanısın. Kullanıcı bir iş görüşmesinden sonra sesli not bıraktı.

ÖNEMLİ TARİH BİLGİSİ:
- Bugün: ${todayStr}
- Bugünün tarihi (ISO): ${todayISO}
- Yarının tarihi (ISO): ${tomorrowISO}

"Yarın", "bu hafta", "önümüzdeki hafta", "2-3 güne", "Pazartesi" gibi göreceli ifadeleri yukarıdaki tarihe göre gerçek ISO tarihe (YYYY-MM-DD) çevir.
Saat bilgisi varsa (örn: "saat 10", "10:00") mutlaka kaydet.

Görüşen kişi: ${person_name || 'Bilinmiyor'}
Görüşme notu: "${notes}"

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "summary": "2-3 cümlelik net ve öz özet",
  "actions": [
    {"text": "yapılacak iş açık ve net", "person": "ilgili kişi adı veya boş string", "done": false}
  ],
  "reminders": [
    {"text": "hatırlatma metni", "date": "YYYY-MM-DD", "time": "HH:MM veya null"}
  ],
  "followup": "beklenen dönüş açıklaması veya boş string"
}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    let parsed = {};
    const m = rawText.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch(e) {}
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
