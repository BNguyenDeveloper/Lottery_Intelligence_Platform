import { RegionCode } from './regions';

const SCHEDULES: Partial<Record<RegionCode, Record<number, string[]>>> = {
  'mien-nam': {
    0: ['tien-giang', 'kien-giang', 'da-lat'],
    1: ['ho-chi-minh', 'dong-thap', 'ca-mau'],
    2: ['ben-tre', 'vung-tau', 'bac-lieu'],
    3: ['dong-nai', 'can-tho', 'soc-trang'],
    4: ['tay-ninh', 'an-giang', 'binh-thuan'],
    5: ['vinh-long', 'binh-duong', 'tra-vinh'],
    6: ['ho-chi-minh', 'long-an', 'binh-phuoc', 'hau-giang'],
  },
  'mien-trung': {
    0: ['khanh-hoa', 'kon-tum'],
    1: ['hue', 'phu-yen'],
    2: ['dak-lak', 'quang-nam'],
    3: ['da-nang', 'khanh-hoa'],
    4: ['binh-dinh', 'quang-tri', 'quang-binh'],
    5: ['gia-lai', 'ninh-thuan'],
    6: ['da-nang', 'quang-ngai', 'dak-nong'],
  },
};

export function getScheduledProvinces(region: RegionCode, date: string): string[] | null {
  const schedule = SCHEDULES[region];
  if (!schedule) {
    return null;
  }

  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return schedule[day] ?? null;
}
