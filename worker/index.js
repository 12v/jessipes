// Cloudflare Worker for Jessipes API
// Handles recipe storage and retrieval using Cloudflare KV

// Extract OpenGraph/meta preview image from a URL
async function extractPreviewImage(url) {
    try {
        // Fetch the HTML page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Jessipes/1.0; +https://jessipes.com)'
            }
        });
        
        if (!response.ok) {
            return null;
        }
        
        const html = await response.text();
        
        // Extract OpenGraph image
        const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogImageMatch) {
            const imageUrl = ogImageMatch[1];
            // Make relative URLs absolute
            if (imageUrl.startsWith('//')) {
                return `https:${imageUrl}`;
            } else if (imageUrl.startsWith('/')) {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
            } else if (!imageUrl.startsWith('http')) {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.host}/${imageUrl}`;
            }
            return imageUrl;
        }
        
        // Fallback to Twitter card image
        const twitterImageMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
        if (twitterImageMatch) {
            const imageUrl = twitterImageMatch[1];
            // Make relative URLs absolute
            if (imageUrl.startsWith('//')) {
                return `https:${imageUrl}`;
            } else if (imageUrl.startsWith('/')) {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
            } else if (!imageUrl.startsWith('http')) {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.host}/${imageUrl}`;
            }
            return imageUrl;
        }
        
        // Fallback to any image meta tag
        const imageMatch = html.match(/<meta\s+(?:name|property)=["'](?:image|thumbnail)["']\s+content=["']([^"']+)["']/i);
        if (imageMatch) {
            const imageUrl = imageMatch[1];
            // Make relative URLs absolute
            if (imageUrl.startsWith('//')) {
                return `https:${imageUrl}`;
            } else if (imageUrl.startsWith('/')) {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
            } else if (!imageUrl.startsWith('http')) {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.host}/${imageUrl}`;
            }
            return imageUrl;
        }
        
        return null;
    } catch (error) {
        console.warn('Error extracting preview image:', error);
        return null;
    }
}

export default {
    async fetch(request, env) {
        try {
            // CORS headers for development
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            };

            // Handle CORS preflight
            if (request.method === 'OPTIONS') {
                return new Response(null, { headers: corsHeaders });
            }

            const url = new URL(request.url);

            // Handle photo requests first (public access)
            if (url.pathname.startsWith('/photos/')) {
                const photoId = url.pathname.split('/photos/')[1];
                const photo = await env.PHOTOS.get(`photos/${photoId}`);

                if (!photo) {
                    return new Response('Photo not found', { status: 404 });
                }

                return new Response(photo.body, {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': photo.httpMetadata?.contentType || 'image/jpeg',
                        'Cache-Control': 'public, max-age=31536000',
                    }
                });
            }

            const auth = request.headers.get('Authorization');

            // Verify authorization for all other endpoints
            if (!auth || auth !== env.API_SECRET) {
                return new Response('Unauthorized', {
                    status: 401,
                    headers: corsHeaders
                });
            }

            // Route handling
            if (url.pathname === '/recipes') {
                switch (request.method) {
                    case 'GET': {
                        // Get all recipes
                        const recipes = await env.RECIPES.list();
                        const recipeData = await Promise.all(
                            recipes.keys.map(async key => {
                                const recipe = await env.RECIPES.get(key.name, { type: 'json' });
                                return recipe && !recipe.deleted ? { id: key.name, ...recipe } : null;
                            })
                        );
                        const filteredRecipes = recipeData.filter(r => r !== null);
                        // Sort by creation date, newest first
                        filteredRecipes.sort((a, b) => new Date(b.created) - new Date(a.created));
                        return new Response(
                            JSON.stringify(filteredRecipes),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }

                    case 'POST': {
                        // Add new recipe
                        const formData = await request.formData();
                        const recipe = {
                            title: formData.get('title'),
                            url: formData.get('url'),
                            text: formData.get('text'),
                            created: new Date().toISOString(),
                        };

                        // Extract preview image for URL recipes
                        if (recipe.url) {
                            try {
                                const previewImage = await extractPreviewImage(recipe.url);
                                if (previewImage) {
                                    recipe.previewImage = previewImage;
                                }
                            } catch (error) {
                                console.warn('Failed to extract preview image:', error);
                            }
                        }

                        // Handle photo upload
                        const photo = formData.get('photo');
                        if (photo && photo.size > 0) {
                            const photoId = crypto.randomUUID();
                            const photoKey = `photos/${photoId}`;

                            // Upload to R2
                            await env.PHOTOS.put(photoKey, photo, {
                                httpMetadata: {
                                    contentType: photo.type,
                                }
                            });

                            // Store the R2 URL
                            recipe.photo = `${url.origin}/photos/${photoId}`;
                        }

                        const id = crypto.randomUUID();
                        await env.RECIPES.put(id, JSON.stringify(recipe));

                        return new Response(
                            JSON.stringify({ id, ...recipe }),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }
                }
            }

            // Handle recipe updates (including soft delete)
            const recipeMatch = url.pathname.match(/^\/recipes\/(.+)$/);
            if (recipeMatch && request.method === 'PATCH') {
                const id = recipeMatch[1];
                const recipe = await env.RECIPES.get(id, { type: 'json' });

                if (!recipe) {
                    return new Response('Recipe not found', { status: 404 });
                }

                const body = await request.json();
                const updatedRecipe = { ...recipe, ...body };
                await env.RECIPES.put(id, JSON.stringify(updatedRecipe));

                return new Response(
                    JSON.stringify({ id, ...updatedRecipe }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response('Not Found', { status: 404 });
        } catch (error) {
            return new Response(error.message, { status: 500 });
        }
    }
};
