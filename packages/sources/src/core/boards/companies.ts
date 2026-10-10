import { z } from 'zod';

/**
 * Empresa acompanhada num board (Greenhouse, Lever, Ashby).
 *
 * No `.env`: `slug` ou `slug=Nome exibido`, separados por vírgula. O slug é o
 * final da URL do board (`jobs.lever.co/<slug>`).
 */
export interface BoardCompany {
  slug: string;
  /** Nome escolhido no `.env`; `null` = usar o da API ou o derivado do slug. */
  name: string | null;
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** Lança com uma mensagem que cita o item inválido. Slug repetido entra uma vez. */
export function parseCompanyList(value: string | readonly string[]): BoardCompany[] {
  const items = typeof value === 'string' ? value.split(',') : value;
  const companies: BoardCompany[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;

    const separator = item.indexOf('=');
    const slug = (separator === -1 ? item : item.slice(0, separator)).trim();
    const name = separator === -1 ? '' : item.slice(separator + 1).trim();

    if (!SLUG.test(slug)) {
      throw new Error(
        `"${item}" não é um slug válido (use o final da URL do board, ex.: "minha-empresa")`,
      );
    }

    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    companies.push({ slug, name: name || null });
  }

  return companies;
}

/** Schema para `<FONTE>_COMPANIES`: vazio = []. */
export const companyListSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return parseCompanyList(value);
    } catch (error) {
      ctx.issues.push({
        code: 'custom',
        input: value,
        message: error instanceof Error ? error.message : String(error),
      });
      return z.NEVER;
    }
  })
  .default([]);

/** "quinto-andar" → "Quinto Andar". Último recurso quando a API não dá o nome. */
export function companyNameFromSlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
