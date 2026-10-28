// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CardPreview } from '@/features/home/card-preview';
import type { Card } from '@/features/home/grid';

afterEach(cleanup);

const card = (over: Partial<Card>): Card =>
  ({ body: '', ripples: [], photos: [], ...over }) as unknown as Card;

describe('the phone’s top card, under its title (H42f)', () => {
  it('reads every block’s words oldest first, then the first photo’s thumbnail alone', () => {
    const { container } = render(
      <CardPreview
        card={card({
          ripples: [
            { id: 'r1', note: 'First lines', createdAt: '', initials: 'YL', authorId: 'u' },
            { id: 'r2', note: '  ', createdAt: '', initials: 'YL', authorId: 'u' },
            { id: 'r3', note: 'Then more', createdAt: '', initials: 'YL', authorId: 'u' },
          ],
          photos: [
            { rippleId: 'r1', path: 'a/one.webp' },
            { rippleId: 'r3', path: 'a/two.webp' },
          ],
        })}
        signed={{ 'a/one.webp': 'https://signed/one', 'a/two.webp': 'https://signed/two' }}
      />,
    );
    const preview = container.querySelector('[data-card-preview]')!;
    expect(
      [...preview.children].map((c) => c.getAttribute('data-card-preview-photo') ?? c.textContent),
    ).toEqual(['First lines', 'Then more', 'a/one.webp']);
    const img = preview.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://signed/one');
    // Its own ratio, never cropped.
    expect(img.className).toContain('w-auto');
    expect(img.className).not.toContain('object-cover');
  });

  it('reads the post’s own words when it has no blocks, and no photo when it has none', () => {
    const { container } = render(<CardPreview card={card({ body: 'Just a line' })} signed={{}} />);
    expect(container.textContent).toBe('Just a line');
    expect(container.querySelector('[data-card-preview-photo]')).toBeNull();
  });
});
