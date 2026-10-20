import { describe, expect, it, vi } from 'vitest';
import type { EmailConfig } from './email.config';

/**
 * ImapFlow falso: o socket cai DEPOIS do connect() (evento 'error'), e o
 * comando em andamento só termina quando alguém fecha o cliente.
 */
vi.mock('imapflow', async () => {
  // vi.mock sobe para o topo do arquivo: o import tem que vir aqui dentro.
  const { EventEmitter } = await import('node:events');
  class FakeImapFlow extends EventEmitter {
    private pending: ((error: Error) => void) | null = null;
    async connect() {}
    mailboxOpen() {
      setTimeout(() =>
        this.emit('error', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
      );
      return new Promise((_, reject) => {
        this.pending = reject;
      });
    }
    close() {
      this.pending?.(new Error('Connection not available'));
      this.pending = null;
    }
    async logout() {}
  }
  return { ImapFlow: FakeImapFlow };
});

const { imapReader } = await import('./mailbox');

const config = {
  host: 'imap.example.com',
  port: 993,
  user: 'eu@example.com',
  password: 'segredo',
  folder: 'BuscaVagas',
} as EmailConfig;

describe('imapReader', () => {
  it('erro de socket depois de conectar vira mensagem em PT-BR, sem derrubar o processo', async () => {
    await expect(
      imapReader(config, {
        since: new Date('2026-10-01T00:00:00Z'),
        known: new Set(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Não consegui conectar em imap.example.com:993 (ETIMEDOUT).');
  });
});
