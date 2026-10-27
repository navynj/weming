// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkedText, linkPieces } from '@/components/ui/linked-text';

afterEach(cleanup);

describe('a link in what someone wrote (review)', () => {
  it('finds http, https and www addresses, leaving sentence punctuation outside', () => {
    expect(linkPieces('see https://a.com/x?y=1, then www.b.org.')).toEqual([
      { text: 'see ' },
      { href: 'https://a.com/x?y=1', text: 'https://a.com/x?y=1' },
      { text: ', then ' },
      { href: 'https://www.b.org', text: 'www.b.org' },
      { text: '.' },
    ]);
    expect(linkPieces('no links here')).toEqual([{ text: 'no links here' }]);
  });

  it('opens it in a new tab, and the tap is the link’s alone', () => {
    const outer = vi.fn();
    const { container } = render(
      <p onClick={outer}>
        <LinkedText text="read (http://x.io/a) now" />
      </p>,
    );
    const link = container.querySelector<HTMLAnchorElement>('a[data-linked]')!;
    expect(link.href).toBe('http://x.io/a');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(container.textContent).toBe('read (http://x.io/a) now');
    fireEvent.click(link);
    expect(outer).not.toHaveBeenCalled();
  });
});
