/** Token de quem pede o cálculo das notas pendentes (`ScoreRequester`). */
export const SCORE_REQUESTER = Symbol('SCORE_REQUESTER');

/**
 * Pede "calcule as notas pendentes" — sem esperar. Quem chama (vagas,
 * preferências) segue na hora; a fila `scoring` faz o trabalho depois.
 */
export interface ScoreRequester {
  /** `true` = foi para a fila. Nunca lança: Redis fora do ar vira `false` + aviso. */
  request(reason: string): Promise<boolean>;
}

export const SCORING_JOB_NAME = 'score-stale';
export const SCORING_DEDUP_ID = 'score-stale';

/**
 * Pedidos em sequência viram um cálculo só: o job espera este tempo antes de
 * rodar, e pedidos dentro da janela caem nele. Pedido depois da janela cria
 * outro job — nenhum pedido se perde, mesmo com um cálculo em andamento.
 */
export const SCORING_DEBOUNCE_MS = 500;

/** Vagas por lote. Cada lote é um UPDATE só. */
export const SCORING_BATCH_SIZE = 500;
