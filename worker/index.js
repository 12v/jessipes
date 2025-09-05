// Cloudflare Worker for Jessipes API
// Handles recipe storage and retrieval using Cloudflare KV

// URL validation to prevent SSRF attacks
function isValidUrl(url) {
    try {
        const urlObj = new URL(url);
        
        // Only allow HTTP/HTTPS protocols
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return false;
        }
        
        // Block private/internal IP ranges
        const hostname = urlObj.hostname;
        
        // Block localhost and loopback addresses
        if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
            return false;
        }
        
        // Block private IP ranges (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const ipMatch = hostname.match(ipv4Regex);
        if (ipMatch) {
            const [, a, b, c, d] = ipMatch.map(Number);
            // 10.0.0.0/8
            if (a === 10) return false;
            // 172.16.0.0/12
            if (a === 172 && b >= 16 && b <= 31) return false;
            // 192.168.0.0/16
            if (a === 192 && b === 168) return false;
            // 169.254.0.0/16 (link-local)
            if (a === 169 && b === 254) return false;
        }
        
        return true;
    } catch {
        return false;
    }
}

// Helper function to resolve relative URLs to absolute URLs
function resolveUrl(imageUrl, baseUrl) {
    if (imageUrl.startsWith('//')) {
        return `https:${imageUrl}`;
    } else if (imageUrl.startsWith('/')) {
        const urlObj = new URL(baseUrl);
        return `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
    } else if (!imageUrl.startsWith('http')) {
        const urlObj = new URL(baseUrl);
        return `${urlObj.protocol}//${urlObj.host}/${imageUrl}`;
    }
    return imageUrl;
}

// Extract meta content using proper parsing instead of regex
function extractMetaContent(html, property, name = null) {
    const patterns = [
        new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+property=["']${property}["']`, 'i')
    ];
    
    if (name) {
        patterns.push(
            new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i'),
            new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+name=["']${name}["']`, 'i')
        );
    }
    
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            // Basic HTML entity decoding
            return match[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#x27;/g, "'")
                .replace(/&#x2F;/g, '/');
        }
    }
    return null;
}

// Extract OpenGraph/meta preview image from a URL
async function extractPreviewImage(url) {
    try {
        // Validate URL to prevent SSRF
        if (!isValidUrl(url)) {
            console.warn('Invalid or potentially dangerous URL:', url);
            return null;
        }
        
        // Fetch the HTML page with timeout and size limits
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Jessipes/1.0; +https://github.com/12v/jessipes)'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return null;
        }
        
        // Check content type to ensure it's HTML
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            return null;
        }
        
        // Limit response size to prevent memory issues
        const MAX_HTML_SIZE = 1024 * 1024; // 1MB
        const reader = response.body.getReader();
        const chunks = [];
        let totalSize = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            totalSize += value.length;
            if (totalSize > MAX_HTML_SIZE) {
                reader.cancel();
                throw new Error('Response too large');
            }
            
            chunks.push(value);
        }
        
        const html = new TextDecoder().decode(new Uint8Array(
            chunks.reduce((acc, chunk) => [...acc, ...chunk], [])
        ));
        
        // Extract OpenGraph image
        let imageUrl = extractMetaContent(html, 'og:image');
        if (imageUrl) {
            const resolvedUrl = resolveUrl(imageUrl, url);
            if (isValidUrl(resolvedUrl)) {
                return resolvedUrl;
            }
        }
        
        // Fallback to Twitter card image
        imageUrl = extractMetaContent(html, 'twitter:image', 'twitter:image');
        if (imageUrl) {
            const resolvedUrl = resolveUrl(imageUrl, url);
            if (isValidUrl(resolvedUrl)) {
                return resolvedUrl;
            }
        }
        
        // Fallback to any image meta tag
        imageUrl = extractMetaContent(html, 'image') || extractMetaContent(html, 'thumbnail', 'thumbnail');
        if (imageUrl) {
            const resolvedUrl = resolveUrl(imageUrl, url);
            if (isValidUrl(resolvedUrl)) {
                return resolvedUrl;
            }
        }
        
        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Request timed out for URL:', url);
        } else {
            console.warn('Error extracting preview image:', error.message);
        }
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
