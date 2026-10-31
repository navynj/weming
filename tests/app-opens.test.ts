import { describe, expect, it } from 'vitest';

import { platformOf, takeOpenMarker, withOpenMarker } from '@/lib/app-opens';

/** A push's open marker and the platform word (H71). */
const NID = '0b9f7c8e-2f5d-4c1a-9d3e-6a7b8c9d0e1f';

describe('the open marker', () => {
  it('goes before the hash and comes back out whole', () => {
    const marked = withOpenMarker('/pool/p/splash/s#reply-r', NID);
    expect(marked).toBe(`/pool/p/splash/s?src=notif&nid=${NID}#reply-r`);
    expect(takeOpenMarker(marked)).toEqual({
      path: '/pool/p/splash/s#reply-r',
      notificationId: NID,
    });
  });

  it('keeps other parameters, and leaves an unmarked path alone', () => {
    expect(takeOpenMarker(`/pool/p?tab=date&src=notif&nid=${NID}`)).toEqual({
      path: '/pool/p?tab=date',
      notificationId: NID,
    });
    expect(takeOpenMarker('/pool/p?tab=date')).toEqual({
      path: '/pool/p?tab=date',
      notificationId: null,
    });
  });

  it('takes out a marker whose id is not an id, and names nothing', () => {
    expect(takeOpenMarker('/?src=notif&nid=x%27)')).toEqual({ path: '/', notificationId: null });
  });
});

describe('the platform', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile';

  it('names the system and whether it is installed, nothing more', () => {
    expect(platformOf({ userAgent: iphone, maxTouchPoints: 5, standalone: true })).toBe('ios-pwa');
    expect(platformOf({ userAgent: mac, maxTouchPoints: 5, standalone: false })).toBe('ios-web');
    expect(platformOf({ userAgent: mac, maxTouchPoints: 0, standalone: false })).toBe(
      'desktop-web',
    );
    expect(platformOf({ userAgent: android, maxTouchPoints: 5, standalone: true })).toBe(
      'android-pwa',
    );
  });
});
