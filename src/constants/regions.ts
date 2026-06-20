export const REGIONS = ['mien-bac', 'mien-trung', 'mien-nam'] as const;

export type RegionCode = (typeof REGIONS)[number];
