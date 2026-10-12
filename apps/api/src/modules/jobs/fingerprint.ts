import type { WorkModel } from '@busca-vagas/shared';
import { fold } from '@busca-vagas/sources';

/**
 * "Impressão digital" de uma vaga: empresa + título + lugar, normalizados.
 * Duas vagas com a mesma impressão e links diferentes são a mesma vaga
 * publicada de novo (repostada) ou em outra fonte (duplicada).
 *
 * Plano: docs/features/11-reposts.md
 */

/** Sufixos societários que mudam de uma fonte para outra ("Acme Ltda" × "Acme"). */
const COMPANY_SUFFIXES =
  /\b(ltda|s ?\/? ?a|eireli|me|epp|inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|sas|srl)\b/g;

/** Modalidade no título ("Dev Backend - Remoto"): o lugar já entra à parte. */
const MODALITY_WORDS =
  /\b(100% )?(remoto|remota|remote|hibrido|hibrida|hybrid|presencial|on ?site|home ?office|anywhere)\b/g;

/** Palavras que não dizem nada da vaga. */
const NOISE_WORDS = /\b(vaga|vagas|oportunidade|urgente|imediato|imediata|banco de talentos)\b/g;

export function companyKey(company: string): string {
  // Sem espaços: "Stark Bank" (Gupy) e "Starkbank" (nome do slug no Lever) batem.
  return fold(company)
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

export function titleKey(title: string): string {
  return (
    fold(title)
      // Gênero: "Desenvolvedor(a)", "Engenheiro/a".
      .replace(/\((a|o|as|os|e|es)\)/g, '')
      .replace(/\/(a|as|o|os)\b/g, '')
      // Códigos de requisição: "(REQ-1234)", "[#552]", "JR-2026".
      .replace(/[[(][^\])]*\d[^\])]*[\])]/g, ' ')
      .replace(/#?\b[a-z]{0,5}-?\d{3,}\b/g, ' ')
      .replace(MODALITY_WORDS, ' ')
      .replace(NOISE_WORDS, ' ')
      .replace(/[^a-z0-9+#]+/g, ' ')
      .trim()
  );
}

const REMOTE_PLACE = /^(remote|remoto|remota|home ?office|anywhere|worldwide|latam)\b/;
const COUNTRY_ONLY = /^(brasil|brazil)$/;

/** Cidade (primeiro pedaço do local) ou "remoto"; sem nenhum dos dois, a modalidade. */
export function placeKey(location: string | null, workModel: WorkModel | null): string {
  if (workModel === 'remote') return 'remoto';
  const city = fold(location ?? '')
    .split(/[,\-–|/(]/)[0]!
    .replace(/[^a-z ]+/g, ' ')
    .trim();
  if (REMOTE_PLACE.test(city)) return 'remoto';
  if (city && !COUNTRY_ONLY.test(city)) return city;
  return workModel ?? '';
}

/** `null` quando não há o que comparar (título só com ruído, empresa vazia). */
export function jobFingerprint(job: {
  title: string;
  company: string;
  location: string | null;
  workModel: WorkModel | null;
}): string | null {
  const company = companyKey(job.company);
  const title = titleKey(job.title);
  if (!company || !title) return null;
  return `${company}|${title}|${placeKey(job.location, job.workModel)}`.slice(0, 300);
}
