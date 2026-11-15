import { readdirSync, writeFileSync } from 'node:fs';
const folder = 'test-results/admin-rebuild';
const files = readdirSync(folder + '/after')
  .filter((file) => file.endsWith('.png'))
  .sort();
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const label = (value) =>
  value.replaceAll('-', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
const cards = files
  .map((file) => {
    const [device, ...parts] = file.replace('.png', '').split('-');
    const theme = parts.pop();
    const page = parts.join('-');
    const before = `${device}-${page}.png`;
    const hasBefore = readdirSync(folder + '/before').includes(before);
    return `<article data-device="${device}" data-theme="${theme}"><h2>${label(device)} · ${label(page)} · ${label(theme)}</h2><div class="comparison">${hasBefore ? `<figure><figcaption>Before</figcaption><a href="before/${before}" target="_blank"><img loading="lazy" src="before/${before}" alt="Before ${escape(page)}"></a></figure>` : ''}<figure><figcaption>After</figcaption><a href="after/${file}" target="_blank"><img loading="lazy" src="after/${file}" alt="After ${escape(page)}"></a></figure></div></article>`;
  })
  .join('');
writeFileSync(
  folder + '/review.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IEEE NUB Admin Dashboard · Design review</title><style>*{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#17263a;font:15px/1.6 system-ui}header{background:#fff;border-bottom:1px solid #dbe4ed;padding:32px max(24px,calc((100vw - 1400px)/2))}h1{font-size:28px;margin:4px 0}p{color:#586a80;max-width:900px}.brand{color:#0065ad;font-weight:800;letter-spacing:.12em}main{max-width:1400px;margin:auto;padding:24px}.filters{display:flex;gap:16px;position:sticky;top:0;z-index:2;background:#f1f5f9;padding:12px 0}label{font-weight:600}select{margin-left:10px;padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}article{margin:24px 0;background:white;border:1px solid #dbe4ed;border-radius:14px;padding:24px}h2{font-size:18px;margin:0 0 18px}.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0;min-width:0}figcaption{font-weight:600;color:#586a80;margin-bottom:8px}img{width:100%;max-height:620px;object-fit:contain;object-position:top;background:#e5ebf3;border:1px solid #dbe4ed;border-radius:8px}article[hidden]{display:none}.hint{font-size:13px}@media(max-width:600px){header,main{padding:20px}.filters{flex-direction:column;gap:6px}article{padding:16px}}</style></head><body><header><span class="brand">IEEE NUB GIT LAB</span><h1>Admin Dashboard design review</h1><p>One workspace with six areas: Overview, Students, Assessments, Submissions & grading, Courses & sessions, and Administration.</p><p class="hint">${files.length} after screenshots and preserved before comparisons. Local screenshots use isolated PostgreSQL fixtures. No deployment or production data deletion was performed. Click a screenshot to inspect it at full size.</p></header><main><div class="filters"><label>Device<select id="device"><option value="desktop">Desktop</option><option value="mobile">Mobile · 390px</option><option value="android">Android · Edge</option><option value="iphone">iPhone · WebKit</option><option value="all">All devices</option></select></label><label>Theme<select id="theme"><option value="light">Light</option><option value="dark">Dark</option><option value="all">Both themes</option></select></label></div>${cards}</main><script>const filters=['device','theme'].map(id=>document.getElementById(id));function filter(){document.querySelectorAll('article').forEach(card=>card.hidden=filters.some(input=>input.value!=='all'&&card.dataset[input.id]!==input.value))}filters.forEach(input=>input.addEventListener('change',filter));filter();</script></body></html>`,
);
console.log(`Created review gallery with ${files.length} screenshots.`);
