import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

// Profanity filter (client). obscenity catches the curated English profanity
// set plus common obfuscation (f*ck, fuuuck, sh1t) while avoiding the
// Scunthorpe problem (grape, Sussex, analysis, assassin are NOT matched). This
// is the profanity layer; OpenAI moderation (server-side) separately handles
// hate/harassment/sexual/violent content. The matcher is built once at module
// load. To tune what is blocked, customize the dataset here.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

export const containsProfanity = (text?: string | null): boolean =>
  !!text && matcher.hasMatch(text)
