import type { Warning } from '../calc';
import type { DensityUnit, SalinityUnit, Species } from '../store/settings';

export const SAL_UNIT: Record<SalinityUnit, string> = { permille: '‰', psu: 'PSU', ppt: 'ppt' };
export const DENSITY_UNIT: Record<DensityUnit, string> = { gcm3: 'г/см³', kgm3: 'кг/м³' };

export const WARNING_TEXT: Record<Warning, string> = {
  'reading-out-of-scale': 'Показание вне шкалы ареометра 1.000–1.040',
  'temperature-out-of-range': 'Температура вне диапазона расчёта 0–40 °C',
  'outside-green-zone': 'Вне зелёной зоны ареометра (20–28 °C), точность ниже',
  'salinity-below-zero': 'Плотность ниже пресной воды — проверьте показание и шкалу',
  'salinity-above-eos80': 'Солёность выше 42 ‰ — за пределами применимости EOS-80',
};

export const SPECIES_NAME: Record<Species, string> = {
  shark: 'Акула',
  hammerhead: 'Акула-молот',
  ray: 'Скат',
  clownfish: 'Рыбы-клоуны',
  turtle: 'Черепаха',
  moray: 'Мурена',
};
