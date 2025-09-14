
import { useState, useEffect } from 'react';
import './App.css';
import { fetchRecipes, addRecipe, softDeleteRecipe, undeleteRecipe, updateRecipe, extractTitleFromUrl } from './api';

const LOCAL_SECRET_KEY = 'jessipes_cloudflare_secret';

function App() {
  const [secret, setSecret] = useState(localStorage.getItem(LOCAL_SECRET_KEY) || '');
  const [inputSecret, setInputSecret] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ url: '', photo: null, title: '', text: '' });
  const [addType, setAddType] = useState('url');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [editData, setEditData] = useState({ title: '', text: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomedImage, setZoomedImage] = useState(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [undeletingIds, setUndeletingIds] = useState(new Set());
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [fetchingTitle, setFetchingTitle] = useState(false);


  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      if (secret) {
        setLoading(true);
        try {
          const data = await fetchRecipes(secret);
          if (mounted) {
            setRecipes(data);
          }
        } catch (error) {
          if (mounted) {
            console.error('Failed to fetch recipes:', error);
            alert('Failed to fetch recipes. Please check your secret code and try again.');
          }
        } finally {
          if (mounted) {
            setLoading(false);
          }
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
    };
  }, [secret]);


  function handleSaveSecret() {
    localStorage.setItem(LOCAL_SECRET_KEY, inputSecret);
    setSecret(inputSecret);
  }

  async function handleAddRecipe(e) {
    e.preventDefault();
    try {
      const addedRecipe = await addRecipe(secret, newRecipe);
      setRecipes(prev => [addedRecipe, ...prev]);
      setShowAdd(false);
      setNewRecipe({ url: '', photo: null, title: '', text: '' });
      setTitleManuallyEdited(false);
    } catch (error) {
      console.error('Failed to add recipe:', error);
      alert('Failed to add recipe. Please try again.');
    }
  }

  async function fetchTitleForUrl(url) {
    if (!url || titleManuallyEdited || newRecipe.title) return;
    
    setFetchingTitle(true);
    try {
      const title = await extractTitleFromUrl(secret, url);
      if (title && !titleManuallyEdited) {
        setNewRecipe(prev => ({ ...prev, title }));
      }
    } catch (error) {
      console.error('Failed to fetch title:', error);
    } finally {
      setFetchingTitle(false);
    }
  }

  function handleUrlBlur() {
    if (newRecipe.url) {
      fetchTitleForUrl(newRecipe.url);
    }
  }

  async function handleUrlPaste(e) {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      // Update the URL state first
      setNewRecipe(prev => ({ ...prev, url: pastedText }));
      // Then fetch the title
      setTimeout(() => fetchTitleForUrl(pastedText), 0);
    }
  }

  function handleTitleChange(e) {
    const value = e.target.value;
    setNewRecipe({ ...newRecipe, title: value });
    if (value !== '') {
      setTitleManuallyEdited(true);
    }
  }

  function handleDelete(recipe) {
    setShowConfirmDelete(recipe);
  }

  async function confirmDelete() {
    try {
      const updatedRecipe = await softDeleteRecipe(secret, showConfirmDelete.id);
      setRecipes(prev => prev.map(r => r.id === showConfirmDelete.id ? updatedRecipe : r));
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      alert('Failed to delete recipe. Please try again.');
    } finally {
      setShowConfirmDelete(null);
    }
  }

  function cancelDelete() {
    setShowConfirmDelete(null);
  }

  async function handleUndelete(recipe) {
    if (undeletingIds.has(recipe.id)) return;
    
    setUndeletingIds(prev => new Set([...prev, recipe.id]));
    try {
      const updatedRecipe = await undeleteRecipe(secret, recipe.id);
      setRecipes(prev => prev.map(r => r.id === recipe.id ? updatedRecipe : r));
    } catch (error) {
      console.error('Failed to undelete recipe:', error);
      alert('Failed to undelete recipe. Please try again.');
    } finally {
      setUndeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(recipe.id);
        return newSet;
      });
    }
  }

  function handleStartEdit(recipe) {
    setEditingRecipe(recipe.id);
    setEditData({ title: recipe.title || '', text: recipe.text || '' });
  }

  function handleCancelEdit() {
    setEditingRecipe(null);
    setEditData({ title: '', text: '' });
  }

  async function handleUpdateRecipe(e) {
    e.preventDefault();
    try {
      const updatedRecipe = await updateRecipe(secret, editingRecipe, editData);
      setRecipes(prev => prev.map(r => r.id === editingRecipe ? updatedRecipe : r));
      setEditingRecipe(null);
      setEditData({ title: '', text: '' });
    } catch (error) {
      console.error('Failed to update recipe:', error);
      alert('Failed to update recipe. Please try again.');
    }
  }

  if (!secret) {
    return (
      <div className="container">
        <h1>Jessipes</h1>
        <p>Enter your secret code to get started:</p>
        <input
          type="password"
          value={inputSecret}
          onChange={e => setInputSecret(e.target.value)}
          placeholder="Secret code"
          className="secret-input"
        />
        <button onClick={handleSaveSecret} className="secret-save-button">Save</button>
      </div>
    );
  }

  const filteredRecipes = recipes.filter(recipe => {
    const matchesSearch = !searchTerm || (() => {
      const searchLower = searchTerm.toLowerCase();
      return (
        recipe.title?.toLowerCase().includes(searchLower) ||
        recipe.text?.toLowerCase().includes(searchLower) ||
        recipe.url?.toLowerCase().includes(searchLower)
      );
    })();
    
    const matchesDeletedFilter = showDeleted ? recipe.deleted : !recipe.deleted;
    
    return matchesSearch && matchesDeletedFilter;
  });

  return (
    <div className="container">
      <h1>Jessipes</h1>
      
      <div className="top-buttons">
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} className="primary-button solid add-recipe-button">
            Add Recipe
          </button>
        )}
        <button 
          onClick={() => setShowDeleted(!showDeleted)} 
          className={`primary-button outline ${showDeleted ? 'active' : ''}`}
        >
          {showDeleted ? 'Show Active' : 'Show Deleted'}
        </button>
      </div>
      {showAdd && (
        <form onSubmit={handleAddRecipe} className="add-form">
          <select value={addType} onChange={e => {
            setAddType(e.target.value);
            setTitleManuallyEdited(false);
            setNewRecipe({ url: '', photo: null, title: '', text: '' });
          }}>
            <option value="url">URL</option>
            <option value="photo">Photo</option>
            <option value="text">Text</option>
          </select>
          {addType === 'url' && (
            <>
              <input
                type="url"
                placeholder="Recipe URL"
                value={newRecipe.url}
                onChange={e => setNewRecipe({ ...newRecipe, url: e.target.value })}
                onBlur={handleUrlBlur}
                onPaste={handleUrlPaste}
                required
                autoFocus
              />
              <input
                type="text"
                placeholder={fetchingTitle ? "Fetching title..." : "Recipe Title"}
                value={newRecipe.title}
                onChange={handleTitleChange}
                disabled={!newRecipe.url || fetchingTitle}
                required
              />
              <textarea
                placeholder="Additional notes"
                value={newRecipe.text}
                onChange={e => setNewRecipe({ ...newRecipe, text: e.target.value })}
              />
            </>
          )}
          {addType === 'photo' && (
            <>
              <input
                type="text"
                placeholder="Recipe Title"
                value={newRecipe.title}
                onChange={e => setNewRecipe({ ...newRecipe, title: e.target.value })}
                required
              />
              <input
                type="file"
                accept="image/*"
                onChange={e => setNewRecipe({ ...newRecipe, photo: e.target.files[0] })}
                required
              />
              <textarea
                placeholder="Additional notes"
                value={newRecipe.text}
                onChange={e => setNewRecipe({ ...newRecipe, text: e.target.value })}
              />
            </>
          )}
          {addType === 'text' && (
            <>
              <input
                type="text"
                placeholder="Recipe Title"
                value={newRecipe.title}
                onChange={e => setNewRecipe({ ...newRecipe, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Recipe Instructions"
                value={newRecipe.text}
                onChange={e => setNewRecipe({ ...newRecipe, text: e.target.value })}
                required
              />
            </>
          )}
          <div className="add-buttons">
            <button type="submit">Add Recipe</button>
            <button type="button" onClick={() => {
              setShowAdd(false);
              setTitleManuallyEdited(false);
              setNewRecipe({ url: '', photo: null, title: '', text: '' });
            }}>Cancel</button>
          </div>
        </form>
      )}
      
      <input
        type="text"
        placeholder="Search recipes..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="search-input"
      />
      
      {loading ? <p>Loading...</p> : (
        <ul className="recipe-list">
          {filteredRecipes.map(recipe => (
            <li key={recipe.id} className={`recipe-item ${recipe.deleted ? 'deleted' : ''}`}>
              {editingRecipe === recipe.id ? (
                <form onSubmit={handleUpdateRecipe} className="edit-form">
                  <input
                    type="text"
                    placeholder="Recipe Title"
                    value={editData.title}
                    onChange={e => setEditData({ ...editData, title: e.target.value })}
                    required
                  />
                  <textarea
                    placeholder="Additional notes"
                    value={editData.text}
                    onChange={e => setEditData({ ...editData, text: e.target.value })}
                  />
                  <div className="edit-buttons">
                    <button type="submit">Save</button>
                    <button type="button" onClick={handleCancelEdit}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  {recipe.url ? (
                    <a href={recipe.url} target="_blank" rel="noopener noreferrer" className="recipe-title-link">
                      <strong className="recipe-title">{recipe.title || 'Untitled'}</strong>
                    </a>
                  ) : (
                    <strong className="recipe-title">{recipe.title || 'Untitled'}</strong>
                  )}
                  {(recipe.previewImage || recipe.photo) && (
                    <img
                      src={recipe.previewImage || recipe.photo}
                      alt={recipe.title || 'Recipe image'}
                      className={recipe.previewImage ? "recipe-preview-image" : "recipe-image"}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                      onClick={() => {
                        setScrollPosition(window.scrollY);
                        setZoomedImage({
                          src: recipe.previewImage || recipe.photo,
                          alt: recipe.title || 'Recipe image'
                        });
                      }}
                    />
                  )}
                  {recipe.url && (
                    <a href={recipe.url} target="_blank" rel="noopener noreferrer" className="recipe-url">
                      {recipe.url}
                    </a>
                  )}
                  {recipe.text && <p className="recipe-text">{recipe.text}</p>}
                  <div className="recipe-actions">
                    {!recipe.deleted ? (
                      <>
                        <button onClick={() => handleStartEdit(recipe)} className="edit-btn">Edit</button>
                        <button onClick={() => handleDelete(recipe)} className="delete-btn">Delete</button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleUndelete(recipe)} 
                        className="undelete-btn"
                        disabled={undeletingIds.has(recipe.id)}
                      >
                        {undeletingIds.has(recipe.id) ? 'Restoring...' : 'Restore'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      
      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={(e) => {
          // Only close if clicking the overlay background, not the image
          if (e.target === e.currentTarget) {
            setZoomedImage(null);
            setTimeout(() => window.scrollTo(0, scrollPosition), 0);
          }
        }}>
          <div className="image-zoom-container">
            <button 
              className="back-button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomedImage(null);
                setTimeout(() => window.scrollTo(0, scrollPosition), 0);
              }}
            >
              ← Back
            </button>
            <img
              src={zoomedImage.src}
              alt={zoomedImage.alt}
              className="zoomed-image"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
      
      {showConfirmDelete && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete "{showConfirmDelete.title || 'Untitled'}"?</p>
            <div className="modal-buttons">
              <button onClick={confirmDelete} className="delete-confirm-btn">Delete</button>
              <button onClick={cancelDelete} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
