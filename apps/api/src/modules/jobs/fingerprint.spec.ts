import { describe, expect, it } from 'vitest';
import { companyKey, jobFingerprint, placeKey, titleKey } from './fingerprint';

const job = (overrides: Partial<Parameters<typeof jobFingerprint>[0]> = {}) => ({
  title: 'Desenvolvedor(a) Full Stack Júnior',
  company: 'Acme Tecnologia Ltda',
  location: 'Campinas, SP',
  workModel: 'hybrid' as const,
  ...overrides,
});

describe('impressão digital da vaga', () => {
  it('empresa: sem sufixo societário, acento, pontuação nem espaço', () => {
    expect(companyKey('Acme Tecnologia Ltda.')).toBe('acmetecnologia');
    expect(companyKey('ACME Tecnologia S/A')).toBe('acmetecnologia');
    expect(companyKey('Stark Bank')).toBe(companyKey('Starkbank'));
    expect(companyKey('Itaú Unibanco S.A.')).toBe('itauunibanco');
  });

  it('título: sem gênero, código, modalidade nem ruído', () => {
    expect(titleKey('Desenvolvedor(a) Full Stack Júnior')).toBe('desenvolvedor full stack junior');
    expect(titleKey('Desenvolvedor/a Full-Stack Júnior - Remoto')).toBe(
      'desenvolvedor full stack junior',
    );
    expect(titleKey('[REQ-1234] Desenvolvedor Full Stack Júnior')).toBe(
      'desenvolvedor full stack junior',
    );
    expect(titleKey('Vaga: Desenvolvedor Full Stack Júnior #55123')).toBe(
      'desenvolvedor full stack junior',
    );
    // O que diferencia a vaga continua lá.
    expect(titleKey('Desenvolvedor C# Pleno')).toBe('desenvolvedor c# pleno');
    expect(titleKey('Desenvolvedor Full Stack Pleno')).not.toBe(
      titleKey('Desenvolvedor Full Stack Júnior'),
    );
  });

  it('lugar: cidade, "remoto" ou a modalidade', () => {
    expect(placeKey('Campinas, SP', 'hybrid')).toBe('campinas');
    expect(placeKey('Campinas - São Paulo, Brazil', null)).toBe('campinas');
    expect(placeKey('São Paulo', 'onsite')).toBe('sao paulo');
    expect(placeKey('Remote - Brazil', null)).toBe('remoto');
    expect(placeKey('Campinas, SP', 'remote')).toBe('remoto');
    expect(placeKey('Brasil', 'hybrid')).toBe('hybrid');
    expect(placeKey(null, null)).toBe('');
  });

  it('a mesma vaga em duas fontes tem a mesma impressão; outra cidade, não', () => {
    const gupy = jobFingerprint(job());
    expect(gupy).toBe('acmetecnologia|desenvolvedor full stack junior|campinas');
    expect(
      jobFingerprint(
        job({
          title: 'Desenvolvedor Full Stack Júnior (REQ 2231)',
          company: 'ACME TECNOLOGIA',
          location: 'Campinas - São Paulo, Brazil',
          workModel: null,
        }),
      ),
    ).toBe(gupy);
    expect(jobFingerprint(job({ location: 'Sorocaba, SP' }))).not.toBe(gupy);
  });

  it('sem título ou empresa que sobrem, não há impressão', () => {
    expect(jobFingerprint(job({ title: 'Vaga urgente' }))).toBeNull();
    expect(jobFingerprint(job({ company: 'Ltda.' }))).toBeNull();
  });
});
