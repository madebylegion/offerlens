import { describe, expect, test } from 'vitest';
import { mdToHtml } from '../src/md';

const reply = [
  '**Rate:** ask for $2,400, not $1,800.',
  '*',
  '***',
  '* Cut usage to *3 months*',
  '- Pay on net 15',
  '',
  'Hi Maya, <script>alert(1)</script> <img src=x onerror=alert(1)> thanks!',
  '',
  'Best,',
  '[Your Name]',
].join('\n');

const ALLOWED = /^<\/?(p|ul|li|strong|em)>$|^<br>$/;

describe('mdToHtml()', () => {
  const html = mdToHtml(reply);
  const text = html.replace(/<[^>]+>/g, ' ');
  test('renders the subset', () => {
    expect(html).toContain('<strong>Rate:</strong>');
    expect(html).toContain('<ul><li>Cut usage to <em>3 months</em></li><li>Pay on net 15</li></ul>');
  });
  test('no raw Markdown or placeholder reaches the text', () => {
    expect(text).not.toMatch(/[*\[\]]/);
    expect(text).toContain('Best,');
  });
  test('no HTML injection: only the allowed tags exist, model markup is escaped', () => {
    for (const t of html.match(/<[^>]*>/g) ?? []) expect(t).toMatch(ALLOWED);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script|<img/i);
  });
  test('known-bad control: the tag check rejects an unescaped script tag', () => {
    expect('<script>').not.toMatch(ALLOWED);
  });
});
