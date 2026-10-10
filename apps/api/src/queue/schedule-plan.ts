/** Um agendador desejado de uma fila (BullMQ job scheduler). */
export interface ScheduleSpec<Data = unknown> {
  id: string;
  everyMs: number;
  data: Data;
}

export interface ExistingSchedule {
  id: string;
  everyMs: number | undefined;
  data: unknown;
}

/**
 * Decide o que fazer com os agendadores de uma fila (descoberta, manutenção), comparando o que existe no
 * Redis com o que a configuração pede. Função pura — é aqui que mora a regra
 * que importa:
 *
 *   agendador igual ao pedido -> NÃO mexe.
 *
 * Recriar o agendador a cada subida dispararia uma busca a cada vez que o
 * modo dev reinicia a API (a cada arquivo salvo). Só cria/atualiza quando a
 * configuração mudou (intervalo, termos) e remove o que não é mais pedido.
 */
export function planSchedules<Data>(
  existing: readonly ExistingSchedule[],
  desired: readonly ScheduleSpec<Data>[],
): { upsert: ScheduleSpec<Data>[]; remove: string[] } {
  const current = new Map(existing.map((schedule) => [schedule.id, schedule]));
  const wanted = new Set(desired.map((spec) => spec.id));

  const upsert = desired.filter((spec) => {
    const found = current.get(spec.id);
    return (
      !found ||
      found.everyMs !== spec.everyMs ||
      JSON.stringify(found.data) !== JSON.stringify(spec.data)
    );
  });

  const remove = existing.map((schedule) => schedule.id).filter((id) => !wanted.has(id));

  return { upsert, remove };
}
