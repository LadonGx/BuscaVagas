/**
 * Converte item a item, descartando o que falha em vez de derrubar a lista.
 *
 * JSON de site é dado externo: se um portal mudar um campo em uma vaga, as
 * outras noventa e nove continuam valendo. Quem chama registra `dropped` —
 * um salto nesse número é o primeiro sinal de que o formato mudou.
 */
export function parseEach<T>(
  items: readonly unknown[],
  convert: (item: unknown) => T | null,
): { ok: T[]; dropped: number } {
  const ok: T[] = [];
  let dropped = 0;

  for (const item of items) {
    let result: T | null;
    try {
      result = convert(item);
    } catch {
      result = null;
    }

    if (result === null) {
      dropped += 1;
    } else {
      ok.push(result);
    }
  }

  return { ok, dropped };
}
