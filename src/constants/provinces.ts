import { RegionCode } from './regions';

export interface ProvinceConfig {
  code: string;
  name: string;
  region: RegionCode;
  sourcePath?: string;
  aliases?: string[];
}

export const PROVINCES: ProvinceConfig[] = [
  { code: 'xsmb', name: 'Mien Bac', region: 'mien-bac', sourcePath: 'xsmb' },
  { code: 'ha-noi', name: 'Ha Noi', region: 'mien-bac' },
  { code: 'binh-dinh', name: 'Binh Dinh', region: 'mien-trung', aliases: ['Binh Dinh'] },
  { code: 'da-nang', name: 'Da Nang', region: 'mien-trung' },
  { code: 'dak-nong', name: 'Dak Nong', region: 'mien-trung', aliases: ['Dac Nong', 'Dak Nong'] },
  { code: 'gia-lai', name: 'Gia Lai', region: 'mien-trung' },
  { code: 'khanh-hoa', name: 'Khanh Hoa', region: 'mien-trung' },
  { code: 'kon-tum', name: 'Kon Tum', region: 'mien-trung' },
  { code: 'ninh-thuan', name: 'Ninh Thuan', region: 'mien-trung' },
  { code: 'phu-yen', name: 'Phu Yen', region: 'mien-trung' },
  { code: 'quang-binh', name: 'Quang Binh', region: 'mien-trung' },
  { code: 'quang-nam', name: 'Quang Nam', region: 'mien-trung' },
  { code: 'quang-ngai', name: 'Quang Ngai', region: 'mien-trung' },
  { code: 'quang-tri', name: 'Quang Tri', region: 'mien-trung' },
  { code: 'dak-lak', name: 'Dak Lak', region: 'mien-trung', aliases: ['Dac Lac', 'Dak Lak'] },
  { code: 'hue', name: 'Hue', region: 'mien-trung', aliases: ['Hue', 'Thua Thien Hue'] },
  { code: 'an-giang', name: 'An Giang', region: 'mien-nam' },
  { code: 'bac-lieu', name: 'Bac Lieu', region: 'mien-nam' },
  { code: 'ben-tre', name: 'Ben Tre', region: 'mien-nam' },
  { code: 'binh-duong', name: 'Binh Duong', region: 'mien-nam' },
  { code: 'binh-phuoc', name: 'Binh Phuoc', region: 'mien-nam' },
  { code: 'binh-thuan', name: 'Binh Thuan', region: 'mien-nam' },
  { code: 'ca-mau', name: 'Ca Mau', region: 'mien-nam' },
  { code: 'can-tho', name: 'Can Tho', region: 'mien-nam' },
  { code: 'da-lat', name: 'Da Lat', region: 'mien-nam', aliases: ['Da Lat', 'Lam Dong'] },
  { code: 'dong-nai', name: 'Dong Nai', region: 'mien-nam' },
  { code: 'dong-thap', name: 'Dong Thap', region: 'mien-nam' },
  { code: 'hau-giang', name: 'Hau Giang', region: 'mien-nam' },
  { code: 'ho-chi-minh', name: 'Ho Chi Minh', region: 'mien-nam', aliases: ['Ho Chi Minh', 'HCM', 'TPHCM', 'TP HCM', 'TP. HCM', 'TP Ho Chi Minh'] },
  { code: 'kien-giang', name: 'Kien Giang', region: 'mien-nam' },
  { code: 'long-an', name: 'Long An', region: 'mien-nam' },
  { code: 'soc-trang', name: 'Soc Trang', region: 'mien-nam' },
  { code: 'tay-ninh', name: 'Tay Ninh', region: 'mien-nam' },
  { code: 'tien-giang', name: 'Tien Giang', region: 'mien-nam' },
  { code: 'tra-vinh', name: 'Tra Vinh', region: 'mien-nam' },
  { code: 'vinh-long', name: 'Vinh Long', region: 'mien-nam' },
  { code: 'vung-tau', name: 'Vung Tau', region: 'mien-nam' },
];

export function getProvince(code: string): ProvinceConfig | undefined {
  return PROVINCES.find((province) => province.code === code);
}

export function getProvincesByRegion(region: RegionCode): ProvinceConfig[] {
  return PROVINCES.filter((province) => province.region === region);
}

export function normalizeProvinceName(name: string): string {
  return name
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getProvinceByDisplayName(name: string, region?: RegionCode): ProvinceConfig | undefined {
  const normalized = normalizeProvinceName(name);

  return PROVINCES.find((province) => {
    if (region && province.region !== region) {
      return false;
    }

    const names = [province.name, province.code, ...(province.aliases ?? [])];
    return names.some((candidate) => normalizeProvinceName(candidate) === normalized);
  });
}
