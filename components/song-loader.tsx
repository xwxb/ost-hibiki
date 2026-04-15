"use client";

import { useEffect, useState } from "react";
import { getLocalSongs } from "@/lib/local-storage";
import type { OstSongItem } from "@/lib/schema";
import { SongShowcase } from "./song-showcase";

type SongResponse = { item: OstSongItem };

export function SongLoader({ songId }: { songId: string }) {
  const [song, setSong] = useState<OstSongItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const local = getLocalSongs().find((item) => String(item.id) === songId);
        if (local && mounted) {
          setSong(local);
          setLoading(false);
          return;
        }
        const response = await fetch(`/api/songs/${songId}`, { cache: "no-store" });
        if (!mounted) return;
        if (!response.ok) {
          setSong(null);
          setLoading(false);
          return;
        }
        const data = (await response.json()) as SongResponse;
        setSong(data.item);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [songId]);

  if (loading) {
    return <main className="center-message">Loading...</main>;
  }

  if (!song) {
    return <main className="center-message">Song not found.</main>;
  }

  return <SongShowcase song={song} />;
}
