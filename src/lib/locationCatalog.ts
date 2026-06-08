export type PublicCatalogType = 'audio' | 'watches'
export type LocationCatalogType = PublicCatalogType | 'all'

export const LOCATION_CATALOG_OPTIONS: Array<{ value: LocationCatalogType; label: string; description: string }> = [
  {
    value: 'all',
    label: 'Audio + Watches',
    description: 'Use this location on both public catalogs.',
  },
  {
    value: 'audio',
    label: 'Audio only',
    description: 'Use this location only on the audio catalog.',
  },
  {
    value: 'watches',
    label: 'Watches only',
    description: 'Use this location only on the watches catalog.',
  },
]

export const LOCATION_CATALOG_LABELS: Record<LocationCatalogType, string> = {
  all: 'Audio + Watches',
  audio: 'Audio',
  watches: 'Watches',
}

export function getLocationCatalogFilter(catalogType: PublicCatalogType): LocationCatalogType[] {
  return [catalogType, 'all']
}

export function normalizeLocationCatalogType(value: string | null | undefined): LocationCatalogType {
  return value === 'audio' || value === 'watches' || value === 'all' ? value : 'all'
}
