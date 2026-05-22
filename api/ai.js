export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { notes, person_name } = req.body;
  if (!notes) return res.status(400).json({ error: 'notes gerekli' });

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
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Sen bir CRM asistanısın. Aşağıdaki görüşme notunu analiz et ve JSON formatında çıktı ver.

Kişi: ${person_name || 'Bilinmiyor'}
Görüşme notu: "${notes}"

SADECE bu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "summary": "2-3 cümlelik özet",
  "actions": [
    {"text": "yapılacak iş", "person": "kişi adı veya boş", "done": false}
  ],
  "reminders": [
    {"text": "hatırlatma metni", "date": "YYYY-MM-DD veya null", "time": "HH:MM veya null"}
  ],
  "followup": "beklenen dönüş açıklaması veya boş"
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
