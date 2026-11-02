/** "1 map", "2 maps": `plural(1, 'map')` -> '1 map', `plural(3, 'mode')` -> '3 modes', irregulars via `plural(2, 'person', 'people')`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
