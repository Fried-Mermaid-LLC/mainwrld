export const ACCENT_COLOR = '#eb6871';
export const WORLD_RADIUS = 50;
export const MAX_LIBRARY_SIZE = 35;
export const MIN_WORD_COUNT = 150;
export const MAX_DAILY_EARNED_POINTS = 25;
export const COMMENT_LIKES_THRESHOLD = 50;
export const CHAPTER_LIKES_THRESHOLD = 10;
export const MAX_DAILY_CHAPTERS = 7;
export const MAX_WORD_COUNT = 11000;
export const GENRE_LIST = ['Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Dystopian', 'Fantasy', 'Action', 'Drama', 'Western', 'Fiction', 'Non-Fiction', 'Thriller', 'FanFic', 'Poetry', 'Religious', 'Erotica', 'LGBTQ+', 'Self-Help', 'Sports'];
export const ADMIN_USERNAMES = ['admin', 'mochamattel'];

export const BAD_WORDS = ['fuck','dick','cock','bastard','slut','cunt','nigger','nigga','n1gger','nigg3r','fag','faggot','retard','rape','penis','vagina','anal','porn','hentai','cum','jizz','sex','xxx','tits','kys','kms','stfu'];
export const containsBadWord = (text: string): boolean => {
  const lower = text.toLowerCase().replace(/[^a-z]/g, '');
  return BAD_WORDS.some(word => lower.includes(word));
};

export const SKIN_TONE_COLORS: Record<string, string> = {
  A1: '#FDDCC4', A2: '#F2C4A0', A3: '#D9A87C', A4: '#C68E5B', A5: '#A0714A', A5_5: '#9B6B45', A6: '#7A5539', A7: '#4A3228',
  B1: '#FDDCC4', B2: '#F2C4A0', B3: '#D9A87C', B4: '#C68E5B', B5: '#A0714A', B5_5: '#9B6B45', B6: '#7A5539', B7: '#4A3228',
};

export default {
  ACCENT_COLOR,
  WORLD_RADIUS,
  MAX_LIBRARY_SIZE,
  MIN_WORD_COUNT,
  MAX_DAILY_EARNED_POINTS,
  COMMENT_LIKES_THRESHOLD,
  CHAPTER_LIKES_THRESHOLD,
  MAX_DAILY_CHAPTERS,
  MAX_WORD_COUNT,
  GENRE_LIST,
  ADMIN_USERNAMES,
  BAD_WORDS,
  containsBadWord,
  SKIN_TONE_COLORS,
};