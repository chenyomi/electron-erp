export type SupplierType = 'material' | 'outsourcing'

export const SUPPLIER_TYPE_MATERIAL: SupplierType = 'material'
export const SUPPLIER_TYPE_OUTSOURCING: SupplierType = 'outsourcing'

export function normalizeSupplierType(value: unknown): SupplierType {
  const raw = String(value || '').trim()
  if (raw === 'material' || raw === '原材料') return SUPPLIER_TYPE_MATERIAL
  if (raw === 'outsourcing' || raw === '外协加工') return SUPPLIER_TYPE_OUTSOURCING
  return SUPPLIER_TYPE_OUTSOURCING
}

export function isMaterialSupplierType(value: unknown): boolean {
  return normalizeSupplierType(value) === SUPPLIER_TYPE_MATERIAL
}

export function isOutsourcingSupplierType(value: unknown): boolean {
  return normalizeSupplierType(value) === SUPPLIER_TYPE_OUTSOURCING
}

export function stockInCountsInventoryForSupplierType(supplierType: SupplierType): boolean {
  // 原材料供应商只增加材料库存；外协加工才增加成品库存。
  return supplierType === SUPPLIER_TYPE_OUTSOURCING
}

export function supplierTypeLabelKey(type: SupplierType): string {
  return type === SUPPLIER_TYPE_MATERIAL ? 'supplierTypeMaterial' : 'supplierTypeOutsourcing'
}
