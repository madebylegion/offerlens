// Tiny safe Markdown subset for the coach reply: paragraphs, "- "/"* " bullet lists, **bold**,
// *italic*, "# " headings (shown bold). Model text is HTML-escaped FIRST; the only tags in the output
// are the six this file adds (p, ul, li, strong, em, br), so model text can never inject markup.
// Leftover "[Your Name]"-style placeholders and stray "*" / "***" / backticks are dropped.
// ponytail: no links, tables, numbered lists or nesting; add only if the coach prompt starts asking for them.

import { esc } from './format';

const PLACEHOLDER = /\s*\[[^\[\]\n(]{1,40}\](?!\()/g; // not a [text](link)
const RULE = /^\s*([*_-]\s*){3,}$/; // ***  ---  ___

const inline = (s: string): string =>
  esc(s.replace(PLACEHOLDER, '').replace(/ +([,.!?;:])/g, '$1'))
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/\*(?!\s)(.+?)\*/g, '<em>$1</em>')
    .replace(/[*`]/g, '');

export function mdToHtml(text: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    if (list.length) out.push(`<ul>${list.join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const item = /^[*\-•]\s+(.*)$/.exec(line);
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line || RULE.test(line)) flush();
    else if (item) {
      if (para.length) flush();
      const t = inline(item[1]);
      if (t.trim()) list.push(`<li>${t}</li>`);
    } else {
      if (list.length) flush();
      const t = head ? `<strong>${inline(head[1])}</strong>` : inline(line);
      if (t.replace(/<[^>]+>/g, '').trim()) para.push(t);
    }
  }
  flush();
  return out.join('');
}
