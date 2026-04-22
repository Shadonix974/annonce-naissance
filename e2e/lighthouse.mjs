import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const url = `${process.env.E2E_BASE_URL}/?k=${process.env.E2E_TOKEN}`;
const chrome = await launch({ chromeFlags: ['--headless=new'] });
const { lhr } = await lighthouse(url, {
  port: chrome.port,
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
});
const s = lhr.categories;
const failures = [];
for (const k of Object.keys(s)) {
  const score = (s[k].score ?? 0) * 100;
  console.log(`${k.padEnd(20)} ${score}`);
  if (score < 95) failures.push(`${k}=${score}`);
}
await chrome.kill();
if (failures.length) { console.error('below target:', failures); process.exit(1); }
