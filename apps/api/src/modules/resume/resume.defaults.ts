import type { ResumeItemData, ResumeSectionKind } from '@busca-vagas/shared';

interface DefaultSection {
  title: string;
  kind: ResumeSectionKind;
  items: ResumeItemData[];
}

const fields = (...labels: string[]): ResumeItemData[] =>
  labels.map((label) => ({ label, value: '' }));

/**
 * Seções criadas no primeiro acesso. Os campos vêm vazios, como modelo para
 * preencher. "Respostas prontas" junta as perguntas que mais se repetem nos
 * formulários de candidatura brasileiros.
 */
export const DEFAULT_RESUME_SECTIONS: readonly DefaultSection[] = [
  {
    title: 'Dados pessoais',
    kind: 'fields',
    items: fields('Nome completo', 'Data de nascimento', 'Cidade/UF'),
  },
  { title: 'Contato', kind: 'fields', items: fields('E-mail', 'Telefone/WhatsApp') },
  { title: 'Links', kind: 'fields', items: fields('LinkedIn', 'GitHub', 'Portfólio') },
  { title: 'Resumo profissional', kind: 'text', items: [{ text: '' }] },
  { title: 'Experiência', kind: 'entries', items: [] },
  { title: 'Formação', kind: 'entries', items: [] },
  { title: 'Projetos', kind: 'entries', items: [] },
  {
    title: 'Competências',
    kind: 'fields',
    items: fields('Linguagens', 'Frameworks', 'Banco de dados', 'Ferramentas'),
  },
  { title: 'Idiomas', kind: 'fields', items: fields('Inglês') },
  { title: 'Cursos e certificações', kind: 'entries', items: [] },
  {
    title: 'Respostas prontas',
    kind: 'fields',
    items: fields(
      'Pretensão salarial (CLT)',
      'Pretensão salarial (PJ)',
      'Disponibilidade para início',
      'Modelo de trabalho preferido',
      'Por que quero trabalhar aqui',
    ),
  },
];
