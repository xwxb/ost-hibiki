import { describe, expect, it } from 'vitest';
import { songSchema } from '@/lib/schema';

describe('song schema', () => {
  it('accepts valid song payload', () => {
    const parsed = songSchema.parse({
      id: 'song-1',
      song_title: 'test',
      tags: ['a'],
      media_urls: {
        ytb_url: 'https://www.youtube.com/watch?v=abc12345678'
      },
      img_urls: ['https://example.com/cover.jpg']
    });

    expect(parsed.song_title).toBe('test');
  });

  it('rejects when media urls are all missing', () => {
    expect(() =>
      songSchema.parse({
        id: 'song-2',
        song_title: 'test',
        tags: [],
        media_urls: {},
        img_urls: ['https://example.com/cover.jpg']
      })
    ).toThrow('media_urls');
  });

  it('rejects when img_urls is empty', () => {
    expect(() =>
      songSchema.parse({
        id: 'song-3',
        song_title: 'test',
        tags: [],
        media_urls: {
          bili_url: 'https://www.bilibili.com/video/BV1xj411S7pc'
        },
        img_urls: []
      })
    ).toThrow('img_urls');
  });
});
