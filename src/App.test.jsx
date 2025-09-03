import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as api from './api'

// Mock the API module
vi.mock('./api', () => ({
  fetchRecipes: vi.fn(),
  addRecipe: vi.fn(),
  softDeleteRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}))

const mockRecipes = [
  {
    id: '1',
    title: 'Test Recipe 1',
    url: 'https://example.com/recipe1',
    text: 'Some notes',
    created: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    title: 'Test Recipe 2',
    photo: 'https://example.com/photo.jpg',
    text: 'Photo recipe notes',
    created: '2024-01-02T00:00:00Z',
  },
]

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Set default mock return values
    api.fetchRecipes.mockResolvedValue([])
    api.addRecipe.mockResolvedValue({ id: 'test-id', title: 'Test Recipe' })
    api.softDeleteRecipe.mockResolvedValue({ id: 'test-id', deleted: true })
    api.updateRecipe.mockResolvedValue({ id: 'test-id', title: 'Updated' })
  })

  describe('Secret Code Authentication', () => {
    test('shows secret code input when no secret is stored', () => {
      render(<App />)
      
      expect(screen.getByText('Jessipes')).toBeInTheDocument()
      expect(screen.getByText('Enter your secret code to get started:')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Secret code')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })

    test('saves secret code to localStorage when Save is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const input = screen.getByPlaceholderText('Secret code')
      const saveButton = screen.getByRole('button', { name: 'Save' })
      
      await user.type(input, 'test-secret')
      await user.click(saveButton)
      
      expect(localStorage.setItem).toHaveBeenCalledWith('jessipes_cloudflare_secret', 'test-secret')
    })

    test('loads secret from localStorage on mount', async () => {
      localStorage.getItem.mockReturnValue('existing-secret')
      api.fetchRecipes.mockResolvedValue([])
      
      render(<App />)
      
      expect(localStorage.getItem).toHaveBeenCalledWith('jessipes_cloudflare_secret')
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Recipe' })).toBeInTheDocument()
      })
    })
  })

  describe('Recipe List', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
    })

    test('displays recipes when loaded successfully', async () => {
      api.fetchRecipes.mockResolvedValue(mockRecipes)
      
      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
        expect(screen.getByText('Test Recipe 2')).toBeInTheDocument()
      })
      
      expect(screen.getByText('https://example.com/recipe1')).toBeInTheDocument()
      expect(screen.getByText('Some notes')).toBeInTheDocument()
    })

    test('shows loading state while fetching recipes', () => {
      api.fetchRecipes.mockReturnValue(new Promise(() => {})) // Never resolves
      
      render(<App />)
      
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    test('handles fetch error gracefully', async () => {
      api.fetchRecipes.mockRejectedValue(new Error('Network error'))
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      
      render(<App />)
      
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to fetch recipes. Please check your secret code and try again.')
      })
      
      alertSpy.mockRestore()
    })

    test('filters out deleted recipes', async () => {
      const recipesWithDeleted = [
        ...mockRecipes,
        { id: '3', title: 'Deleted Recipe', deleted: true },
      ]
      api.fetchRecipes.mockResolvedValue(recipesWithDeleted)
      
      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
        expect(screen.queryByText('Deleted Recipe')).not.toBeInTheDocument()
      })
    })
  })

  describe('Add Recipe Form', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
      api.fetchRecipes.mockResolvedValue([])
    })

    test('shows add form when Add Recipe button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      expect(screen.getByPlaceholderText('Recipe Title')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Recipe URL')).toBeInTheDocument()
    })

    test('switches between URL, Photo, and Text types', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const typeSelect = screen.getByRole('combobox')
      
      // Switch to Photo
      await user.selectOptions(typeSelect, 'photo')
      expect(screen.getByRole('option', { name: 'Photo' }).selected).toBe(true)
      expect(screen.queryByPlaceholderText('Recipe URL')).not.toBeInTheDocument()
      
      // Switch to Text
      await user.selectOptions(typeSelect, 'text')
      expect(screen.getByRole('option', { name: 'Text' }).selected).toBe(true)
      expect(screen.getByPlaceholderText('Recipe Instructions')).toBeInTheDocument()
    })

    test('shows additional notes field for URL and Photo types', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      // URL type should have additional notes
      expect(screen.getByPlaceholderText('Additional notes')).toBeInTheDocument()
      
      // Switch to Photo type
      const typeSelect = screen.getByRole('combobox')
      await user.selectOptions(typeSelect, 'photo')
      expect(screen.getByPlaceholderText('Additional notes')).toBeInTheDocument()
      
      // Switch to Text type - should not have additional notes (uses main text field)
      await user.selectOptions(typeSelect, 'text')
      expect(screen.queryByPlaceholderText('Additional notes')).not.toBeInTheDocument()
    })

    test('submits URL recipe successfully', async () => {
      const user = userEvent.setup()
      const newRecipe = { id: 'new-id', title: 'New Recipe', url: 'https://test.com', text: 'Notes' }
      api.addRecipe.mockResolvedValue(newRecipe)
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      await user.type(screen.getByPlaceholderText('Recipe Title'), 'New Recipe')
      await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://test.com')
      await user.type(screen.getByPlaceholderText('Additional notes'), 'Notes')
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      expect(api.addRecipe).toHaveBeenCalledWith('test-secret', {
        title: 'New Recipe',
        url: 'https://test.com',
        text: 'Notes',
        photo: null,
      })
    })

    test('handles add recipe error', async () => {
      const user = userEvent.setup()
      api.addRecipe.mockRejectedValue(new Error('Add failed'))
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      await user.type(screen.getByPlaceholderText('Recipe Title'), 'New Recipe')
      await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://test.com')
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Failed to add recipe. Please try again.')
      })
      
      alertSpy.mockRestore()
    })

    test('cancels add form when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      // Form should be visible
      expect(screen.getByPlaceholderText('Recipe Title')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      
      // Form should be hidden, Add Recipe button should be back
      expect(screen.queryByPlaceholderText('Recipe Title')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add Recipe' })).toBeInTheDocument()
    })
  })

  describe('Recipe Actions', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
      api.fetchRecipes.mockResolvedValue(mockRecipes)
    })

    test('deletes recipe when Delete button is clicked', async () => {
      const user = userEvent.setup()
      api.softDeleteRecipe.mockResolvedValue({ ...mockRecipes[0], deleted: true })
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const deleteButtons = screen.getAllByText('Delete')
      await user.click(deleteButtons[0])
      
      expect(api.softDeleteRecipe).toHaveBeenCalledWith('test-secret', '1')
    })

    test('enters edit mode when Edit button is clicked', async () => {
      const user = userEvent.setup()
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const editButtons = screen.getAllByText('Edit')
      await user.click(editButtons[0])
      
      expect(screen.getByDisplayValue('Test Recipe 1')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Some notes')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    test('saves edited recipe', async () => {
      const user = userEvent.setup()
      const updatedRecipe = { ...mockRecipes[0], title: 'Updated Title', text: 'Updated notes' }
      api.updateRecipe.mockResolvedValue(updatedRecipe)
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const editButtons = screen.getAllByText('Edit')
      await user.click(editButtons[0])
      
      const titleInput = screen.getByDisplayValue('Test Recipe 1')
      const textInput = screen.getByDisplayValue('Some notes')
      
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Title')
      await user.clear(textInput)
      await user.type(textInput, 'Updated notes')
      
      await user.click(screen.getByRole('button', { name: 'Save' }))
      
      expect(api.updateRecipe).toHaveBeenCalledWith('test-secret', '1', {
        title: 'Updated Title',
        text: 'Updated notes',
      })
    })

    test('cancels edit mode', async () => {
      const user = userEvent.setup()
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const editButtons = screen.getAllByText('Edit')
      await user.click(editButtons[0])
      
      expect(screen.getByDisplayValue('Test Recipe 1')).toBeInTheDocument()
      
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      
      expect(screen.queryByDisplayValue('Test Recipe 1')).not.toBeInTheDocument()
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
    })
  })

  describe('Recipe Display', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
    })

    test('displays URL recipes with clickable links', async () => {
      api.fetchRecipes.mockResolvedValue([mockRecipes[0]])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const titleLink = screen.getByRole('link', { name: 'Test Recipe 1' })
      const urlLink = screen.getByRole('link', { name: 'https://example.com/recipe1' })
      
      expect(titleLink).toHaveAttribute('href', 'https://example.com/recipe1')
      expect(titleLink).toHaveAttribute('target', '_blank')
      expect(urlLink).toHaveAttribute('href', 'https://example.com/recipe1')
      expect(urlLink).toHaveAttribute('target', '_blank')
    })

    test('displays photo recipes with images', async () => {
      api.fetchRecipes.mockResolvedValue([mockRecipes[1]])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 2'))
      
      const image = screen.getByRole('img', { name: 'Test Recipe 2' })
      expect(image).toHaveAttribute('src', 'https://example.com/photo.jpg')
      expect(image).toHaveClass('recipe-image')
    })

    test('displays recipe text content', async () => {
      api.fetchRecipes.mockResolvedValue(mockRecipes)
      
      render(<App />)
      
      await waitFor(() => {
        expect(screen.getByText('Some notes')).toBeInTheDocument()
        expect(screen.getByText('Photo recipe notes')).toBeInTheDocument()
      })
    })

    test('preserves newlines in recipe text display', async () => {
      const recipeWithNewlines = {
        id: '3',
        title: 'Multi-line Recipe',
        text: 'Line 1\nLine 2\nLine 3'
      }
      api.fetchRecipes.mockResolvedValue([recipeWithNewlines])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Multi-line Recipe'))
      
      const textElement = screen.getByText((content, element) => {
        return element.textContent === 'Line 1\nLine 2\nLine 3'
      })
      expect(textElement).toHaveClass('recipe-text')
    })

    test('clicking recipe image opens zoom overlay', async () => {
      const user = userEvent.setup()
      api.fetchRecipes.mockResolvedValue([mockRecipes[1]]) // Photo recipe
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 2'))
      
      const images = screen.getAllByRole('img', { name: 'Test Recipe 2' })
      const thumbnailImage = images.find(img => !img.classList.contains('zoomed-image'))
      expect(thumbnailImage).toHaveClass('recipe-image')
      
      await user.click(thumbnailImage)
      
      expect(screen.getByText('← Back')).toBeInTheDocument()
      const zoomedImages = screen.getAllByRole('img', { name: 'Test Recipe 2' })
      const zoomedImage = zoomedImages.find(img => img.classList.contains('zoomed-image'))
      expect(zoomedImage).toBeInTheDocument()
    })

    test('clicking back button closes zoom overlay and restores scroll', async () => {
      const user = userEvent.setup()
      api.fetchRecipes.mockResolvedValue([mockRecipes[1]])
      
      // Mock window.scrollY and scrollTo
      Object.defineProperty(window, 'scrollY', { value: 100, writable: true })
      const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 2'))
      
      const image = screen.getByRole('img', { name: 'Test Recipe 2' })
      await user.click(image)
      
      expect(screen.getByText('← Back')).toBeInTheDocument()
      
      const backButton = screen.getByText('← Back')
      await user.click(backButton)
      
      // Use setTimeout to match the component's behavior
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(screen.queryByText('← Back')).not.toBeInTheDocument()
      expect(scrollToSpy).toHaveBeenCalledWith(0, 100)
      
      scrollToSpy.mockRestore()
    })

    test('clicking overlay background closes zoom overlay and restores scroll', async () => {
      const user = userEvent.setup()
      api.fetchRecipes.mockResolvedValue([mockRecipes[1]])
      
      Object.defineProperty(window, 'scrollY', { value: 200, writable: true })
      const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 2'))
      
      const image = screen.getByRole('img', { name: 'Test Recipe 2' })
      await user.click(image)
      
      const overlay = document.querySelector('.image-zoom-overlay')
      expect(overlay).toBeInTheDocument()
      
      await user.click(overlay)
      
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(screen.queryByText('← Back')).not.toBeInTheDocument()
      expect(scrollToSpy).toHaveBeenCalledWith(0, 200)
      
      scrollToSpy.mockRestore()
    })

    test('clicking zoomed image does not close overlay', async () => {
      const user = userEvent.setup()
      api.fetchRecipes.mockResolvedValue([mockRecipes[1]])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 2'))
      
      const images = screen.getAllByRole('img', { name: 'Test Recipe 2' })
      const thumbnailImage = images.find(img => !img.classList.contains('zoomed-image'))
      await user.click(thumbnailImage)
      
      expect(screen.getByText('← Back')).toBeInTheDocument()
      
      const zoomedImages = screen.getAllByRole('img', { name: 'Test Recipe 2' })
      const zoomedImage = zoomedImages.find(img => img.classList.contains('zoomed-image'))
      await user.click(zoomedImage)
      
      expect(screen.getByText('← Back')).toBeInTheDocument()
    })
  })

  describe('Search Functionality', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
      api.fetchRecipes.mockResolvedValue(mockRecipes)
    })

    test('displays search input', async () => {
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      
      expect(screen.getByPlaceholderText('Search recipes...')).toBeInTheDocument()
    })

    test('filters recipes by title', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const searchInput = screen.getByPlaceholderText('Search recipes...')
      await user.type(searchInput, 'Recipe 1')
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
    })

    test('filters recipes by text content', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const searchInput = screen.getByPlaceholderText('Search recipes...')
      await user.type(searchInput, 'Some notes')
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
    })

    test('filters recipes by URL', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const searchInput = screen.getByPlaceholderText('Search recipes...')
      await user.type(searchInput, 'example.com/recipe1')
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
    })

    test('shows all recipes when search is cleared', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const searchInput = screen.getByPlaceholderText('Search recipes...')
      await user.type(searchInput, 'Recipe 1')
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
      
      await user.clear(searchInput)
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.getByText('Test Recipe 2')).toBeInTheDocument()
    })

    test('search is case insensitive', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const searchInput = screen.getByPlaceholderText('Search recipes...')
      await user.type(searchInput, 'recipe 1')
      
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
    })
  })
})