// Cloudflare Worker for Jessipes API
// Handles recipe storage and retrieval using Cloudflare KV

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
                    case 'GET':
                        // Get all recipes
                        const recipes = await env.RECIPES.list();
                        const recipeData = await Promise.all(
                            recipes.keys.map(async key => {
                                const recipe = await env.RECIPES.get(key.name, { type: 'json' });
                                return recipe && !recipe.deleted ? { id: key.name, ...recipe } : null;
                            })
                        );
                        return new Response(
                            JSON.stringify(recipeData.filter(r => r !== null)),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );

                    case 'POST':
                        // Add new recipe
                        const formData = await request.formData();
                        const recipe = {
                            title: formData.get('title'),
                            url: formData.get('url'),
                            text: formData.get('text'),
                            created: new Date().toISOString(),
                        };

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

            // Handle soft delete
            const recipeMatch = url.pathname.match(/^\/recipes\/(.+)$/);
            if (recipeMatch && request.method === 'PATCH') {
                const id = recipeMatch[1];
                const recipe = await env.RECIPES.get(id, { type: 'json' });

                if (!recipe) {
                    return new Response('Recipe not found', { status: 404 });
                }

                const updatedRecipe = { ...recipe, deleted: true };
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
