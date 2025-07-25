# SEARCH_RESULTS_COUNT Environment Variable Demo

## Overview

We have successfully implemented configurable search results count using environment variables. The system now uses `SEARCH_RESULTS_COUNT` instead of a hard-coded value of 10.

## Implementation Details

### Changes Made

1. **Updated `src/env.js`:**
   - Added `SEARCH_RESULTS_COUNT: z.coerce.number().default(10)` to the server schema
   - Added the environment variable to the `runtimeEnv` mapping

2. **Updated `src/deep-search.ts`:**
   - Imported `env` from `~/env`
   - Changed `{ q: query, num: 10 }` to `{ q: query, num: env.SEARCH_RESULTS_COUNT }`

## Usage

### Default Behavior (No Environment Variable Set)

When `SEARCH_RESULTS_COUNT` is not set in the environment, the system defaults to **10 results**.

```bash
# No environment variable set
npm run dev
# Will use 10 search results (default)
```

### Custom Values

Set the environment variable to any number to customize the search results count:

```bash
# Set to 5 results
SEARCH_RESULTS_COUNT=5 npm run dev

# Set to 20 results
SEARCH_RESULTS_COUNT=20 npm run dev

# Set to 1 result for testing
SEARCH_RESULTS_COUNT=1 npm run dev
```

### In Production (.env file)

Add to your `.env` file:

```env
SEARCH_RESULTS_COUNT=15
```

## Technical Details

- **Type Safety**: The value is automatically coerced from string to number using `z.coerce.number()`
- **Default Value**: If undefined or not set, defaults to 10
- **Validation**: Handled by the existing `@t3-oss/env-nextjs` validation system

## Benefits

1. **Flexibility**: Easy to adjust search results count without code changes
2. **Production Ready**: Can be changed via environment variables in deployment
3. **A/B Testing Ready**: Different environments can have different values
4. **Performance Tuning**: Can optimize based on API rate limits or performance needs

## Testing

The implementation was tested to verify:

- ✅ Default value (10) works when no environment variable is set
- ✅ String values are properly coerced to numbers ("5" → 5)
- ✅ Custom values work correctly (1, 5, 20, etc.)
- ✅ Type safety is maintained (always returns a number)

## Future Enhancements

This pattern can be extended to make other values configurable:
- Search timeout duration
- Cache expiration time
- Maximum pages to scrape
- API retry attempts
