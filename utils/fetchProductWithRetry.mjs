export class ProductNotFoundError extends Error {
  constructor(slug) {
    super(`Product not found: ${slug}`);
    this.name = 'ProductNotFoundError';
  }
}

const waitForRetry = (delayMilliseconds) => new Promise((resolve) => setTimeout(resolve, delayMilliseconds));

export async function fetchProductWithRetry({slug, fetchProduct, maximumAttempts = 3, retryDelayMilliseconds = 500}) {
  let lastFetchError;

  for (let attemptNumber = 1; attemptNumber <= maximumAttempts; attemptNumber++) {
    let result;

    try {
      result = await fetchProduct(slug);
    } catch (error) {
      lastFetchError = error;

      if (attemptNumber < maximumAttempts) {
        await waitForRetry(retryDelayMilliseconds * attemptNumber);
        continue;
      }

      break;
    }

    if (!result?.product) {
      throw new ProductNotFoundError(slug);
    }

    return result.product;
  }

  if (lastFetchError instanceof Error) {
    throw lastFetchError;
  }

  throw new Error(`Unable to load product: ${slug}`);
}
