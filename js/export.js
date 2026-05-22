import { showToast } from './ui.js';

export function exportExcel(contacts) {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  const rows = contacts.map(c => ({
    'Ad Soyad': c.full_name||'', 'Firma': c.company_name||'', 'Unvan': c.title||'',
    'Telefon': c.phone||'', 'GSM': c.gsm||'', 'Fax': c.fax||'',
    'E-posta': c.email||'', 'Web': c.web||'', 'Adres': c.address||'',
    'Sektör': c.sector||'', 'Kategori': c.category||'', 'Not': c.notes||'',
    'Sonraki Aksiyon': c.next_action||'', 'Takip Tarihi': c.next_action_date||'',
    'Eklenme': c.created_at ? new Date(c.created_at).toLocaleDateString('tr-TR') : '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
  XLSX.writeFile(wb, 'KartCRM_Kisiler.xlsx');
  showToast('✓ Excel indirildi');
}

export function exportPDF(contacts) {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  const rows = contacts.map(c => `<tr><td>${c.full_name||''}</td><td>${c.company_name||''}</td><td>${c.phone||''}</td><td>${c.email||''}</td><td>${c.sector||''}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:10px;padding:20px;}h1{color:#4B5FFA;}table{width:100%;border-collapse:collapse;}th{background:#4B5FFA;color:#fff;padding:7px 5px;text-align:left;}td{padding:6px 5px;border-bottom:1px solid #EEF0F8;}</style></head><body><h1>KartCRM</h1><p>${contacts.length} kişi · ${new Date().toLocaleDateString('tr-TR')}</p><table><thead><tr><th>Ad Soyad</th><th>Firma</th><th>Telefon</th><th>E-posta</th><th>Sektör</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 600); }
}
