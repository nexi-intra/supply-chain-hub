import type { LocationList, MapMaterial } from '@/types/warehouse'

// Shared builders for the map/peek tests.
type Place = LocationList['locations'][number]
export const place = (name: string, extra: Partial<Place> = {}): Place => ({
  id: `id-${name}`, name, area: 'A', type: 'Palle', purpose: 'reserve', capacity: 1, fixedMaterials: [], active: true, note: '',
  updatedAt: 0, updatedBy: { email: '', name: '' }, used: 0, stockCount: 0, ...extra,
})
export const m = (material: string, extra: Partial<MapMaterial> = {}): MapMaterial => ({ material, description: '', pallets: 0, quantity: null, oldestAt: null, fixed: false, ...extra })
