export type BangumiTag = {
  name?: string;
};

export type BangumiInfoboxItem = {
  key?: string;
  value?: unknown;
};

export type BangumiSubject = {
  id: number;
  name?: string;
  name_cn?: string;
  tags?: BangumiTag[];
  meta_tags?: string[];
  infobox?: BangumiInfoboxItem[];
};

export type BangumiRelatedPerson = {
  name?: string;
  relation?: string;
};

export type BangumiAutofillPayload = {
  bangumi_id: number;
  song_title: string;
  subtitle?: string;
  tags: string[];
  composer?: string;
};

const COMPOSER_RELATION_HINTS = ["作曲", "音乐", "音楽", "composer", "arrange", "artist", "配乐"];
const COMPOSER_INFOBOX_HINTS = ["作曲", "音乐", "音楽", "composer", "编曲", "配乐"];

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim();
}

function hasComposerHint(value: string | undefined, hints: string[]) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return false;
  return hints.some((hint) => normalized.includes(hint.toLowerCase()));
}

function pushUnique(list: string[], value: string) {
  const next = value.trim();
  if (!next) return;
  if (list.some((item) => item.toLowerCase() === next.toLowerCase())) return;
  list.push(next);
}

function readInfoboxNames(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const data = item as { v?: unknown };
    if (typeof data.v === "string" && data.v.trim()) {
      result.push(data.v.trim());
    }
  }
  return result;
}

export function pickComposer(subject: BangumiSubject, persons: BangumiRelatedPerson[]): string | undefined {
  const fromPersons = persons
    .filter((person) => hasComposerHint(person.relation, COMPOSER_RELATION_HINTS))
    .map((person) => normalizeText(person.name))
    .filter(Boolean);

  if (fromPersons.length) {
    return Array.from(new Set(fromPersons)).slice(0, 3).join(" / ");
  }

  for (const item of subject.infobox ?? []) {
    if (!hasComposerHint(item.key, COMPOSER_INFOBOX_HINTS)) continue;
    const names = readInfoboxNames(item.value);
    if (names.length) {
      return Array.from(new Set(names)).slice(0, 3).join(" / ");
    }
  }

  return undefined;
}

export function collectTags(subject: BangumiSubject): string[] {
  const output: string[] = [];

  for (const item of subject.tags ?? []) {
    if (typeof item?.name === "string") pushUnique(output, item.name);
    if (output.length >= 8) return output;
  }

  for (const item of subject.meta_tags ?? []) {
    if (typeof item === "string") pushUnique(output, item);
    if (output.length >= 8) return output;
  }

  return output;
}

export function mapBangumiToAutofill(subject: BangumiSubject, persons: BangumiRelatedPerson[]): BangumiAutofillPayload {
  const originalTitle = normalizeText(subject.name);
  const localizedTitle = normalizeText(subject.name_cn);
  const songTitle = localizedTitle || originalTitle;
  if (!songTitle) {
    throw new Error("Bangumi 条目缺少可用标题");
  }

  const subtitleAlt = songTitle === localizedTitle ? originalTitle : localizedTitle;
  const safeSubtitle = subtitleAlt && subtitleAlt !== songTitle ? `${songTitle} / ${subtitleAlt}` : undefined;

  return {
    bangumi_id: subject.id,
    song_title: songTitle,
    subtitle: safeSubtitle,
    tags: collectTags(subject),
    composer: pickComposer(subject, persons)
  };
}
