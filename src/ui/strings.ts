import type { Warning } from '../calc';
import type { DensityUnit, MosaicPalette, SalinityUnit, Species } from '../store/settings';

export const SAL_UNIT: Record<SalinityUnit, string> = { permille: '‰', psu: 'PSU', ppt: 'ppt' };
export const DENSITY_UNIT: Record<DensityUnit, string> = { gcm3: 'г/см³', kgm3: 'кг/м³' };

export const WARNING_TEXT: Record<Warning, string> = {
  'reading-out-of-scale': 'показание вне шкалы ареометра 1.000–1.040',
  'temperature-out-of-range': 'температура вне диапазона расчёта 0–40 °C',
  'outside-green-zone': 'вне зелёной зоны ареометра 20–28 °C — точность ниже',
  'salinity-below-zero': 'плотность ниже пресной воды — проверьте показание и шкалу',
  'salinity-above-eos80': 'солёность выше 42 ‰ — за пределами применимости EOS-80',
};

export const SPECIES_NAME: Record<Species, string> = {
  shark: 'акула',
  hammerhead: 'акула-молот',
  ray: 'скат',
  moray: 'мурена',
  school: 'стайка',
};

export const PALETTE_NAME: Record<MosaicPalette, string> = {
  slate: 'сланец',
  warm: 'тёплый камень',
  mixed: 'смешанная',
};

export const CATEGORY_EXAMPLES = ['Коллектор 6-17', 'Дисплей 120 л', 'Карантин'];
