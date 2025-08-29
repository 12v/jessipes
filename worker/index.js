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
            const auth = request.headers.get('Authorization');

            // Verify authorization
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
                            photo: formData.get('photo'),
                            created: new Date().toISOString(),
                        };

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
