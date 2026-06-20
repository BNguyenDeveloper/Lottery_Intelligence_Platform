export const PRIZES = ['db', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'] as const;

export type PrizeCode = (typeof PRIZES)[number];
