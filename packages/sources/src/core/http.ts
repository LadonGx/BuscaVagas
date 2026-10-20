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
  /**
   * Para links de qualquer site: segue os redirecionamentos um a um (no máximo
   * MAX_REDIRECTS) e só vai para o próximo endereço se ele passar aqui. Senão
   * lança `RedirectBlockedError` sem acessar o destino.
   */
  allowRedirect?: (url: string) => boolean;
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

/** O link redirecionou para um endereço que `allowRedirect` recusou. */
export class RedirectBlockedError extends HttpError {
  constructor(
    url: string,
    readonly location: string,
  ) {
    super('Redirecionamento para um endereço não permitido', url);
    this.name = 'RedirectBlockedError';
  }
}

export const MAX_REDIRECTS = 5;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export const DEFAULT_USER_AGENT = 'busca-vagas/0.1 (+https://github.com/LadonGx/busca-vagas)';
const DEFAULT_TIMEOUT_MS = 15_000;
/** Board grande do Greenhouse, com descrições, passa de 4 MB. */
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

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

    const signal = AbortSignal.any(signals);
    const send = async (target: string, redirect: 'follow' | 'manual') => {
      try {
        return await fetchImpl(target, {
          headers: { 'User-Agent': userAgent, Accept: accept, ...options.headers },
          signal,
          redirect,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new HttpError(`Falha de rede: ${reason}`, url);
      }
    };

    let response: Response;
    const allow = options.allowRedirect;
    if (!allow) {
      response = await send(url, 'follow');
    } else {
      // Um salto por vez: cada destino passa por `allowRedirect` ANTES de ser acessado.
      let current = url;
      response = await send(current, 'manual');
      for (let hops = 0; REDIRECT_STATUS.has(response.status); hops += 1) {
        const location = response.headers.get('location');
        if (!location) break;
        await response.body?.cancel().catch(() => undefined);
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new HttpError('Redirecionamento para um endereço inválido', url);
        }
        if (!/^https?:$/.test(next.protocol) || !allow(next.toString())) {
          throw new RedirectBlockedError(url, next.toString());
        }
        if (hops >= MAX_REDIRECTS) {
          throw new HttpError(`Mais de ${MAX_REDIRECTS} redirecionamentos`, url);
        }
        current = next.toString();
        response = await send(current, 'manual');
      }
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
