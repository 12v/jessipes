
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
- Comprehensive test suite with 60+ tests
- Automated quality gates via Husky hooks

## Commands

### Development
```bash
npm install        # Install dependencies
npm run dev        # Start development server
npm run worker:dev # Start worker development server
```

### Testing
```bash
npm test           # Run tests in watch mode
npm run test:run   # Run tests once
npm run test:ui    # Run tests with visual UI
npm run lint       # Run linting
```

### Deployment
```bash
npm run deploy        # Build after tests pass
npm run worker:deploy # Deploy worker after tests pass
```

**⚠️ Deployment Safety**: All deployment commands automatically run tests and linting first. Deployment will abort if any tests fail or linting errors are found.

### Production Build
```bash
npm run build
```

## Quality Gates
- **Pre-commit**: Tests + linting run before every commit
- **Pre-push**: Build verification before every push  
- **CI/CD**: GitHub Actions runs full test suite before deployment
- **Manual deployment**: All deploy scripts run tests first