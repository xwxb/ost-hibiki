import type { Metadata } from "next";
import { SongLoader } from "@/components/song-loader";
import { getSongById } from "@/lib/song-repo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const song = await getSongById(id);
  return {
    title: song ? `${song.song_title} | OST Hibiki` : "OST Hibiki"
  };
}

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SongLoader songId={id} />;
}
