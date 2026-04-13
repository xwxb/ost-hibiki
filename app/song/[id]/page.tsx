import { SongPlayer } from '@/components/song-player';

export default function SongDetailPage({ params }: { params: { id: string } }) {
  return <SongPlayer id={params.id} />;
}
