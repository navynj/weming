// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PeopleProvider } from '@/features/people/people-provider';
import { WithFace } from '@/features/pool/with-face';

afterEach(cleanup);

const people = {
  'u-mina': { name: 'Mina Kim', photo: 'https://signed/mina' },
  'u-jae': { name: 'Jae Park', photo: null },
};

function face(id: 'u-mina' | 'u-jae', on: boolean, onToggle = () => {}) {
  return render(
    <PeopleProvider me="me" people={people}>
      <WithFace
        id={id}
        name={people[id].name}
        initials={id === 'u-mina' ? 'MK' : 'JP'}
        on={on}
        onToggle={onToggle}
        data="together"
      />
    </PeopleProvider>,
  );
}

describe('a face on the With line (review)', () => {
  it('shows the profile photo when there is one, with the name under it', () => {
    const { container } = face('u-mina', false);
    const button = container.querySelector('[data-together-face="u-mina"]')!;
    expect(button.querySelector<HTMLImageElement>('img[data-avatar-photo]')!.src).toBe(
      'https://signed/mina',
    );
    expect(button.querySelector('[data-with-name]')!.textContent).toBe('Mina Kim');
  });

  it('shows initials without a photo, the name still under it', () => {
    const { container } = face('u-jae', false);
    const button = container.querySelector('[data-together-face="u-jae"]')!;
    expect(button.querySelector('img')).toBeNull();
    expect(button.textContent).toContain('JP');
    expect(button.querySelector('[data-with-name]')!.textContent).toBe('Jae Park');
  });

  it('reads as picked with an ink ring and an ink name, and toggles', () => {
    let toggled = 0;
    const { container } = face('u-mina', true, () => (toggled += 1));
    const button = container.querySelector<HTMLButtonElement>('[data-together-face="u-mina"]')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.querySelector('img')!.className).toContain('ring-ink');
    expect(button.querySelector('[data-with-name]')!.className).toContain('text-ink');
    fireEvent.click(button);
    expect(toggled).toBe(1);
  });
});
