// Shared request-validation middleware.
//
// Usage:
//   const { validate } = require('../middleware/validate');
//   const { body, param } = require('express-validator');
//
//   router.post('/things',
//     validate([
//       body('name').trim().isLength({ min: 1, max: 100 }),
//       body('count').isInt({ min: 1, max: 1000 }),
//     ]),
//     handler
//   );
//
// validate() runs all the rules, then validationResult, then 400s with a uniform
// error shape. Replaces the boilerplate `const errors = validationResult(req); if
// (!errors.isEmpty()) return res.status(400)...` pattern that was scattered across
// the codebase (and missing entirely from several routes).

const { validationResult } = require('express-validator');

// Run an array of express-validator chains, then check the result
const validate = (rules) => {
  // Allow either a single rule or an array
  const rulesArray = Array.isArray(rules) ? rules : [rules];

  return async (req, res, next) => {
    // Run every rule in parallel
    await Promise.all(rulesArray.map((r) => r.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    // Uniform error shape: { error, details: [{ field, message }] }
    const details = errors.array({ onlyFirstError: true }).map((e) => ({
      field: e.path || e.param,
      message: e.msg,
    }));
    return res.status(400).json({
      error: 'Validation failed',
      details,
    });
  };
};

// Common reusable validators — import from express-validator into the route
// and compose with these helpers when handy. Kept minimal to avoid hidden magic.
const sanitizers = {
  // Strip leading/trailing whitespace and collapse internal whitespace runs to a single space.
  // Useful for free-text fields where double-spaces are noise (titles, names).
  collapseWhitespace: (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s),
};

module.exports = { validate, sanitizers };
