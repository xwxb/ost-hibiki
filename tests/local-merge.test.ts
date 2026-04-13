import { describe, expect, it } from 'vitest';
import { mergeRemoteAndLocalSongs } from '@/lib/local-songs';
import type { OstSongItem } from '@/lib/schema';

const remoteSong: OstSongItem = {
  id: 'same-id',
  song_title: 'Remote Song',
  subtitle: 'remote',
  tags: ['OST'],
  media_urls: {
    ytb_url: 'https://www.youtube.com/watch?v=abcdefghi11'
  },
  img_urls: ['https://example.com/1.jpg']
};

const localSong: OstSongItem = {
  id: 'same-id',
  song_title: 'Local Song',
  subtitle: 'local',
  tags: ['OST', 'Local'],
  media_urls: {
    bili_url: 'https://www.bilibili.com/video/BV1xj411S7pc'
  },
  img_urls: ['https://example.com/2.jpg'],
  extras: {
    local_only: true
  }
};

describe('mergeRemoteAndLocalSongs', () => {
  it('prefers local item when ids collide', () => {
    const merged = mergeRemoteAndLocalSongs({
      remoteSongs: [remoteSong],
      localSongs: [localSong]
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.song_title).toBe('Local Song');
  });

  it('applies keyword and tag filtering on merged result', () => {
    const merged = mergeRemoteAndLocalSongs({
      remoteSongs: [remoteSong],
      localSongs: [localSong],
      q: 'local',
      tag: 'local'
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('same-id');
  });
});
