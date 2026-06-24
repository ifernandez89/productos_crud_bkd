export function extractInvestigationCommand(message: string): string | null {
  const normalized = message.trim();
  if (!normalized.toLowerCase().startsWith('/investigar')) return null;

  const match = normalized.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, '') : null;
}
