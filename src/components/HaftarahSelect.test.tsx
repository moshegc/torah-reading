import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HaftarahSelect } from './HaftarahSelect';
import { HAFTARAH_OPTIONS } from '../data/haftarahOptions';

describe('HaftarahSelect', () => {
  it('renders a required dropdown of dataset readings with tradition-specific counts', () => {
    const html = renderToStaticMarkup(
      <HaftarahSelect value="שבת זכור" tradition="sephardi" onChange={vi.fn()} />
    );
    expect(html).toContain('<select');
    expect(html).toContain('required=""');
    expect(html).not.toContain('<input');
    expect(html.match(/<option /g)).toHaveLength(HAFTARAH_OPTIONS.length);
    expect(html).toContain('<option value="שבת זכור" selected="">שבת זכור (34 פס׳)</option>');
  });

  it('resolves known legacy names and prompts for replacement of unknown ones', () => {
    const render = (value: string) => renderToStaticMarkup(
      <HaftarahSelect value={value} tradition="ashkenazi" onChange={vi.fn()} />
    );
    expect(render('מחר חודש')).toContain('<option value="שבת מחר חודש" selected="">');
    expect(render('Custom legacy')).toContain('Custom legacy — יש לבחור הפטרה מהרשימה');
    expect(render('Custom legacy')).toContain('disabled="" selected=""');
  });
});
