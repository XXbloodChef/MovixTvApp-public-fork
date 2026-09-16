/**
 * Devine la langue d'une piste de sous-titres à partir du texte de ses cues.
 *
 * Pour les sous-titres incrustés (CEA-608) : le flux ne dit rien de la langue,
 * hls.js baptise les canaux par convention américaine, et sur Lanterns le
 * « Unknown CC » était le français. On compte les mots-outils les plus fréquents
 * de chaque langue — une poignée de mots très courants suffit, ils sont
 * quasiment disjoints d'une langue à l'autre — et on ne tranche qu'avec une
 * marge nette. Coût : quelques dizaines de chaînes, appelé une fois par
 * intervalle jusqu'à décision. Rien de continu.
 */

export type SniffedLanguage = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

const STOPWORDS: Readonly<Record<SniffedLanguage, readonly string[]>> = Object.freeze({
  fr: ['le', 'la', 'les', 'des', 'une', 'est', 'et', 'que', 'qui', 'pas', 'vous', 'nous', 'je', 'tu', 'il', 'elle', 'ne', 'ce', 'cette', 'mais', 'avec', 'pour', 'dans', 'sur', 'ça', 'ca', 'c\'est', 'j\'ai', 'oui', 'non', 'très', 'tres', 'bien', 'où', 'ou', 'être', 'etre', 'suis', 'était', 'etait', 'ont', 'sont', 'fait', 'moi', 'toi', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'quoi', 'rien', 'tout', 'ici'],
  en: ['the', 'and', 'you', 'that', 'this', 'with', 'for', 'not', 'are', 'was', 'were', 'have', 'has', 'what', 'your', 'from', 'they', 'but', 'his', 'her', 'him', 'she', 'it\'s', 'i\'m', 'don\'t', 'can\'t', 'didn\'t', 'yeah', 'okay', 'just', 'know', 'like', 'get', 'got', 'going', 'gonna', 'about', 'there', 'here', 'right', 'think', 'want', 'would', 'could', 'should', 'we\'re', 'you\'re', 'sir'],
  es: ['el', 'los', 'las', 'una', 'es', 'y', 'que', 'no', 'por', 'para', 'con', 'como', 'pero', 'usted', 'ustedes', 'nosotros', 'yo', 'tú', 'él', 'ella', 'está', 'estoy', 'muy', 'bien', 'aquí', 'ahora', 'también', 'porque', 'nada', 'todo', 'hay', 'tiene', 'tengo', 'quiero', 'sí', 'gracias', 'señor', 'señora', 'esto', 'eso', 'ser', 'hacer'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'du', 'sie', 'wir', 'ihr', 'ein', 'eine', 'einen', 'mit', 'für', 'auf', 'aber', 'auch', 'wie', 'was', 'wenn', 'noch', 'schon', 'hier', 'jetzt', 'ja', 'nein', 'doch', 'mal', 'sehr', 'gut', 'haben', 'habe', 'hat', 'sind', 'war', 'werden', 'kann', 'muss', 'nur', 'noch', 'dich', 'mich'],
  it: ['il', 'lo', 'gli', 'una', 'è', 'e', 'che', 'non', 'per', 'con', 'come', 'ma', 'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'sono', 'sei', 'siamo', 'molto', 'bene', 'qui', 'adesso', 'anche', 'perché', 'perche', 'niente', 'tutto', 'c\'è', 'ho', 'hai', 'voglio', 'sì', 'grazie', 'signore', 'signora', 'questo', 'quello', 'essere', 'fare', 'cosa'],
  pt: ['o', 'os', 'as', 'um', 'uma', 'é', 'e', 'que', 'não', 'nao', 'por', 'para', 'com', 'como', 'mas', 'você', 'voce', 'vocês', 'nós', 'eu', 'ele', 'ela', 'está', 'estou', 'muito', 'bem', 'aqui', 'agora', 'também', 'porque', 'nada', 'tudo', 'tem', 'tenho', 'quero', 'sim', 'obrigado', 'senhor', 'senhora', 'isso', 'isto', 'ser', 'fazer'],
});

const STOPWORD_SETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words)]),
) as Record<SniffedLanguage, Set<string>>;

/** Nombre minimal de mots avant de trancher : en dessous, trop de hasard. */
export const SNIFF_MIN_TOKENS = 80;
/** Le gagnant doit avoir au moins ce nombre de mots-outils… */
export const SNIFF_MIN_HITS = 10;
/** …et cette avance sur le second, sinon on attend d'autres cues. */
export const SNIFF_MIN_LEAD = 1.6;

export interface SniffResult {
  language: SniffedLanguage | null;
  tokens: number;
  scores: Record<SniffedLanguage, number>;
}

const tokenize = (text: string): string[] =>
  text
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}'’]+/gu, ' ')
    .replace(/’/g, '\'')
    .split(' ')
    .filter(word => word.length >= 1);

/**
 * Renvoie la langue quand la marge est nette, `null` sinon. `texts` : le texte
 * brut des cues, dans n'importe quel ordre.
 */
export function sniffCaptionLanguage(texts: readonly string[]): SniffResult {
  const scores = { fr: 0, en: 0, es: 0, de: 0, it: 0, pt: 0 } as Record<SniffedLanguage, number>;
  let tokens = 0;
  for (const text of texts) {
    for (const word of tokenize(text)) {
      tokens += 1;
      for (const lang of Object.keys(scores) as SniffedLanguage[]) {
        if (STOPWORD_SETS[lang].has(word)) scores[lang] += 1;
      }
    }
  }

  if (tokens < SNIFF_MIN_TOKENS) return { language: null, tokens, scores };
  const ranked = (Object.entries(scores) as Array<[SniffedLanguage, number]>).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best[1] < SNIFF_MIN_HITS) return { language: null, tokens, scores };
  if (second[1] > 0 && best[1] < second[1] * SNIFF_MIN_LEAD) return { language: null, tokens, scores };
  return { language: best[0], tokens, scores };
}
