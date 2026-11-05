import { Box3, Ray, Sphere, Vector3 } from 'three'

export interface MovingCircle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export interface CollisionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CircleRectHit {
  time: number
  normal: { x: number; y: number }
  x: number
  y: number
}

const OVERLAP_EPSILON = 0.0001

export function sweepCircleRect(circle: MovingCircle, rect: CollisionRect, seconds: number): CircleRectHit | null {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const closestX = Math.max(rect.x, Math.min(circle.x, right))
  const closestY = Math.max(rect.y, Math.min(circle.y, bottom))
  const offsetX = circle.x - closestX
  const offsetY = circle.y - closestY
  const distanceSquared = offsetX * offsetX + offsetY * offsetY
  const radiusSquared = circle.radius * circle.radius
  const isOverlapping = distanceSquared < radiusSquared

  if (distanceSquared <= radiusSquared) {
    let normalX: number
    let normalY: number
    let penetration: number

    if (distanceSquared > 0) {
      const distance = Math.sqrt(distanceSquared)
      normalX = offsetX / distance
      normalY = offsetY / distance
      penetration = circle.radius - distance
    } else {
      const faces = [
        { distance: circle.x - rect.x, x: -1, y: 0 },
        { distance: right - circle.x, x: 1, y: 0 },
        { distance: circle.y - rect.y, x: 0, y: -1 },
        { distance: bottom - circle.y, x: 0, y: 1 },
      ]
      const nearestFace = faces.reduce((nearest, face) => face.distance < nearest.distance ? face : nearest)
      normalX = nearestFace.x
      normalY = nearestFace.y
      penetration = circle.radius + nearestFace.distance
    }

    if (!isOverlapping && circle.vx * normalX + circle.vy * normalY >= 0) return null
    return {
      time: 0,
      normal: { x: normalX, y: normalY },
      x: circle.x + normalX * (penetration + OVERLAP_EPSILON),
      y: circle.y + normalY * (penetration + OVERLAP_EPSILON),
    }
  }

  const speed = Math.hypot(circle.vx, circle.vy)
  if (speed === 0 || seconds <= 0) return null

  const direction = new Vector3(circle.vx / speed, circle.vy / speed, 0)
  const ray = new Ray(new Vector3(circle.x, circle.y, 0), direction)
  const expandedBox = new Box3(
    new Vector3(rect.x - circle.radius, rect.y - circle.radius, -1),
    new Vector3(right + circle.radius, bottom + circle.radius, 1),
  )
  const broadphasePoint = ray.intersectBox(expandedBox, new Vector3())
  const maxDistance = speed * seconds
  const candidates: CircleRectHit[] = []

  if (broadphasePoint) {
    const distance = broadphasePoint.distanceTo(ray.origin)
    if (distance <= maxDistance) {
      const hitX = broadphasePoint.x
      const hitY = broadphasePoint.y
      if (Math.abs(hitX - (rect.x - circle.radius)) < 1e-7 && hitY >= rect.y && hitY <= bottom) {
        candidates.push({ time: distance / speed, x: hitX, y: hitY, normal: { x: -1, y: 0 } })
      } else if (Math.abs(hitX - (right + circle.radius)) < 1e-7 && hitY >= rect.y && hitY <= bottom) {
        candidates.push({ time: distance / speed, x: hitX, y: hitY, normal: { x: 1, y: 0 } })
      } else if (Math.abs(hitY - (rect.y - circle.radius)) < 1e-7 && hitX >= rect.x && hitX <= right) {
        candidates.push({ time: distance / speed, x: hitX, y: hitY, normal: { x: 0, y: -1 } })
      } else if (Math.abs(hitY - (bottom + circle.radius)) < 1e-7 && hitX >= rect.x && hitX <= right) {
        candidates.push({ time: distance / speed, x: hitX, y: hitY, normal: { x: 0, y: 1 } })
      }
    }
  }

  const corners = [
    { x: rect.x, y: rect.y, sideX: -1, sideY: -1 },
    { x: right, y: rect.y, sideX: 1, sideY: -1 },
    { x: rect.x, y: bottom, sideX: -1, sideY: 1 },
    { x: right, y: bottom, sideX: 1, sideY: 1 },
  ]
  for (const corner of corners) {
    const sphere = new Sphere(new Vector3(corner.x, corner.y, 0), circle.radius)
    const point = ray.intersectSphere(sphere, new Vector3())
    if (!point) continue
    const distance = point.distanceTo(ray.origin)
    if (distance > maxDistance) continue
    const relativeX = point.x - corner.x
    const relativeY = point.y - corner.y
    if (relativeX * corner.sideX < -1e-7 || relativeY * corner.sideY < -1e-7) continue
    const normalLength = Math.hypot(relativeX, relativeY)
    if (normalLength === 0) continue
    const normalX = relativeX / normalLength
    const normalY = relativeY / normalLength
    if (circle.vx * normalX + circle.vy * normalY >= 0) continue
    candidates.push({ time: distance / speed, x: point.x, y: point.y, normal: { x: normalX, y: normalY } })
  }

  candidates.sort((first, second) => first.time - second.time)
  return candidates[0] ?? null
}

export function reflectVelocity(vx: number, vy: number, normal: { x: number; y: number }): { vx: number; vy: number } {
  const velocity = new Vector3(vx, vy, 0)
  const contactNormal = new Vector3(normal.x, normal.y, 0)
  if (contactNormal.lengthSq() === 0) return { vx, vy }
  velocity.reflect(contactNormal.normalize())
  return { vx: velocity.x, vy: velocity.y }
}