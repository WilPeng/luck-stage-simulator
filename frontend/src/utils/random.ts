export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function pickRandomItem<T>(list: T[]): T {
  if (list.length === 0) {
    throw new Error('List cannot be empty')
  }
  const index = randomInt(0, list.length - 1)
  return list[index]
}

export function weightedRandom<T>(list: T[], getWeight: (item: T) => number): T {
  if (list.length === 0) {
    throw new Error('List cannot be empty')
  }
  
  const totalWeight = list.reduce((sum, item) => sum + getWeight(item), 0)
  let random = Math.random() * totalWeight
  
  for (const item of list) {
    random -= getWeight(item)
    if (random <= 0) {
      return item
    }
  }
  
  return list[list.length - 1]
}