import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSongsMock = vi.fn();
const getSongByIdMock = vi.fn();

vi.mock('@/lib/songs', () => ({
  listSongs: (...args: unknown[]) => listSongsMock(...args),
  getSongById: (...args: unknown[]) => getSongByIdMock(...args)
}));

describe('api routes', () => {
  beforeEach(() => {
    listSongsMock.mockReset();
    getSongByIdMock.mockReset();
  });

  it('GET /api/songs returns list payload', async () => {
    listSongsMock.mockResolvedValue([
      {
        id: 'song-1',
        song_title: 'hello',
        tags: ['OST'],
        media_urls: { ytb_url: 'https://www.youtube.com/watch?v=abcdefghi11' },
        img_urls: ['https://example.com/cover.jpg']
      }
    ]);

    const { GET } = await import('@/app/api/songs/route');
    const response = await GET(new Request('http://localhost/api/songs?q=hello&tag=OST'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(listSongsMock).toHaveBeenCalledWith({ q: 'hello', tag: 'OST' });
  });

  it('GET /api/songs/[id] returns 404 when no song found', async () => {
    getSongByIdMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/songs/[id]/route');
    const response = await GET(new Request('http://localhost/api/songs/missing'), {
      params: { id: 'missing' }
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.message).toBe('Song Not Found');
  });
});
