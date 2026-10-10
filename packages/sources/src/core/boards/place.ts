import { fold } from '../normalize/text';

/**
 * Onde a vaga pode ser feita, do ponto de vista de quem está no Brasil.
 *
 *   brazil       cita o Brasil (país, "Brasil/Brazil" ou cidade brasileira)
 *   remote-open  remota sem país, ou aberta a LATAM/Américas/qualquer lugar
 *   foreign      presencial ou remota restrita a outro país/região
 *   unknown      a vaga não diz nada sobre local
 */
export type PlaceClass = 'brazil' | 'remote-open' | 'foreign' | 'unknown';

export interface PlaceEntry {
  /** Texto do local como a API manda ("São Paulo, Brazil", "Remote - US"). */
  text?: string | null;
  /** País, quando a API informa separado (ISO "BR" ou nome). */
  country?: string | null;
}

export interface PlaceInfo {
  entries: readonly PlaceEntry[];
  /** A API diz que a vaga é remota (campo próprio, não o texto). */
  remote?: boolean | null;
}

const BRAZIL_COUNTRIES = new Set(['br', 'bra', 'brazil', 'brasil']);

const BRAZIL_TEXT = new RegExp(
  '\\b(' +
    [
      'brasil',
      'brazil',
      'sao paulo',
      'rio de janeiro',
      'belo horizonte',
      'curitiba',
      'porto alegre',
      'florianopolis',
      'recife',
      'campinas',
      'brasilia',
      'salvador',
      'fortaleza',
      'goiania',
      'manaus',
      'belem',
      'joinville',
      'blumenau',
      'sao jose dos campos',
      'ribeirao preto',
      'uberlandia',
      'londrina',
      'maringa',
      'joao pessoa',
      'maceio',
      'teresina',
      'aracaju',
      'campo grande',
      'cuiaba',
      'americana',
      'sorocaba',
      'barueri',
      'osasco',
      'alphaville',
      'santo andre',
      'sao bernardo do campo',
      'niteroi',
      'jundiai',
      'piracicaba',
      'juiz de fora',
      'sao carlos',
      'sao leopoldo',
    ].join('|') +
    ')\\b' +
    // Sigla de estado depois de vírgula/hífen: "Campinas, SP". Só siglas que
    // não são também estados dos EUA (SC, PA, MA, AL... ficam de fora).
    '|[,/-]\\s*(sp|rj|mg|rs|df|pe|ce|ba|go)\\b',
);

const REMOTE_TEXT =
  /\b(remote|remoto|remota|anywhere|home office|teletrabalho|work from home|wfh|distributed)\b/;

const OPEN_REGION =
  /\b(latam|latin america|america latina|south america|america do sul|americas|anywhere|worldwide|global|international|internacional)\b/;

/** Palavras que não restringem o local: "Remote (100%)", "Fully Remote - Brazil". */
const NOISE =
  /\b(remote|remoto|remota|fully|full|100|first|friendly|only|work from home|wfh|home office|teletrabalho|distributed|position|job|based|trabalho)\b/g;

function classifyEntry(entry: PlaceEntry, jobIsRemote: boolean): PlaceClass | null {
  const text = fold(entry.text ?? '');
  const country = fold(entry.country ?? '');
  if (!text && !country) return null;

  if (BRAZIL_COUNTRIES.has(country) || BRAZIL_TEXT.test(text)) return 'brazil';

  const remote = jobIsRemote || REMOTE_TEXT.test(text);
  if (OPEN_REGION.test(text)) return 'remote-open';

  if (remote) {
    // País de outro lugar informado separado ("Remote" + endereço nos EUA).
    if (country) return 'foreign';
    // Só sobrou ruído: "Remote", "Remote (100%)", "Fully remote".
    const rest = text
      .replace(NOISE, ' ')
      .replace(/[^a-z]+/g, ' ')
      .trim();
    return rest ? 'foreign' : 'remote-open';
  }

  return 'foreign';
}

const RANK: Record<PlaceClass, number> = { brazil: 3, 'remote-open': 2, unknown: 1, foreign: 0 };

/** Vaga com várias localizações fica com a melhor delas. */
export function classifyPlace(info: PlaceInfo): PlaceClass {
  let best: PlaceClass | null = null;

  for (const entry of info.entries) {
    const result = classifyEntry(entry, info.remote === true);
    if (result && (best === null || RANK[result] > RANK[best])) {
      best = result;
    }
  }

  if (best) return best;
  return info.remote === true ? 'remote-open' : 'unknown';
}
