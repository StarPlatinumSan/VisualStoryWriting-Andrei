export function getSimpleName(name: string): string {
  const tokens = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return "Unknown";
  return tokens[tokens.length - 1];
}

export function getEntityEmoji(emoji?: string): string {
  return emoji && emoji.trim().length > 0 ? emoji : "🙂";
}

export function getLocationEmoji(emoji?: string): string {
  return emoji && emoji.trim().length > 0 ? emoji : "📍";
}
