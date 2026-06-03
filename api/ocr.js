import { neon } from '@neondatabase/serverless';
import { jwtVerify } from 'jose';
import { checkRateLimit } from '../lib/ratelimit.js';

async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Giriş gerekli' });

  const sql = neon(process.env.DATABASE_URL);
  const rl = await checkRateLimit(sql, String(user.userId), 'ai_ocr', 10, 200);
  if (!rl.allowed) {
    const msg = rl.reason === 'day'
      ? 'Günlük tarama limitine ulaşıldı. Yarın tekrar deneyin.'
      : 'Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.';
    return res.status(429).json({ error: msg });
  }

  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: 'Bu kartvizit görselindeki bilgileri çıkar ve aşağıdaki kurallara göre Türkçe formatla.\n\nKURALLAR:\n- Tüm değerler Türkçe olmalı. İngilizce kelimeler varsa Türkçe karşılığını yaz (örnek: "advertising agency" -> "Reklam Ajansı", "marketing" -> "Pazarlama").\n- Şirket adlarını doğru büyük-küçük harf düzeniyle yaz (örnek: "alphacreative" -> "Alpha Creative", "ABCFİRMA" -> "ABC Firma").\n- Kişi adını doğru formatla: Ad SOYAD (soyadı büyük harfle). Örnek: "Alper HACIOĞLU".\n- Unvanı/pozisyonu Türkçe ve uygun büyük harflerle yaz (örnek: "agency director" -> "Ajans Direktörü", "general manager" -> "Genel Müdür").\n- Telefon numaralarını "0XXX XXX XX XX" formatında yaz.\n- E-posta ve web adreslerini olduğu gibi küçük harfle bırak.\n- Sektörü kısa ve Türkçe yaz (örnek: "Reklam Ajansı", "Yazılım", "Tekstil").\n- Kartvizitte olmayan bir alan varsa o alanı boş string ("") bırak, asla uydurma.\n\nSADECE geçerli JSON döndür, başka hiçbir şey yazma:\n{"name":"","company":"","title":"","phone":"","gsm":"","fax":"","email":"","web":"","address":"","sector":""}'
            }
          ]
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
