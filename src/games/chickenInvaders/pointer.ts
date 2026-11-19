import { FIELD } from './config'

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** Musens skærmposition i banens logiske koordinater; skærm-elementet har altid banens format. */
export function pointerToField(clientX: number, clientY: number, rect: ScreenRect): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((clientX - rect.left) * FIELD.width) / rect.width,
    y: ((clientY - rect.top) * FIELD.height) / rect.height,
  }
}
