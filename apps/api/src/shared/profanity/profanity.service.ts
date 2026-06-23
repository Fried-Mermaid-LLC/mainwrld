import { Injectable } from '@nestjs/common';
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

// Profanity filter (server). Ported from functions/src/profanity.ts. obscenity
// catches the curated English profanity set plus common obfuscation while
// avoiding the Scunthorpe problem. This is the authoritative profanity layer,
// run regardless of whether the OpenAI key is configured; OpenAI separately
// handles hate/harassment/sexual/violent content.
@Injectable()
export class ProfanityService {
  private readonly matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
  });

  contains(text?: string | null): boolean {
    return !!text && this.matcher.hasMatch(text);
  }
}
