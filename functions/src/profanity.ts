import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

// Profanity filter (server). Mirrors src/config/profanity.ts (functions/ cannot
// import from src/). obscenity catches the curated English profanity set plus
// common obfuscation while avoiding the Scunthorpe problem. This is the
// authoritative profanity layer, run inside the moderate triggers/callable
// regardless of whether the OpenAI key is configured; OpenAI separately handles
// hate/harassment/sexual/violent content.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

export const containsProfanity = (text?: string | null): boolean =>
  !!text && matcher.hasMatch(text)
