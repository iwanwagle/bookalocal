const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Multer (file upload) errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 5MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Too many files or unexpected field name.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  // The fileFilter rejection from multer (a plain Error with our message)
  if (err.message === 'Only images allowed') {
    return res.status(400).json({ error: 'Only images allowed' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message, details: err.details });
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with this data already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' });
  }

  // Stripe errors
  if (err.type && err.type.startsWith('Stripe')) {
    return res.status(400).json({ error: err.message });
  }

  // Default error
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

const createError = (message, statusCode = 500) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

module.exports = { errorHandler, createError };
