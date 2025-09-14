import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import * as api from './api'

// Mock the API module
vi.mock('./api', () => ({
  fetchRecipes: vi.fn(),
  addRecipe: vi.fn(),
  softDeleteRecipe: vi.fn(),
  undeleteRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  extractTitleFromUrl: vi.fn(),
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
    api.extractTitleFromUrl.mockResolvedValue('Extracted Title')
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
      
      expect(screen.getByPlaceholderText('Recipe URL')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Recipe Title')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
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
      // Don't auto-populate title for this test
      api.extractTitleFromUrl.mockResolvedValue(null)
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      // Enter URL first (this will enable the title field)
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      await user.type(urlInput, 'https://test.com')
      
      // Wait for title field to be enabled
      await waitFor(() => {
        const titleInput = screen.getByPlaceholderText('Recipe Title')
        expect(titleInput).not.toBeDisabled()
      })
      
      // Enter title and notes
      await user.type(screen.getByPlaceholderText('Recipe Title'), 'New Recipe')
      await user.type(screen.getByPlaceholderText('Additional notes'), 'Notes')
      
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      await waitFor(() => {
        expect(api.addRecipe).toHaveBeenCalled()
      })
      
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
      
      await user.type(screen.getByPlaceholderText('Recipe URL'), 'https://test.com')
      await user.type(screen.getByPlaceholderText('Recipe Title'), 'New Recipe')
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
      expect(screen.getByPlaceholderText('Recipe URL')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Recipe Title')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      
      // Form should be hidden, Add Recipe button should be back
      expect(screen.queryByPlaceholderText('Recipe URL')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Recipe Title')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add Recipe' })).toBeInTheDocument()
    })
  })

  describe('URL-First Recipe Entry', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
      api.fetchRecipes.mockResolvedValue([])
    })

    test('URL field appears before title field in form', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      // Check that URL input appears before title input in DOM order
      const form = document.querySelector('.add-form')
      const inputs = form.querySelectorAll('input[type="url"], input[type="text"]')
      const urlIndex = Array.from(inputs).indexOf(urlInput)
      const titleIndex = Array.from(inputs).indexOf(titleInput)
      
      expect(urlIndex).toBeLessThan(titleIndex)
    })

    test('title field is disabled when URL is empty', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      expect(titleInput).toBeDisabled()
    })

    test('title field becomes enabled after entering URL', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      expect(titleInput).toBeDisabled()
      
      await user.type(urlInput, 'https://example.com')
      
      expect(titleInput).not.toBeDisabled()
    })

    test('auto-populates title on URL blur', async () => {
      const user = userEvent.setup()
      api.extractTitleFromUrl.mockResolvedValue('Auto-extracted Title')
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      await user.type(urlInput, 'https://example.com')
      await user.tab() // Blur the URL input
      
      await waitFor(() => {
        expect(api.extractTitleFromUrl).toHaveBeenCalledWith('test-secret', 'https://example.com')
        expect(titleInput).toHaveValue('Auto-extracted Title')
      })
    })

    test('auto-populates title on URL paste', async () => {
      const user = userEvent.setup()
      api.extractTitleFromUrl.mockResolvedValue('Pasted URL Title')
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      await user.click(urlInput)
      await user.paste('https://pasted-example.com')
      
      await waitFor(() => {
        expect(api.extractTitleFromUrl).toHaveBeenCalledWith('test-secret', 'https://pasted-example.com')
        expect(titleInput).toHaveValue('Pasted URL Title')
      })
    })

    test('does not overwrite manually edited title', async () => {
      const user = userEvent.setup()
      api.extractTitleFromUrl.mockResolvedValue('Auto Title')
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      // First enter URL and let it auto-populate
      await user.type(urlInput, 'https://example.com')
      await user.tab()
      
      await waitFor(() => {
        expect(titleInput).toHaveValue('Auto Title')
      })
      
      // Manually edit the title
      await user.clear(titleInput)
      await user.type(titleInput, 'Manual Title')
      
      // Blur URL again
      await user.click(urlInput)
      await user.tab()
      
      // Should not overwrite manual edit
      expect(titleInput).toHaveValue('Manual Title')
      expect(api.extractTitleFromUrl).toHaveBeenCalledTimes(1)
    })

    test('shows loading state while fetching title', async () => {
      const user = userEvent.setup()
      // Mock a delayed response
      let resolveTitle
      api.extractTitleFromUrl.mockReturnValue(new Promise(resolve => {
        resolveTitle = resolve
      }))
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      
      await user.type(urlInput, 'https://example.com')
      await user.tab()
      
      // Should show fetching state
      expect(screen.getByPlaceholderText('Fetching title...')).toBeInTheDocument()
      
      // Title input should be disabled during fetch
      const titleInput = screen.getByPlaceholderText('Fetching title...')
      expect(titleInput).toBeDisabled()
      
      // Resolve the promise
      resolveTitle('Fetched Title')
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Recipe Title')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Fetched Title')).toBeInTheDocument()
      })
    })

    test('handles title extraction failure gracefully', async () => {
      const user = userEvent.setup()
      api.extractTitleFromUrl.mockResolvedValue(null)
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      await user.type(urlInput, 'https://example.com')
      await user.tab()
      
      await waitFor(() => {
        expect(api.extractTitleFromUrl).toHaveBeenCalledWith('test-secret', 'https://example.com')
      })
      
      // Title should remain empty but enabled
      expect(titleInput).toHaveValue('')
      expect(titleInput).not.toBeDisabled()
    })

    test('resets title manual edit flag when switching form types', async () => {
      const user = userEvent.setup()
      api.extractTitleFromUrl.mockResolvedValue('Auto Title')
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      const typeSelect = screen.getByRole('combobox')
      
      // Enter URL and manually edit title
      await user.type(urlInput, 'https://example.com')
      await user.tab()
      await waitFor(() => expect(titleInput).toHaveValue('Auto Title'))
      
      await user.clear(titleInput)
      await user.type(titleInput, 'Manual Title')
      
      // Switch to photo type and back to URL
      await user.selectOptions(typeSelect, 'photo')
      await user.selectOptions(typeSelect, 'url')
      
      // Wait for the form to reset first
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Recipe URL')).toHaveValue('')
      })
      
      // Should allow auto-population again
      const newUrlInput = screen.getByPlaceholderText('Recipe URL')
      await user.type(newUrlInput, 'https://new-example.com')
      await user.tab()
      
      await waitFor(() => {
        expect(api.extractTitleFromUrl).toHaveBeenLastCalledWith('test-secret', 'https://new-example.com')
      })
    })

    test('clears manual edit flag when cancelling form', async () => {
      const user = userEvent.setup()
      api.extractTitleFromUrl.mockResolvedValue('Auto Title')
      
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      const titleInput = screen.getByPlaceholderText('Recipe Title')
      
      // Enter URL and manually edit title
      await user.type(urlInput, 'https://example.com')
      await user.tab()
      await waitFor(() => expect(titleInput).toHaveValue('Auto Title'))
      
      await user.clear(titleInput)
      await user.type(titleInput, 'Manual Title')
      
      // Cancel form
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      
      // Re-open form - should allow auto-population again
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const newUrlInput = screen.getByPlaceholderText('Recipe URL')
      await user.type(newUrlInput, 'https://new-example.com')
      await user.tab()
      
      await waitFor(() => {
        expect(api.extractTitleFromUrl).toHaveBeenCalledWith('test-secret', 'https://new-example.com')
      })
    })

    test('URL input has autofocus in URL mode', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      await waitFor(() => screen.getByRole('button', { name: 'Add Recipe' }))
      await user.click(screen.getByRole('button', { name: 'Add Recipe' }))
      
      const urlInput = screen.getByPlaceholderText('Recipe URL')
      expect(urlInput).toHaveFocus()
    })
  })

  describe('Recipe Actions', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
      api.fetchRecipes.mockResolvedValue(mockRecipes)
    })

    test('deletes recipe when Delete button is clicked and confirmed', async () => {
      const user = userEvent.setup()
      api.softDeleteRecipe.mockResolvedValue({ ...mockRecipes[0], deleted: true })
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const deleteButtons = screen.getAllByText('Delete')
      await user.click(deleteButtons[0])
      
      // Modal should appear
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument()
      expect(screen.getByText('Are you sure you want to delete "Test Recipe 1"?')).toBeInTheDocument()
      
      // Click confirm delete in modal
      const confirmButton = document.querySelector('.delete-confirm-btn')
      await user.click(confirmButton)
      
      expect(api.softDeleteRecipe).toHaveBeenCalledWith('test-secret', '1')
    })

    test('does not delete recipe when deletion is cancelled', async () => {
      const user = userEvent.setup()
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      const deleteButtons = screen.getAllByText('Delete')
      await user.click(deleteButtons[0])
      
      // Modal should appear
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument()
      
      // Click cancel
      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)
      
      expect(api.softDeleteRecipe).not.toHaveBeenCalled()
      
      // Modal should be gone
      expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument()
    })

    test('should toggle between active and deleted recipes', async () => {
      const user = userEvent.setup()
      const recipesWithDeleted = [
        mockRecipes[0],
        { ...mockRecipes[1], deleted: true }
      ]
      api.fetchRecipes.mockResolvedValue(recipesWithDeleted)
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      // Initially shows only active recipes
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
      
      // Toggle to show deleted recipes
      const toggleButton = screen.getByText('Show Deleted')
      await user.click(toggleButton)
      
      await waitFor(() => screen.getByText('Test Recipe 2'))
      
      // Now shows only deleted recipes
      expect(screen.queryByText('Test Recipe 1')).not.toBeInTheDocument()
      expect(screen.getByText('Test Recipe 2')).toBeInTheDocument()
      
      // Toggle back to show active recipes
      const showActiveButton = screen.getByText('Show Active')
      await user.click(showActiveButton)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      // Back to showing only active recipes
      expect(screen.getByText('Test Recipe 1')).toBeInTheDocument()
      expect(screen.queryByText('Test Recipe 2')).not.toBeInTheDocument()
    })

    test('should restore deleted recipe', async () => {
      const user = userEvent.setup()
      const deletedRecipe = { ...mockRecipes[0], deleted: true }
      api.fetchRecipes.mockResolvedValue([deletedRecipe])
      api.undeleteRecipe.mockResolvedValue({ ...mockRecipes[0], deleted: false })
      
      render(<App />)
      
      // Switch to deleted view
      const toggleButton = screen.getByText('Show Deleted')
      await user.click(toggleButton)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      // Click restore button
      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)
      
      expect(api.undeleteRecipe).toHaveBeenCalledWith('test-secret', '1')
    })

    test('should prevent multiple undelete requests', async () => {
      const user = userEvent.setup()
      const deletedRecipe = { ...mockRecipes[0], deleted: true }
      api.fetchRecipes.mockResolvedValue([deletedRecipe])
      
      // Make undelete slow to test race condition
      api.undeleteRecipe.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<App />)
      
      // Switch to deleted view
      const toggleButton = screen.getByText('Show Deleted')
      await user.click(toggleButton)
      
      await waitFor(() => screen.getByText('Test Recipe 1'))
      
      // Click restore button multiple times rapidly
      const restoreButton = screen.getByText('Restore')
      await user.click(restoreButton)
      await user.click(restoreButton)
      await user.click(restoreButton)
      
      // Should show loading state
      expect(screen.getByText('Restoring...')).toBeInTheDocument()
      
      // Should only be called once
      expect(api.undeleteRecipe).toHaveBeenCalledTimes(1)
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
      
      const textElement = screen.getByText((_, element) => {
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

  describe('Preview Image Display', () => {
    beforeEach(() => {
      localStorage.getItem.mockReturnValue('test-secret')
    })

    test('displays preview image for URL recipes', async () => {
      const recipeWithPreview = {
        id: '1',
        title: 'Recipe with Preview',
        url: 'https://example.com/recipe',
        previewImage: 'https://example.com/preview.jpg',
        text: 'Recipe notes',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithPreview])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe with Preview'))
      
      const previewImage = screen.getByRole('img', { name: 'Recipe with Preview' })
      expect(previewImage).toHaveAttribute('src', 'https://example.com/preview.jpg')
      expect(previewImage).toHaveClass('recipe-preview-image')
    })

    test('preview image is positioned between title and URL', async () => {
      const recipeWithPreview = {
        id: '1',
        title: 'Recipe with Preview',
        url: 'https://example.com/recipe',
        previewImage: 'https://example.com/preview.jpg',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithPreview])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe with Preview'))
      
      const recipeItem = screen.getByText('Recipe with Preview').closest('.recipe-item')
      const children = Array.from(recipeItem.children)
      
      // Find indices of title, preview image, and URL
      const titleIndex = children.findIndex(child => child.textContent.includes('Recipe with Preview'))
      const imageIndex = children.findIndex(child => child.tagName === 'IMG' && child.classList.contains('recipe-preview-image'))
      const urlIndex = children.findIndex(child => child.textContent.includes('https://example.com/recipe'))
      
      expect(titleIndex).toBeLessThan(imageIndex)
      expect(imageIndex).toBeLessThan(urlIndex)
    })

    test('preview image opens zoom overlay when clicked', async () => {
      const user = userEvent.setup()
      const recipeWithPreview = {
        id: '1',
        title: 'Recipe with Preview',
        url: 'https://example.com/recipe',
        previewImage: 'https://example.com/preview.jpg',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithPreview])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe with Preview'))
      
      const previewImage = screen.getByRole('img', { name: 'Recipe with Preview' })
      await user.click(previewImage)
      
      expect(screen.getByText('← Back')).toBeInTheDocument()
      const zoomedImages = screen.getAllByRole('img', { name: 'Recipe with Preview' })
      const zoomedImage = zoomedImages.find(img => img.classList.contains('zoomed-image'))
      expect(zoomedImage).toBeInTheDocument()
      expect(zoomedImage).toHaveAttribute('src', 'https://example.com/preview.jpg')
    })

    test('hides preview image on error', async () => {
      const recipeWithPreview = {
        id: '1',
        title: 'Recipe with Broken Preview',
        url: 'https://example.com/recipe',
        previewImage: 'https://example.com/broken.jpg',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithPreview])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe with Broken Preview'))
      
      const previewImage = screen.getByRole('img', { name: 'Recipe with Broken Preview' })
      
      // Simulate image load error
      const errorEvent = new Event('error')
      Object.defineProperty(previewImage, 'style', {
        value: { display: '' },
        writable: true
      })
      previewImage.dispatchEvent(errorEvent)
      
      expect(previewImage.style.display).toBe('none')
    })

    test('does not display preview image when not present', async () => {
      const recipeWithoutPreview = {
        id: '1',
        title: 'Recipe without Preview',
        url: 'https://example.com/recipe',
        text: 'Recipe notes',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithoutPreview])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe without Preview'))
      
      const images = screen.queryAllByRole('img')
      const previewImages = images.filter(img => img.classList.contains('recipe-preview-image'))
      expect(previewImages).toHaveLength(0)
    })

    test('prioritizes preview image over photo for URL recipes with both', async () => {
      const recipeWithBoth = {
        id: '1',
        title: 'Recipe with Both',
        url: 'https://example.com/recipe',
        previewImage: 'https://example.com/preview.jpg',
        photo: 'https://example.com/photo.jpg',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithBoth])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe with Both'))
      
      const images = screen.getAllByRole('img', { name: 'Recipe with Both' })
      // Should only show one image (preview image takes priority)
      expect(images).toHaveLength(1)
      
      expect(images[0]).toHaveAttribute('src', 'https://example.com/preview.jpg')
      expect(images[0]).toHaveClass('recipe-preview-image')
    })

    test('falls back to photo when no preview image available', async () => {
      const recipeWithPhoto = {
        id: '1',
        title: 'Recipe with Photo Only',
        url: 'https://example.com/recipe',
        photo: 'https://example.com/photo.jpg',
        created: '2024-01-01T00:00:00Z',
      }
      api.fetchRecipes.mockResolvedValue([recipeWithPhoto])
      
      render(<App />)
      
      await waitFor(() => screen.getByText('Recipe with Photo Only'))
      
      const images = screen.getAllByRole('img', { name: 'Recipe with Photo Only' })
      expect(images).toHaveLength(1)
      
      expect(images[0]).toHaveAttribute('src', 'https://example.com/photo.jpg')
      expect(images[0]).toHaveClass('recipe-image')
    })
  })
})