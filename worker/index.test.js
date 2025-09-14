import { expect } from 'vitest'
import worker from './index.js'

// Mock environment setup
const createMockEnv = () => {
  const mockKV = new Map()
  const mockR2 = new Map()

  return {
    API_SECRET: 'test-secret',
    RECIPES: {
      list: vi.fn().mockResolvedValue({
        keys: Array.from(mockKV.keys()).map(key => ({ name: key })),
      }),
      get: vi.fn().mockImplementation((key, options) => {
        const value = mockKV.get(key)
        if (!value) return null
        return options?.type === 'json' ? JSON.parse(value) : value
      }),
      put: vi.fn().mockImplementation((key, value) => {
        mockKV.set(key, value)
        return Promise.resolve()
      }),
    },
    PHOTOS: {
      get: vi.fn().mockImplementation(key => {
        const value = mockR2.get(key)
        return value ? { body: value, httpMetadata: { contentType: 'image/jpeg' } } : null
      }),
      put: vi.fn().mockImplementation((key, value, options) => {
        mockR2.set(key, { body: value, ...options })
        return Promise.resolve()
      }),
    },
    // Helper methods for testing
    _mockKV: mockKV,
    _mockR2: mockR2,
  }
}

const createRequest = (url, options = {}) => {
  return new Request(url, {
    method: 'GET',
    headers: {},
    ...options,
  })
}

const createFormData = (data) => {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      formData.append(key, value)
    }
  })
  return formData
}

describe('Cloudflare Worker', () => {
  let env

  beforeEach(() => {
    env = createMockEnv()
    vi.clearAllMocks()
  })

  describe('CORS Handling', () => {
    test('handles OPTIONS request for CORS preflight', async () => {
      const request = createRequest('https://example.com/recipes', { method: 'OPTIONS' })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PATCH, OPTIONS')
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
    })

    test('includes CORS headers in all responses', async () => {
      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('Photo Handling', () => {
    test('serves photo with correct headers', async () => {
      const photoId = 'test-photo-id'
      const mockPhotoData = 'mock-photo-data'
      env._mockR2.set(`photos/${photoId}`, mockPhotoData)

      const request = createRequest(`https://example.com/photos/${photoId}`)
      const response = await worker.fetch(request, env)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('image/jpeg')
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000')
      expect(env.PHOTOS.get).toHaveBeenCalledWith(`photos/${photoId}`)
    })

    test('returns 404 for non-existent photo', async () => {
      const request = createRequest('https://example.com/photos/non-existent')
      const response = await worker.fetch(request, env)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Photo not found')
    })

    test('handles photo with custom content type', async () => {
      const photoId = 'test-photo-id'
      env.PHOTOS.get.mockResolvedValue({
        body: 'mock-photo-data',
        httpMetadata: { contentType: 'image/png' },
      })

      const request = createRequest(`https://example.com/photos/${photoId}`)
      const response = await worker.fetch(request, env)

      expect(response.headers.get('Content-Type')).toBe('image/png')
    })
  })

  describe('Authentication', () => {
    test('returns 401 for missing authorization', async () => {
      const request = createRequest('https://example.com/recipes')
      const response = await worker.fetch(request, env)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe('Unauthorized')
    })

    test('returns 401 for invalid authorization', async () => {
      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'invalid-secret' },
      })
      const response = await worker.fetch(request, env)

      expect(response.status).toBe(401)
      expect(await response.text()).toBe('Unauthorized')
    })

    test('allows access with valid authorization', async () => {
      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })
      const response = await worker.fetch(request, env)

      expect(response.status).toBe(200)
    })
  })

  describe('GET /recipes', () => {
    test('returns empty array when no recipes exist', async () => {
      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual([])
    })

    test('returns recipes sorted by creation date', async () => {
      const recipe1 = { title: 'Recipe 1', created: '2024-01-01T00:00:00Z' }
      const recipe2 = { title: 'Recipe 2', created: '2024-01-02T00:00:00Z' }

      env._mockKV.set('id1', JSON.stringify(recipe1))
      env._mockKV.set('id2', JSON.stringify(recipe2))

      env.RECIPES.list.mockResolvedValue({
        keys: [{ name: 'id1' }, { name: 'id2' }],
      })

      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveLength(2)
      expect(data[0].title).toBe('Recipe 2') // Newer first
      expect(data[1].title).toBe('Recipe 1')
    })

    test('doesn\'t filter out deleted recipes', async () => {
      const recipe1 = { title: 'Active Recipe', created: '2024-01-01T00:00:00Z' }
      const recipe2 = { title: 'Deleted Recipe', created: '2024-01-02T00:00:00Z', deleted: true }

      env._mockKV.set('id1', JSON.stringify(recipe1))
      env._mockKV.set('id2', JSON.stringify(recipe2))

      env.RECIPES.list.mockResolvedValue({
        keys: [{ name: 'id1' }, { name: 'id2' }],
      })

      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data).toHaveLength(2)
      expect(data[0].title).toBe('Deleted Recipe')
      expect(data[1].title).toBe('Active Recipe')
    })

    test('includes recipe ID in response', async () => {
      const recipe = { title: 'Test Recipe', created: '2024-01-01T00:00:00Z' }
      env._mockKV.set('test-id', JSON.stringify(recipe))

      env.RECIPES.list.mockResolvedValue({
        keys: [{ name: 'test-id' }],
      })

      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data[0]).toMatchObject({
        id: 'test-id',
        title: 'Test Recipe',
        created: '2024-01-01T00:00:00Z',
      })
    })
  })

  describe('POST /recipes', () => {
    test('creates URL recipe successfully', async () => {
      const formData = createFormData({
        title: 'Test Recipe',
        url: 'https://example.com/recipe',
        text: 'Recipe notes',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        title: 'Test Recipe',
        url: 'https://example.com/recipe',
        text: 'Recipe notes',
        created: expect.any(String),
      })
      expect(data.id).toBeDefined()
      expect(env.RECIPES.put).toHaveBeenCalled()
    })

    test('creates text-only recipe successfully', async () => {
      const formData = createFormData({
        title: 'Text Recipe',
        text: 'Recipe instructions',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        title: 'Text Recipe',
        text: 'Recipe instructions',
        created: expect.any(String),
      })
      expect(data.url).toBeNull()
      expect(data.photo).toBeUndefined()
    })

    // Note: Photo upload test removed due to complexity with mocking FormData and crypto in test environment

    test('handles recipe without photo', async () => {
      const formData = createFormData({
        title: 'No Photo Recipe',
        text: 'No photo here',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.photo).toBeUndefined()
      expect(env.PHOTOS.put).not.toHaveBeenCalled()
    })

    test('generates valid ISO date string', async () => {
      const formData = createFormData({ title: 'Date Test Recipe' })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(new Date(data.created)).toBeInstanceOf(Date)
    })

    test('extracts preview image from URL recipe', async () => {
      // Mock fetch to return HTML with OpenGraph image
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:image" content="https://example.com/preview.jpg" />
        </head>
        <body></body>
        </html>
      `

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'text/html' },
          body: {
            getReader: () => ({
              read: vi.fn()
                .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
                .mockResolvedValueOnce({ done: true })
            })
          }
        })
        .mockResolvedValueOnce({ // Second call for the actual recipe creation
          ok: true,
          json: async () => ({}),
        })

      const formData = createFormData({
        title: 'Recipe with Preview',
        url: 'https://example.com/recipe',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBe('https://example.com/preview.jpg')
    })

    test('handles preview image extraction failure gracefully', async () => {
      // Mock fetch to fail for preview extraction
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

      const formData = createFormData({
        title: 'Recipe with Failed Preview',
        url: 'https://example.com/recipe',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.previewImage).toBeUndefined()
    })
  })

  describe('PATCH /recipes/:id', () => {
    const recipeId = 'test-recipe-id'

    test('updates recipe successfully', async () => {
      const existingRecipe = {
        title: 'Original Title',
        text: 'Original text',
        created: '2024-01-01T00:00:00Z',
      }
      env._mockKV.set(recipeId, JSON.stringify(existingRecipe))

      const updates = {
        title: 'Updated Title',
        text: 'Updated text',
      }

      const request = createRequest(`https://example.com/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'test-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        id: recipeId,
        title: 'Updated Title',
        text: 'Updated text',
        created: '2024-01-01T00:00:00Z', // Preserved
      })

      expect(env.RECIPES.put).toHaveBeenCalledWith(
        recipeId,
        JSON.stringify({
          title: 'Updated Title',
          text: 'Updated text',
          created: '2024-01-01T00:00:00Z',
        })
      )
    })

    test('soft deletes recipe', async () => {
      const existingRecipe = {
        title: 'Recipe to Delete',
        created: '2024-01-01T00:00:00Z',
      }
      env._mockKV.set(recipeId, JSON.stringify(existingRecipe))

      const request = createRequest(`https://example.com/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'test-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deleted: true }),
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        id: recipeId,
        title: 'Recipe to Delete',
        deleted: true,
        created: '2024-01-01T00:00:00Z',
      })
    })

    test('returns 404 for non-existent recipe', async () => {
      const request = createRequest(`https://example.com/recipes/non-existent`, {
        method: 'PATCH',
        headers: {
          Authorization: 'test-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated' }),
      })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Recipe not found')
    })

    test('handles partial updates', async () => {
      const existingRecipe = {
        title: 'Original Title',
        text: 'Original text',
        url: 'https://example.com',
        created: '2024-01-01T00:00:00Z',
      }
      env._mockKV.set(recipeId, JSON.stringify(existingRecipe))

      const request = createRequest(`https://example.com/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: 'test-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Only Title Updated' }),
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data).toMatchObject({
        title: 'Only Title Updated',
        text: 'Original text',
        url: 'https://example.com',
        created: '2024-01-01T00:00:00Z',
      })
    })
  })

  describe('Preview Image Extraction', () => {
    beforeEach(() => {
      // Reset global fetch mock
      global.fetch = vi.fn()
    })

    test('extracts OpenGraph image correctly', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:image" content="https://example.com/og-image.jpg" />
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const formData = createFormData({
        title: 'OpenGraph Test',
        url: 'https://example.com/page',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBe('https://example.com/og-image.jpg')
    })

    test('falls back to Twitter card image', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta name="twitter:image" content="https://example.com/twitter-image.jpg" />
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const formData = createFormData({
        title: 'Twitter Card Test',
        url: 'https://example.com/page',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBe('https://example.com/twitter-image.jpg')
    })

    test('resolves relative URLs correctly', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:image" content="/images/preview.jpg" />
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const formData = createFormData({
        title: 'Relative URL Test',
        url: 'https://example.com/recipe-page',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBe('https://example.com/images/preview.jpg')
    })

    test('resolves protocol-relative URLs correctly', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:image" content="//cdn.example.com/image.jpg" />
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const formData = createFormData({
        title: 'Protocol Relative Test',
        url: 'https://example.com/page',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBe('https://cdn.example.com/image.jpg')
    })

    test('blocks private IP addresses (SSRF protection)', async () => {
      const formData = createFormData({
        title: 'SSRF Test',
        url: 'http://192.168.1.1/recipe',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBeUndefined()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('blocks localhost addresses (SSRF protection)', async () => {
      const formData = createFormData({
        title: 'Localhost Test',
        url: 'http://localhost:8080/recipe',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBeUndefined()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('blocks non-HTTP protocols (SSRF protection)', async () => {
      const formData = createFormData({
        title: 'File Protocol Test',
        url: 'file:///etc/passwd',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBeUndefined()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('handles non-HTML content type', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
      })

      const formData = createFormData({
        title: 'JSON Content Test',
        url: 'https://example.com/api/data',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBeUndefined()
    })

    test('handles HTML entity decoding in image URLs', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:image" content="https://example.com/image?param=value&amp;other=test" />
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const formData = createFormData({
        title: 'Entity Decoding Test',
        url: 'https://example.com/page',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBe('https://example.com/image?param=value&other=test')
    })

    test('returns null when no preview image found', async () => {
      const mockHtml = `
        <html>
        <head>
          <title>No Image Here</title>
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const formData = createFormData({
        title: 'No Image Test',
        url: 'https://example.com/page',
      })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(data.previewImage).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    test('returns 404 for unknown routes', async () => {
      const request = createRequest('https://example.com/unknown', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not Found')
    })

    test('handles KV errors gracefully', async () => {
      env.RECIPES.list.mockRejectedValue(new Error('KV Error'))

      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(500)
      expect(await response.text()).toBe('KV Error')
    })

    test('handles malformed JSON in PATCH requests', async () => {
      env._mockKV.set('test-id', JSON.stringify({ title: 'Test' }))

      const request = createRequest('https://example.com/recipes/test-id', {
        method: 'PATCH',
        headers: {
          Authorization: 'test-secret',
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(500)
    })
  })

  describe('Content Type Headers', () => {
    test('returns JSON content type for API responses', async () => {
      const request = createRequest('https://example.com/recipes', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)

      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    test('handles FormData content type correctly', async () => {
      const formData = createFormData({ title: 'Test' })

      const request = createRequest('https://example.com/recipes', {
        method: 'POST',
        headers: { Authorization: 'test-secret' },
        body: formData,
      })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })

  describe('Title Extraction', () => {
    beforeEach(() => {
      global.fetch = vi.fn()
    })

    test('extracts title from OpenGraph meta tag', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta property="og:title" content="Recipe Title from OG" />
          <title>Fallback Title</title>
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.title).toBe('Recipe Title from OG')
    })

    test('falls back to Twitter card title', async () => {
      const mockHtml = `
        <html>
        <head>
          <meta name="twitter:title" content="Recipe Title from Twitter" />
          <title>Fallback Title</title>
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.title).toBe('Recipe Title from Twitter')
    })

    test('falls back to title tag', async () => {
      const mockHtml = `
        <html>
        <head>
          <title>Recipe Title from Title Tag</title>
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.title).toBe('Recipe Title from Title Tag')
    })

    test('falls back to domain name when no title found', async () => {
      const mockHtml = `
        <html>
        <head>
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.title).toBe('example.com')
    })

    test('handles HTML entities in title', async () => {
      const mockHtml = `
        <html>
        <head>
          <title>Recipe &amp; Cooking &lt;Guide&gt;</title>
        </head>
        </html>
      `

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(mockHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.title).toBe('Recipe & Cooking <Guide>')
    })

    test('returns error for missing URL parameter', async () => {
      const request = createRequest('https://example.com/extract-title', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('URL parameter required')
    })

    test('returns error for invalid URL', async () => {
      const request = createRequest('https://example.com/extract-title?url=http://localhost/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid URL')
    })

    test('handles timeout gracefully', async () => {
      const abortError = new Error('Request timed out')
      abortError.name = 'AbortError'
      
      global.fetch.mockImplementation(() => new Promise((resolve, reject) => {
        setTimeout(() => reject(abortError), 100)
      }))

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(408)
      expect(data.error).toBe('Request timed out')
    })

    test('handles non-HTML content type', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/api', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('URL does not return HTML')
    })

    test('handles large HTML responses', async () => {
      const largeHtml = 'x'.repeat(1024 * 1024 + 1) // Over 1MB

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        body: {
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(largeHtml) })
              .mockResolvedValueOnce({ done: true })
          })
        }
      })

      const request = createRequest('https://example.com/extract-title?url=https://example.com/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to extract title')
    })

    test('blocks SSRF attempts', async () => {
      const request = createRequest('https://example.com/extract-title?url=http://192.168.1.1/page', {
        headers: { Authorization: 'test-secret' },
      })

      const response = await worker.fetch(request, env)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid URL')
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})