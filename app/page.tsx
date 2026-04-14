import type { Metadata } from "next";
import { SearchHome } from "@/components/search-home";

export const metadata: Metadata = {
  title: "OST Hibiki",
  description: "Search anime OST songs by title, subtitle, and tags."
};

export default function HomePage() {
  return <SearchHome />;
}
