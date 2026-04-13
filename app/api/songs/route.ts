import { NextResponse } from 'next/server';
import { listSongs } from '@/lib/songs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;

  const songs = await listSongs({ q, tag });

  return NextResponse.json({
    items: songs,
    total: songs.length
  });
}
