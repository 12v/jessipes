import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock fetch
global.fetch = vi.fn()

// Clean up after each test
afterEach(() => {
  cleanup() // Ensure all components are unmounted
})

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
  
  // Reset fetch mock to return empty array by default
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  })
})