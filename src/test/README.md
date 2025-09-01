# Test Setup

This directory contains the test configuration for the Jessipes application.

## Files

- `setup.js` - Global test setup with mocks and utilities

## Testing Framework

The project uses:
- **Vitest** - Modern test runner for Vite projects
- **React Testing Library** - Component testing utilities
- **Jest DOM** - Additional DOM matchers

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui
```

## Test Coverage

The test suite covers:
- **App Component** - User interactions, state management, API integration
- **API Functions** - Network requests, error handling, data formatting  
- **Worker Backend** - CORS, authentication, CRUD operations, photo handling

All tests use proper mocking to ensure fast, reliable, and isolated test execution.