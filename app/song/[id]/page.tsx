import { SongLoader } from "@/components/song-loader";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SongLoader songId={id} />;
}
