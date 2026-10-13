import type { InterviewCategory } from '@busca-vagas/shared';

export interface InterviewSeed {
  question: string;
  category: InterviewCategory;
  tags?: string[];
}

/**
 * Perguntas comuns em entrevistas de dev júnior no Brasil, sem resposta —
 * entram uma vez só (flag `interview-seeds`), e você apaga as que não quiser.
 * Plano: docs/features/15-interview-questions.md
 */
export const INTERVIEW_SEEDS: readonly InterviewSeed[] = [
  // RH
  { category: 'hr', question: 'Fale um pouco sobre você.' },
  { category: 'hr', question: 'Por que você quer trabalhar aqui?' },
  { category: 'hr', question: 'Por que você está saindo (ou saiu) do emprego atual?' },
  { category: 'hr', question: 'Qual é a sua pretensão salarial?', tags: ['salário'] },
  { category: 'hr', question: 'Onde você se vê daqui a cinco anos?' },
  { category: 'hr', question: 'Qual é a sua disponibilidade para começar?' },
  { category: 'hr', question: 'Quais são os seus pontos fortes?' },
  { category: 'hr', question: 'Em que ponto você está trabalhando para melhorar?' },
  {
    category: 'hr',
    question: 'Você prefere trabalhar remoto, híbrido ou presencial? Por quê?',
    tags: ['modalidade'],
  },
  { category: 'hr', question: 'Você tem alguma pergunta para nós?' },

  // Comportamental (boas para STAR)
  {
    category: 'behavioral',
    question: 'Conte de uma vez em que você errou num projeto e o que fez depois.',
    tags: ['erro'],
  },
  {
    category: 'behavioral',
    question: 'Fale de um conflito com um colega e de como vocês resolveram.',
    tags: ['conflito', 'time'],
  },
  {
    category: 'behavioral',
    question: 'Conte de um prazo apertado e de como você se organizou.',
    tags: ['prazo'],
  },
  { category: 'behavioral', question: 'Descreva um problema difícil que você resolveu.' },
  {
    category: 'behavioral',
    question: 'Conte de uma vez em que você precisou aprender uma tecnologia rápido.',
    tags: ['aprendizado'],
  },
  { category: 'behavioral', question: 'Como você lida com feedback negativo?', tags: ['feedback'] },
  { category: 'behavioral', question: 'Fale de um projeto do qual você se orgulha.' },
  {
    category: 'behavioral',
    question: 'Conte de uma vez em que você discordou de uma decisão técnica.',
    tags: ['conflito'],
  },

  // Técnica
  {
    category: 'technical',
    question: 'Qual a diferença entre banco relacional (SQL) e NoSQL? Quando usar cada um?',
    tags: ['sql', 'banco de dados'],
  },
  {
    category: 'technical',
    question: 'O que acontece quando você digita uma URL no navegador e aperta Enter?',
    tags: ['web', 'http'],
  },
  {
    category: 'technical',
    question: 'O que é uma API REST? Quais são os principais métodos e status HTTP?',
    tags: ['api', 'http'],
  },
  {
    category: 'technical',
    question: 'Qual a diferença entre autenticação e autorização? Como funciona um login com JWT?',
    tags: ['segurança', 'jwt'],
  },
  {
    category: 'technical',
    question: 'O que é um índice no banco de dados? Quando ele atrapalha?',
    tags: ['sql', 'banco de dados'],
  },
  {
    category: 'technical',
    question:
      'Como funcionam useState e useEffect no React? Quando o componente renderiza de novo?',
    tags: ['react'],
  },
  {
    category: 'technical',
    question: 'Como você testa o seu código? Quais tipos de teste você conhece?',
    tags: ['testes'],
  },
  {
    category: 'technical',
    question: 'Qual a diferença entre git merge e git rebase?',
    tags: ['git'],
  },
  {
    category: 'technical',
    question: 'Explique Promises e async/await em JavaScript.',
    tags: ['javascript'],
  },
  {
    category: 'technical',
    question: 'Uma rota da API ficou lenta. Como você investigaria?',
    tags: ['performance', 'api'],
  },
  {
    category: 'technical',
    question: 'O que é Docker e por que usar containers?',
    tags: ['docker'],
  },
  {
    category: 'technical',
    question: 'Explique os princípios SOLID com um exemplo do seu código.',
    tags: ['arquitetura'],
  },

  // Sobre a empresa
  { category: 'company', question: 'O que você sabe sobre a nossa empresa e o nosso produto?' },
  { category: 'company', question: 'Como você acha que pode contribuir com o time?' },
];
