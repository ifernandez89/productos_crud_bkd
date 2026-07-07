export function resolveOllamaModelName(defaultModel = 'llama3.2:3b'): string {
  const configuredModel = [
    process.env.OLLAMA_MODEL_NAME,
    process.env.OLLAMA_MODEL,
  ]
    .map((value) => value?.trim())
    .find((value) => Boolean(value));

  return configuredModel || defaultModel;
}
