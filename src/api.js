// Cloudflare Workers KV API utilities for Jessipes
// Replace endpoint URLs with your deployed Worker endpoints

export async function fetchRecipes(secret) {
  // Example: GET /api/recipes
  const res = await fetch('https://your-worker-url/recipes', {
    headers: { Authorization: secret },
  });
  if (!res.ok) throw new Error('Failed to fetch recipes');
  return await res.json();
}

export async function addRecipe(secret, recipe) {
  // Example: POST /api/recipes
  const formData = new FormData();
  if (recipe.photo) formData.append('photo', recipe.photo);
  if (recipe.title) formData.append('title', recipe.title);
  if (recipe.url) formData.append('url', recipe.url);
  if (recipe.text) formData.append('text', recipe.text);
  const res = await fetch('https://your-worker-url/recipes', {
    method: 'POST',
    headers: { Authorization: secret },
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to add recipe');
  return await res.json();
}

export async function softDeleteRecipe(secret, id) {
  // Example: PATCH /api/recipes/:id
  const res = await fetch(`https://your-worker-url/recipes/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deleted: true }),
  });
  if (!res.ok) throw new Error('Failed to delete recipe');
  return await res.json();
}
