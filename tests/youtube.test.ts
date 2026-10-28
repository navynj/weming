import { describe, expect, it } from 'vitest';

import { playerUrl, videoOf, videosIn } from '@/lib/youtube';

const ID = 'dQw4w9WgXcQ';

describe('YouTube links in a ripple (part 5)', () => {
  it('reads every link form, with or without a time', () => {
    expect(videoOf(`https://www.youtube.com/watch?v=${ID}`)).toEqual({
      id: ID,
      start: null,
      short: false,
    });
    expect(videoOf(`https://youtube.com/watch?v=${ID}&t=90`)?.start).toBe(90);
    expect(videoOf(`https://m.youtube.com/watch?v=${ID}&t=1m30s`)?.start).toBe(90);
    expect(videoOf(`https://youtu.be/${ID}?t=1h2m3s`)).toEqual({
      id: ID,
      start: 3723,
      short: false,
    });
    expect(videoOf(`https://www.youtube.com/shorts/${ID}`)).toEqual({
      id: ID,
      start: null,
      short: true,
    });
    expect(videoOf(`youtu.be/${ID}`)?.id).toBe(ID);
    expect(videoOf(`https://www.youtube.com/embed/${ID}?start=12`)?.start).toBe(12);
  });

  it('takes nothing that is not a video', () => {
    expect(videoOf('https://www.youtube.com/@someone')).toBeNull();
    expect(videoOf('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(videoOf(`https://notyoutube.com/watch?v=${ID}`)).toBeNull();
    expect(videosIn('no links here')).toEqual([]);
  });

  it('finds each video in the words, in order, once', () => {
    const text = `this one https://youtu.be/${ID} and (https://www.youtube.com/shorts/aaaaaaaaaaa), again https://www.youtube.com/watch?v=${ID}&t=5`;
    expect(videosIn(text).map((v) => v.id)).toEqual([ID, 'aaaaaaaaaaa']);
  });

  it('plays from youtube-nocookie.com, at the time the link gave', () => {
    const url = new URL(playerUrl({ id: ID, start: 90, short: false }));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get('start')).toBe('90');
  });
});
