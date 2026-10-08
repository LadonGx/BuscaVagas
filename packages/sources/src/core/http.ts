/**
 * Cliente HTTP usado pelas fontes.
 *
 * Centraliza o que nenhuma fonte deve reimplementar: User-Agent honesto,
 * prazo, teto de tamanho da resposta e erro com o status. As fontes recebem
 * o cliente pelo contexto, o que também permite trocá-lo por um falso nos
 * testes — nenhum teste de fonte acessa a rede.
 */

export interface HttpRequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface HttpClient {
  getJson(url: string, options?: HttpRequestOptions): Promise<unknown>;
  getText(url: string, options?: HttpRequestOptions): Promise<string>;
}

export interface HttpClientConfig {
  userAgent?: string;
  timeoutMs?: number;
  /** Respostas maiores que isto são abortadas. */
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const DEFAULT_USER_AGENT = 'busca-vagas/0.1 (+https://github.com/LadonGx/busca-vagas)';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function request(url: string, accept: string, options: HttpRequestOptions = {}) {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (options.signal) {
      signals.push(options.signal);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: accept, ...options.headers },
        signal: AbortSignal.any(signals),
        redirect: 'follow',
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new HttpError(`Falha de rede: ${reason}`, url);
    }

    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status}`, url, response.status);
    }

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      throw new HttpError(`Resposta de ${declared} bytes passa do teto de ${maxBytes}`, url);
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > maxBytes) {
      throw new HttpError(`Resposta de ${body.byteLength} bytes passa do teto de ${maxBytes}`, url);
    }

    return new TextDecoder().decode(body);
  }

  return {
    async getJson(url, options) {
      const text = await request(url, 'application/json', options);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new HttpError('Resposta não é JSON válido', url);
      }
    },
    getText(url, options) {
      return request(url, 'text/html,application/xhtml+xml,text/plain', options);
    },
  };
}
