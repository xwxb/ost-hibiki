import { NextResponse } from 'next/server';
import { getSongById } from '@/lib/songs';

export async function GET(_req: Request, context: { params: { id: string } }) {
  const song = await getSongById(context.params.id);

  if (!song) {
    return NextResponse.json({ message: 'Song Not Found' }, { status: 404 });
  }

  return NextResponse.json(song);
}
