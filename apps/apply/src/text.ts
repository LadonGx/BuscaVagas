/** Sem acento, minúsculas, pontuação vira espaço: para comparar rótulos. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9@+#]+/g, ' ')
    .trim();
}

/** Palavras que não dizem do que é a pergunta. */
const STOPWORDS = new Set(
  (
    'a o as os e de da do das dos em no na nos nas um uma para pra por com sem que qual quais ' +
    'quando como seu sua seus suas voce voces ja tem ter e ou se ao aos me mim meu minha ' +
    'the of to in on for and or your you do is are what which'
  ).split(' '),
);

/** Começo da palavra, para "quero" casar com "quer" e "salarial" com "salario". */
const stem = (word: string) => word.slice(0, 4);

/** As palavras que contam de um rótulo, já reduzidas. */
export function keywords(text: string): string[] {
  return [...new Set(fold(text).split(' '))]
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
}
