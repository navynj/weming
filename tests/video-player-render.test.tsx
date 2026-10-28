// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { VideoPlayer } from '@/components/ui/video-media';

afterEach(cleanup);

const VIDEO = { id: 'dQw4w9WgXcQ', start: 30, short: false };

describe('a video plays only when asked (part 5)', () => {
  it('draws YouTube’s thumbnail and no player, nothing loaded from the player, until play', () => {
    const { container } = render(<VideoPlayer video={VIDEO} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });

  it('loads the player from youtube-nocookie.com in place on play, at the link’s time', () => {
    const { container } = render(<VideoPlayer video={VIDEO} />);
    fireEvent.click(container.querySelector('[data-video-play]')!);
    const frame = container.querySelector('iframe')!;
    const src = new URL(frame.getAttribute('src')!);
    expect(src.origin).toBe('https://www.youtube-nocookie.com');
    expect(src.searchParams.get('start')).toBe('30');
    expect(container.querySelector('[data-video-thumb]')).toBeNull();
  });

  it('stands in the video’s own shape: a Short 9:16', () => {
    const { container } = render(<VideoPlayer video={{ ...VIDEO, short: true }} />);
    expect(container.querySelector<HTMLElement>('[data-video-player]')!.style.aspectRatio).toMatch(
      /0\.5625|9 \/ 16/,
    );
  });
});
