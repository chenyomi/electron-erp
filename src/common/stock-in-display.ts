/** 入库行：成品计入成品库存，原材料只计材料 */
export function getStockInKind(row: Record<string, any>): 'finished' | 'material' {
  if (Number(row?.counts_inventory ?? 1) === 0) return 'material'
  const productName = String(row?.product_name || '').trim()
  const productQty = Number(row?.quantity || 0)
  const materialQty = Number(row?.material_quantity || 0)
  if (materialQty > 0 && !productName && productQty <= 0) return 'material'
  return 'finished'
}

export function isStockInMaterialRow(row: Record<string, any>): boolean {
  return getStockInKind(row) === 'material'
}

/** 列表供应商列：无供应商的成品入库显示「自加工」 */
export function getStockInSupplierDisplay(row: Record<string, any>, selfProcessedLabel = '自加工'): string {
  const name = String(row?.supplier_name || '').trim()
  if (name) return name
  if (getStockInKind(row) === 'finished') return selfProcessedLabel
  return ''
}

/** 成品行产品列优先品名；原材料行优先材料名 */
export function getStockInProductDisplay(row: Record<string, any>): string {
  if (isStockInMaterialRow(row)) {
    return String(row?.material_name || row?.product_name || '').trim()
  }
  return String(row?.product_name || '').trim()
}

export function getStockInSpecDisplay(row: Record<string, any>): string {
  if (isStockInMaterialRow(row)) {
    return String(row?.material_spec || row?.spec || '').trim()
  }
  return String(row?.spec || '').trim()
}

export function getStockInUnitDisplay(row: Record<string, any>): string {
  if (isStockInMaterialRow(row)) {
    return String(row?.material_unit || row?.unit || '').trim()
  }
  return String(row?.unit || '').trim()
}

export function getStockInQuantityDisplay(row: Record<string, any>): number {
  if (isStockInMaterialRow(row)) return Number(row?.material_quantity || 0)
  return Number(row?.quantity || 0)
}

export function getStockInUnitPriceDisplay(row: Record<string, any>): number {
  if (isStockInMaterialRow(row)) return Number(row?.material_unit_price || 0)
  return Number(row?.unit_price || 0)
}
