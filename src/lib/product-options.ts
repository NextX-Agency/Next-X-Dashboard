import { variantLabel } from './store-messages';

/**
 * How a variant is named and drawn for customers. Variants carry free-form structured attributes
 * (`{ colour: "Black", connector: "3.5mm" }`); nothing here assumes a fixed set of option types.
 */

const COLOUR_KEYS = ['colour', 'color', 'kleur'];

const SWATCHES: Record<string, string> = {
  black: '#16181b',
  white: '#f8f8f6',
  silver: '#c4c8cc',
  grey: '#8b9097',
  gray: '#8b9097',
  'space grey': '#5b5f66',
  graphite: '#3c4046',
  gold: '#cfa94a',
  rose: '#e3b5b0',
  'rose gold': '#d9a79c',
  red: '#cf3a3a',
  orange: '#ee7a2c',
  yellow: '#efcc3f',
  green: '#3f9a5f',
  teal: '#2a9d9d',
  blue: '#2f6fd1',
  navy: '#1f3563',
  purple: '#7b4fb8',
  violet: '#7b4fb8',
  pink: '#e58ab3',
  brown: '#7a5338',
  beige: '#d8c7a8',
  bronze: '#a9743e',
  transparent: '#e8ecef',
  clear: '#e8ecef',
};

/** The option's colour name, when the variant has a colour attribute. */
export function colourName(attributes: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(attributes)) {
    if (COLOUR_KEYS.includes(key.toLowerCase()) && value.trim()) return value.trim();
  }
  return null;
}

/** A display colour for a named colour, or null when the name is not one we can draw honestly. */
export function swatchColour(name: string | null): string | null {
  if (!name) return null;
  return SWATCHES[name.trim().toLowerCase()] ?? null;
}

/** What to call the option: a meaningful variant name, else its attribute values, else null. */
export function optionName(variant: {
  name: string;
  attributes: Record<string, string>;
}): string | null {
  const named = variantLabel(variant.name);
  if (named) return named;
  const values = Object.values(variant.attributes).filter((value) => value.trim());
  return values.length ? values.join(' · ') : null;
}

/** The heading over the selector: "Colour" when every option is a colour, else a neutral "Option". */
export function optionLegend(variants: { attributes: Record<string, string> }[]): string {
  return variants.length > 0 && variants.every((variant) => colourName(variant.attributes))
    ? 'Colour'
    : 'Option';
}
