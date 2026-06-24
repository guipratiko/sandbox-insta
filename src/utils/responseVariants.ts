/** Normaliza lista de variações de texto (1–max itens não vazios). */
export function normalizeTextVariants(input: unknown, max = 3): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Sorteio uniforme entre variações. */
export function pickRandomVariant(variants: string[]): string {
  const list = normalizeTextVariants(variants);
  if (list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)];
}

export function applyUserContactVariable(text: string, username?: string | null): string {
  if (!text || !username?.trim()) return text;
  return text.replace(/\$user-contact/g, `@${username.trim()}`);
}

/** Resolve variações de comentário (novo campo ou legado response_text). */
export function resolveCommentVariants(automation: {
  commentResponseVariants?: string[];
  responseText?: string;
}): string[] {
  const fromNew = normalizeTextVariants(automation.commentResponseVariants);
  if (fromNew.length > 0) return fromNew;
  const legacy = String(automation.responseText ?? '').trim();
  return legacy ? [legacy] : [];
}

/** Resolve variações de DM (novo campo ou legado). */
export function resolveDmVariants(automation: {
  dmResponseVariants?: string[];
  responseTextDM?: string;
  responseText?: string;
}): string[] {
  const fromNew = normalizeTextVariants(automation.dmResponseVariants);
  if (fromNew.length > 0) return fromNew;
  const dm = String(automation.responseTextDM ?? '').trim();
  if (dm) return [dm];
  const legacy = String(automation.responseText ?? '').trim();
  return legacy ? [legacy] : [];
}
