/** Catch-all for unmatched routes. Runs before the error handler below. */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
};

// Express identifies error handlers by their four-argument signature, so
// `next` must stay in the parameter list even though it is unused.
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (statusCode >= 500) {
    console.error('Unhandled error:', err);
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
};
