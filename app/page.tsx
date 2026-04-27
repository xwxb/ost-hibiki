import type { Metadata } from "next";
import { SearchHome } from "@/components/search-home";
import { isAdminModeEnabled } from "@/lib/runtime-config";

export const metadata: Metadata = {
  title: "OST Hibiki",
  description: "Search anime OST songs by title, subtitle, and tags."
};

export default function HomePage() {
  return <SearchHome adminMode={isAdminModeEnabled()} />;
}
