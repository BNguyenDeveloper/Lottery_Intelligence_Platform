import { PROVINCES } from '../constants/provinces';
import { REGIONS, RegionCode } from '../constants/regions';

export function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export function assertRegion(region: string): asserts region is RegionCode {
  if (!REGIONS.includes(region as RegionCode)) {
    throw new Error(`Unsupported region "${region}". Supported regions: ${REGIONS.join(', ')}`);
  }
}

export function assertProvince(province: string): void {
  if (!PROVINCES.some((item) => item.code === province)) {
    throw new Error(`Unsupported province "${province}". Add it to src/constants/provinces.ts if needed.`);
  }
}
