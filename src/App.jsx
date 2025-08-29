
import { useState, useEffect } from 'react';
import './App.css';
import { fetchRecipes, addRecipe, softDeleteRecipe } from './api';

const LOCAL_SECRET_KEY = 'jessipes_cloudflare_secret';

function App() {
  const [secret, setSecret] = useState(localStorage.getItem(LOCAL_SECRET_KEY) || '');
  const [inputSecret, setInputSecret] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ url: '', photo: null, title: '', text: '' });
  const [addType, setAddType] = useState('url');

  useEffect(() => {
    if (secret) {
      loadRecipes();
    }
  }, [secret]);

  function saveSecret() {
    localStorage.setItem(LOCAL_SECRET_KEY, inputSecret);
    setSecret(inputSecret);
  }

  async function loadRecipes() {
    setLoading(true);
    try {
      const data = await fetchRecipes(secret);
      setRecipes(data);
    } catch (error) {
      console.error('Failed to fetch recipes:', error);
      alert('Failed to fetch recipes. Please check your secret key and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRecipe(e) {
    e.preventDefault();
    try {
      const addedRecipe = await addRecipe(secret, newRecipe);
      setRecipes([...recipes, addedRecipe]);
      setShowAdd(false);
      setNewRecipe({ url: '', photo: null, title: '', text: '' });
    } catch (error) {
      console.error('Failed to add recipe:', error);
      alert('Failed to add recipe. Please try again.');
    }
  }

  async function handleDelete(id) {
    try {
      const updatedRecipe = await softDeleteRecipe(secret, id);
      setRecipes(recipes.map(r => r.id === id ? updatedRecipe : r));
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      alert('Failed to delete recipe. Please try again.');
    }
  }

  if (!secret) {
    return (
      <div className="container">
        <h1>Jessipes</h1>
        <p>Enter your Cloudflare secret to get started:</p>
        <input
          type="password"
          value={inputSecret}
          onChange={e => setInputSecret(e.target.value)}
          placeholder="Cloudflare secret"
          style={{ width: '100%', padding: '1em', fontSize: '1em' }}
        />
        <button onClick={saveSecret} style={{ width: '100%', marginTop: '1em' }}>Save</button>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Jessipes</h1>
      <button onClick={() => setShowAdd(!showAdd)} style={{ width: '100%', marginBottom: '1em' }}>
        {showAdd ? 'Cancel' : 'Add Recipe'}
      </button>
      {showAdd && (
        <form onSubmit={handleAddRecipe} className="add-form">
          <label>
            Type:
            <select value={addType} onChange={e => setAddType(e.target.value)}>
              <option value="url">URL</option>
              <option value="photo">Photo + Title</option>
              <option value="text">Text</option>
            </select>
          </label>
          {addType === 'url' && (
            <input
              type="url"
              placeholder="Recipe URL"
              value={newRecipe.url}
              onChange={e => setNewRecipe({ ...newRecipe, url: e.target.value })}
              required
            />
          )}
          {addType === 'photo' && (
            <>
              <input
                type="text"
                placeholder="Title"
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
            </>
          )}
          {addType === 'text' && (
            <textarea
              placeholder="Recipe text"
              value={newRecipe.text}
              onChange={e => setNewRecipe({ ...newRecipe, text: e.target.value })}
              required
            />
          )}
          <button type="submit" style={{ width: '100%', marginTop: '1em' }}>Submit</button>
        </form>
      )}
      <h2>Recipes</h2>
      {loading ? <p>Loading...</p> : (
        <ul className="recipe-list">
          {recipes.filter(r => !r.deleted).map(recipe => (
            <li key={recipe.id} className="recipe-item">
              <strong>{recipe.title || recipe.url || 'Untitled'}</strong>
              {recipe.url && <a href={recipe.url} target="_blank" rel="noopener noreferrer">View</a>}
              {recipe.text && <p>{recipe.text}</p>}
              {/* Photo preview not implemented in placeholder */}
              <button onClick={() => handleDelete(recipe.id)} className="delete-btn">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
