
# Jessipes

A mobile-first PWA for saving and sharing recipes using Cloudflare KV.

## Features
- Mobile-first, minimal UI
- Save Cloudflare secret locally
- View, add, and soft-delete recipes
- Upload photos and recipe data to Cloudflare Workers KV

## Getting Started
1. On first load, enter your Cloudflare secret.
2. View existing recipes.
3. Add new recipes (URL, photo + title, or text).
4. Soft-delete recipes from the UI.

## Development
- Built with Vite + React
- PWA enabled

## To run locally:
```bash
npm install
npm run dev
```

## To build for production:
```bash
npm run build
```