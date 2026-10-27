// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeopleProvider } from '@/features/people/people-provider';
import type { ReactionRow, ReplyRow, RippleResponsesValue } from '@/features/responses/model';
import { RippleResponses } from '@/features/responses/ripple-responses';

/**
 * Under a block in the splash detail (H25): reaction chips, then replies —
 * the first two, "+n more replies", the input at the bottom.
 */

afterEach(cleanup);

const ME = 'u-me';
const MINA = 'u-mk';

function reply(id: string, author: string, at: number, over: Partial<ReplyRow> = {}): ReplyRow {
  return {
    id,
    ripple_id: 'r1',
    author_id: author,
    body: `words ${id}`,
    created_at: `2026-10-26T10:0${at}:00Z`,
    edited_at: null,
    hidden: false,
    former: false,
    ...over,
  };
}
const reaction = (user: string, emoji: string, at: number): ReactionRow => ({
  ripple_id: 'r1',
  user_id: user,
  emoji,
  created_at: `2026-10-26T09:0${at}:00Z`,
});

function view(
  value: RippleResponsesValue,
  {
    canRespond = true,
    rippleAuthor = MINA,
    expanded = false,
  }: { canRespond?: boolean; rippleAuthor?: string; expanded?: boolean } = {},
) {
  const on = { reply: vi.fn(), edit: vi.fn(), remove: vi.fn(), hide: vi.fn() };
  const onReact = vi.fn();
  const onExpand = vi.fn();
  const result = render(
    <PeopleProvider
      me={ME}
      people={{
        [ME]: { name: 'Yoonji Lee', photo: null },
        [MINA]: { name: 'Mina Kim', photo: null },
      }}
    >
      <RippleResponses
        rippleId="r1"
        rippleAuthor={rippleAuthor}
        value={value}
        canRespond={canRespond}
        expanded={expanded}
        onExpand={onExpand}
        onReact={onReact}
        on={on}
      />
    </PeopleProvider>,
  );
  return { ...result, on, onReact, onExpand };
}

describe('reactions under a block', () => {
  it('shows each emoji and its count, mine in ink, then "+"; a tap toggles that emoji', () => {
    const { container, onReact } = view({
      reactions: [reaction(MINA, '❤️', 1), reaction(ME, '❤️', 2), reaction(MINA, '😂', 3)],
      replies: [],
    });
    const heart = container.querySelector('[data-reaction="❤️"]')!;
    expect(heart.textContent).toBe('❤️2');
    expect(heart.className).toContain('bg-ink');
    expect(heart.getAttribute('title')).toBe('Mina Kim, You');
    const laugh = [...container.querySelectorAll('[data-reaction]')].find(
      (el) => el.getAttribute('data-reaction') === '😂',
    )!;
    expect(laugh.className).not.toContain('bg-ink');
    fireEvent.click(heart);
    expect(onReact).toHaveBeenCalledWith('❤️');
  });

  it('"+" opens six quick ones and a field for any emoji', () => {
    const { container, onReact } = view({ reactions: [], replies: [] });
    fireEvent.click(container.querySelector('[data-reaction-add]')!);
    expect(container.querySelectorAll('[data-reaction-quick]')).toHaveLength(6);
    fireEvent.change(container.querySelector('[data-reaction-field]')!, {
      target: { value: '🌊' },
    });
    expect(onReact).toHaveBeenCalledWith('🌊');
  });
});

describe('replies under a block', () => {
  const five = [0, 1, 2, 3, 4].map((at) => reply(`p${at}`, at % 2 ? ME : MINA, at));

  it('shows the first two, then "+3 more replies", and the input at the bottom', () => {
    const { container, onExpand } = view({ reactions: [], replies: five });
    expect(container.querySelectorAll('[data-reply]')).toHaveLength(2);
    const more = container.querySelector('[data-replies-more]')!;
    expect(more.textContent).toBe('+3 more replies');
    fireEvent.click(more);
    expect(onExpand).toHaveBeenCalled();
    const input = container.querySelector('[data-reply-input] textarea')!;
    expect(input.getAttribute('placeholder')).toBe('Reply…');
    expect(input.getAttribute('maxlength')).toBe('500');
  });

  it('expanded, shows them all', () => {
    const { container } = view({ reactions: [], replies: five }, { expanded: true });
    expect(container.querySelectorAll('[data-reply]')).toHaveLength(5);
    expect(container.querySelector('[data-replies-more]')).toBeNull();
  });

  it('sends on Enter, keeps a line break on Shift+Enter', () => {
    const { container, on } = view({ reactions: [], replies: [] });
    const input = container.querySelector('[data-reply-input] textarea')!;
    fireEvent.change(input, { target: { value: '  so good  ' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(on.reply).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(on.reply).toHaveBeenCalledWith('so good');
  });

  it('marks edited, former members, and a hidden reply; mine I edit and delete, not hide', () => {
    const { container } = view({
      reactions: [],
      replies: [
        reply('mine', ME, 1, { edited_at: '2026-10-26T10:05:00Z' }),
        reply('gone', MINA, 2, { hidden: true, body: null, former: true }),
      ],
    });
    const mine = container.querySelector('[data-reply="mine"]')!;
    expect(mine.querySelector('[data-reply-edited]')).not.toBeNull();
    expect(mine.querySelector('[data-reply-edit]')).not.toBeNull();
    expect(mine.querySelector('[data-reply-delete]')).not.toBeNull();
    expect(mine.querySelector('[data-reply-hide]')).toBeNull();
    const gone = container.querySelector('[data-reply="gone"]')!;
    expect(gone.textContent).toContain('Hidden by the author');
    expect(gone.textContent).toContain('Former member');
    expect(gone.querySelector('[data-reply-delete]')).toBeNull();
  });

  it('on my ripple I hide anyone’s reply', () => {
    const { container, on } = view(
      { reactions: [], replies: [reply('theirs', MINA, 1)] },
      { rippleAuthor: ME },
    );
    fireEvent.click(container.querySelector('[data-reply-hide]')!);
    expect(on.hide).toHaveBeenCalledWith('theirs', true);
  });
});

describe('where nobody can respond', () => {
  it('a ripple nobody else sees, with nothing on it, shows nothing', () => {
    const { container } = view({ reactions: [], replies: [] }, { canRespond: false });
    expect(container.querySelector('[data-ripple-responses]')).toBeNull();
  });

  it('a locked ripple keeps what was there for its author, takes no more', () => {
    const { container } = view(
      { reactions: [reaction(MINA, '❤️', 1)], replies: [reply('old', MINA, 1)] },
      { canRespond: false, rippleAuthor: ME },
    );
    expect(container.querySelector('[data-reaction="❤️"]')).not.toBeNull();
    expect(container.querySelector('[data-reaction-add]')).toBeNull();
    expect(container.querySelector('[data-reply-input]')).toBeNull();
  });
});
