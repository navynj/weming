// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { LaneMatch } from '@/features/pool/lane-match';
import type { Links, Markers } from '@/features/pool/match';

afterEach(cleanup);

const marker = (root: Element, kind: 'home' | 'default' | 'share', key: string) =>
  root.querySelector(`[data-match-marker="${kind}"][data-match-marker-lane="${key}"]`);
const toggle = (root: Element, kind: 'home' | 'default' | 'share', key: string) =>
  marker(root, kind, key)!.querySelector('[role="switch"]') as HTMLButtonElement;
const isOn = (root: Element, kind: 'home' | 'default' | 'share', key: string) =>
  toggle(root, kind, key).getAttribute('aria-checked') === 'true';
const state = (root: Element): Markers =>
  JSON.parse(root.querySelector('[data-marker-state]')!.textContent!) as Markers;

function Match() {
  const [links, setLinks] = useState<Links>({ games: 'my-games', notes: null });
  const [markers, setMarkers] = useState<Markers>({});
  return (
    <LaneMatch
      poolName="Our Pool"
      lanes={[
        { key: 'games', name: 'Games', icon: '🎲', description: null },
        { key: 'notes', name: 'Notes', icon: '📓', description: null },
      ]}
      categories={[{ id: 'my-games', name: 'Games', icon: '🎲' }]}
      links={links}
      onLinksChange={setLinks}
      markers={markers}
      onMarkersChange={setMarkers}
      onCreateLane={() => Promise.resolve({ message: 'not here' })}
      action={<span data-marker-state>{JSON.stringify(markers)}</span>}
    />
  );
}

describe('Connect your lanes (0033)', () => {
  it('says what lanes are, and shows no directions, arrows or captions', () => {
    const { container } = render(<Match />);
    expect(container.textContent).toContain('Connect your lanes');
    expect(container.textContent).toContain('Lanes are your own columns on Home.');
    expect(container.querySelector('[data-match-direction]')).toBeNull();
    expect(container.querySelector('[data-match-caption]')).toBeNull();
    expect(container.textContent).not.toMatch(/[↔←→]/);
  });

  it('gives a connected row its switches, all off when made', () => {
    const { container } = render(<Match />);
    expect(marker(container, 'home', 'games')!.textContent).toBe('Show on Home in Games');
    expect(marker(container, 'share', 'games')!.textContent).toBe('Share new Games records');
    // A lane of mine on one row only: that row is its default without asking.
    expect(marker(container, 'default', 'games')).toBeNull();
    expect(isOn(container, 'home', 'games')).toBe(false);
    expect(isOn(container, 'share', 'games')).toBe(false);
  });

  it('turns Home and sharing on, row by row', () => {
    const { container } = render(<Match />);
    fireEvent.click(toggle(container, 'home', 'games'));
    fireEvent.click(toggle(container, 'share', 'games'));
    expect(isOn(container, 'home', 'games')).toBe(true);
    expect(isOn(container, 'share', 'games')).toBe(true);
    expect(state(container).games).toEqual({ isDefault: true, shareByDefault: true, isHome: true });
  });

  it('has no switches on an unconnected row', () => {
    const { container } = render(<Match />);
    expect(container.querySelector('[data-match-marker-lane="notes"]')).toBeNull();
  });
});

function Church() {
  // As a hurried hand leaves it: one lane of mine on three pool lanes.
  const [links, setLinks] = useState<Links>({ word: 'church', prayer: 'church', thanks: 'church' });
  const [markers, setMarkers] = useState<Markers>({});
  return (
    <LaneMatch
      poolName="Sarang"
      lanes={[
        { key: 'word', name: 'Word', icon: '📖', description: null },
        { key: 'prayer', name: 'Prayer', icon: '🙏', description: null },
        { key: 'thanks', name: 'Thanks', icon: '🥹', description: null },
      ]}
      categories={[
        { id: 'church', name: 'Church', icon: '⛪' },
        { id: 'day', name: 'Day', icon: '🖋' },
      ]}
      links={links}
      onLinksChange={setLinks}
      markers={markers}
      onMarkersChange={setMarkers}
      onCreateLane={() => Promise.resolve({ message: 'not here' })}
      action={<span data-marker-state>{JSON.stringify(markers)}</span>}
    />
  );
}

describe('one default per lane of mine (0033)', () => {
  it('asks which row is the default, starting on the first; only it may share', () => {
    const { container } = render(<Church />);
    for (const key of ['word', 'prayer', 'thanks']) {
      expect(marker(container, 'default', key)!.textContent).toBe('Default for Church');
    }
    expect(isOn(container, 'default', 'word')).toBe(true);
    expect(isOn(container, 'default', 'prayer')).toBe(false);
    expect(marker(container, 'share', 'word')).not.toBeNull();
    expect(marker(container, 'share', 'prayer')).toBeNull();
    expect(marker(container, 'share', 'thanks')).toBeNull();
  });

  it('moves the default, and its sharing with it', () => {
    const { container } = render(<Church />);
    fireEvent.click(toggle(container, 'share', 'word'));
    fireEvent.click(toggle(container, 'default', 'prayer'));
    expect(isOn(container, 'default', 'word')).toBe(false);
    expect(isOn(container, 'default', 'prayer')).toBe(true);
    expect(marker(container, 'share', 'word')).toBeNull();
    expect(isOn(container, 'share', 'prayer')).toBe(true);
    const saved = state(container);
    expect(saved.word).toEqual({ isDefault: false, shareByDefault: false, isHome: false });
    expect(saved.prayer).toEqual({ isDefault: true, shareByDefault: true, isHome: false });
  });

  it('cannot turn the default off: another row is picked instead', () => {
    const { container } = render(<Church />);
    fireEvent.click(toggle(container, 'default', 'word'));
    expect(isOn(container, 'default', 'word')).toBe(true);
  });

  it('drops the default question once a lane of mine is on one row', () => {
    const { container } = render(<Church />);
    fireEvent.change(container.querySelector('[data-match-select="thanks"]')!, {
      target: { value: 'day' },
    });
    expect(marker(container, 'default', 'thanks')).toBeNull();
    expect(marker(container, 'share', 'thanks')!.textContent).toBe('Share new Day records');
    expect(marker(container, 'default', 'word')).not.toBeNull();
  });
});
