// Cloudflare Workers KV API utilities for Jessipes

const WORKER_URL = 'https://jessipes-worker.12v.workers.dev';

export async function fetchRecipes(secret) {
    const res = await fetch(`${WORKER_URL}/recipes`, {
        headers: { Authorization: secret },
    });
    if (!res.ok) throw new Error('Failed to fetch recipes');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

export async function addRecipe(secret, recipe) {
    const formData = new FormData();
    if (recipe.photo) formData.append('photo', recipe.photo);
    if (recipe.title) formData.append('title', recipe.title);
    if (recipe.url) formData.append('url', recipe.url);
    if (recipe.text) formData.append('text', recipe.text);
    const res = await fetch(`${WORKER_URL}/recipes`, {
        method: 'POST',
        headers: { Authorization: secret },
        body: formData,
    });
    if (!res.ok) throw new Error('Failed to add recipe');
    return await res.json();
}

export async function softDeleteRecipe(secret, id) {
    const res = await fetch(`${WORKER_URL}/recipes/${id}`, {
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

export async function updateRecipe(secret, id, updates) {
    const res = await fetch(`${WORKER_URL}/recipes/${id}`, {
        method: 'PATCH',
        headers: {
            Authorization: secret,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update recipe');
    return await res.json();
}
