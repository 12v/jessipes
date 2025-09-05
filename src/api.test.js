import { fetchRecipes, addRecipe, softDeleteRecipe, undeleteRecipe, updateRecipe } from './api'

const WORKER_URL = 'https://jessipes-worker.12v.workers.dev'
const mockSecret = 'test-secret'

describe('API Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe('fetchRecipes', () => {
    test('fetches recipes successfully', async () => {
      const mockRecipes = [
        { id: '1', title: 'Recipe 1', url: 'https://example.com' },
        { id: '2', title: 'Recipe 2', photo: 'https://example.com/photo.jpg' },
      ]
      
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockRecipes,
      })

      const result = await fetchRecipes(mockSecret)

      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/recipes`, {
        headers: { Authorization: mockSecret },
      })
      expect(result).toEqual(mockRecipes)
    })

    test('throws error when fetch fails', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
      })

      await expect(fetchRecipes(mockSecret)).rejects.toThrow('Failed to fetch recipes')
    })

    test('throws error when network request fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'))

      await expect(fetchRecipes(mockSecret)).rejects.toThrow('Network error')
    })
  })

  describe('addRecipe', () => {
    test('adds URL recipe successfully', async () => {
      const recipe = {
        title: 'New Recipe',
        url: 'https://example.com/recipe',
        text: 'Some notes',
        photo: null,
      }
      const expectedResponse = { id: 'new-id', ...recipe }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => expectedResponse,
      })

      const result = await addRecipe(mockSecret, recipe)

      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/recipes`, {
        method: 'POST',
        headers: { Authorization: mockSecret },
        body: expect.any(FormData),
      })

      const [, { body }] = fetch.mock.calls[0]
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('title')).toBe('New Recipe')
      expect(body.get('url')).toBe('https://example.com/recipe')
      expect(body.get('text')).toBe('Some notes')
      expect(body.get('photo')).toBeNull()

      expect(result).toEqual(expectedResponse)
    })

    test('adds photo recipe successfully', async () => {
      const mockFile = new File(['mock'], 'recipe.jpg', { type: 'image/jpeg' })
      const recipe = {
        title: 'Photo Recipe',
        photo: mockFile,
        text: 'Photo notes',
        url: '',
      }
      const expectedResponse = { id: 'photo-id', ...recipe }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => expectedResponse,
      })

      const result = await addRecipe(mockSecret, recipe)

      const [, { body }] = fetch.mock.calls[0]
      expect(body.get('title')).toBe('Photo Recipe')
      expect(body.get('photo')).toBe(mockFile)
      expect(body.get('text')).toBe('Photo notes')
      expect(body.get('url')).toBeNull()

      expect(result).toEqual(expectedResponse)
    })

    test('handles empty/null values correctly', async () => {
      const recipe = {
        title: 'Minimal Recipe',
        url: null,
        text: '',
        photo: null,
      }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'minimal-id', ...recipe }),
      })

      await addRecipe(mockSecret, recipe)

      const [, { body }] = fetch.mock.calls[0]
      expect(body.get('title')).toBe('Minimal Recipe')
      expect(body.get('url')).toBeNull()
      expect(body.get('text')).toBeNull()
      expect(body.get('photo')).toBeNull()
    })

    test('throws error when add fails', async () => {
      const recipe = { title: 'Test', url: 'https://example.com' }

      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
      })

      await expect(addRecipe(mockSecret, recipe)).rejects.toThrow('Failed to add recipe')
    })
  })

  describe('softDeleteRecipe', () => {
    test('soft deletes recipe successfully', async () => {
      const recipeId = 'recipe-123'
      const expectedResponse = { id: recipeId, deleted: true }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => expectedResponse,
      })

      const result = await softDeleteRecipe(mockSecret, recipeId)

      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: mockSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deleted: true }),
      })
      expect(result).toEqual(expectedResponse)
    })

    test('throws error when delete fails', async () => {
      const recipeId = 'recipe-123'

      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
      })

      await expect(softDeleteRecipe(mockSecret, recipeId)).rejects.toThrow('Failed to delete recipe')
    })
  })

  describe('undeleteRecipe', () => {
    test('undeletes recipe successfully', async () => {
      const recipeId = 'recipe-123'
      const expectedResponse = { id: recipeId, deleted: false }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => expectedResponse,
      })

      const result = await undeleteRecipe(mockSecret, recipeId)

      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: mockSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deleted: false }),
      })
      expect(result).toEqual(expectedResponse)
    })

    test('throws error when undelete fails', async () => {
      const recipeId = 'recipe-123'

      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
      })

      await expect(undeleteRecipe(mockSecret, recipeId)).rejects.toThrow('Failed to undelete recipe')
    })
  })

  describe('updateRecipe', () => {
    test('updates recipe successfully', async () => {
      const recipeId = 'recipe-123'
      const updates = {
        title: 'Updated Title',
        text: 'Updated notes',
      }
      const expectedResponse = { id: recipeId, ...updates }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => expectedResponse,
      })

      const result = await updateRecipe(mockSecret, recipeId, updates)

      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: mockSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })
      expect(result).toEqual(expectedResponse)
    })

    test('updates with partial data', async () => {
      const recipeId = 'recipe-123'
      const updates = { title: 'New Title Only' }

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: recipeId, ...updates }),
      })

      await updateRecipe(mockSecret, recipeId, updates)

      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          Authorization: mockSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })
    })

    test('throws error when update fails', async () => {
      const recipeId = 'recipe-123'
      const updates = { title: 'Updated Title' }

      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(updateRecipe(mockSecret, recipeId, updates)).rejects.toThrow('Failed to update recipe')
    })
  })

  describe('Error Handling', () => {
    test('handles network errors gracefully across all functions', async () => {
      global.fetch.mockRejectedValue(new Error('Network connection failed'))

      await expect(fetchRecipes(mockSecret)).rejects.toThrow('Network connection failed')
      await expect(addRecipe(mockSecret, { title: 'Test' })).rejects.toThrow('Network connection failed')
      await expect(softDeleteRecipe(mockSecret, 'id')).rejects.toThrow('Network connection failed')
      await expect(updateRecipe(mockSecret, 'id', { title: 'Test' })).rejects.toThrow('Network connection failed')
    })

    test('handles malformed JSON responses', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      await expect(fetchRecipes(mockSecret)).rejects.toThrow('Invalid JSON')
    })
  })

  describe('Request Format Validation', () => {
    test('uses correct HTTP methods', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })

      await fetchRecipes(mockSecret)
      expect(fetch.mock.calls[0][1].method).toBeUndefined() // GET is default

      await addRecipe(mockSecret, { title: 'Test' })
      expect(fetch.mock.calls[1][1].method).toBe('POST')

      await softDeleteRecipe(mockSecret, 'id')
      expect(fetch.mock.calls[2][1].method).toBe('PATCH')

      await updateRecipe(mockSecret, 'id', { title: 'Test' })
      expect(fetch.mock.calls[3][1].method).toBe('PATCH')
    })

    test('includes authorization headers in all requests', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })

      await fetchRecipes(mockSecret)
      await addRecipe(mockSecret, { title: 'Test' })
      await softDeleteRecipe(mockSecret, 'id')
      await updateRecipe(mockSecret, 'id', { title: 'Test' })

      fetch.mock.calls.forEach(([, options]) => {
        expect(options.headers.Authorization).toBe(mockSecret)
      })
    })
  })
})