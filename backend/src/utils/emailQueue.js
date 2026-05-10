// Lightweight in-process email queue.
//
// The previous code called email service methods inline and discarded errors with
// `.catch(() => {})`. That's fine when the SMTP provider is healthy, but a transient
// failure (rate limit, network blip, provider hiccup) silently dropped the email.
//
// This queue:
//   1. Wraps the email service so callers don't change.
//   2. Retries failed sends with exponential backoff (max 3 attempts).
//   3. Decouples the request response from the SMTP round-trip — the API responds
//      immediately, the email goes out asynchronously.
//   4. Logs structured failures so we can find them in logs/Sentry.
//
// Why not BullMQ/Redis? For an MVP, an in-process queue is enough. Messages don't
// survive a server crash, but transactional emails are also re-triggerable from the
// app (resend verification, etc.) and the cost of one lost email per crash is low.
// When traffic justifies it, swap out the `enqueue` body for a Redis-backed job.

const email = require('./email');

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2_000; // 2s, then 4s, then 8s

// Names of email functions exposed on the underlying email service.
// We wrap each one to enqueue instead of awaiting inline.
const TEMPLATE_NAMES = [
  'sendWelcome',
  'sendBookingConfirmed',
  'sendNewBookingToGuide',
  'sendBookingAccepted',
  'sendBookingRejected',
  'sendReviewPrompt',
  'sendPasswordReset',
  'sendListingApproved',
  'sendListingRejected',
  'sendBookingReminder',
  'sendEmailVerification',
];

// Internal: actually attempt to send, with retries.
async function dispatch(templateName, args, attempt = 1) {
  try {
    await email[templateName](args);
  } catch (err) {
    const summary = `[email-queue] ${templateName} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err?.message || 'unknown'}`;
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`${summary} — giving up`);
      // Surface to Sentry if it's wired up. The require is cheap & cached.
      try {
        const Sentry = require('@sentry/node');
        if (Sentry?.captureException) {
          Sentry.captureException(err, { tags: { templateName, attempt }, extra: { args } });
        }
      } catch {}
      return;
    }
    console.warn(`${summary} — retrying`);
    setTimeout(() => dispatch(templateName, args, attempt + 1), BASE_DELAY_MS * 2 ** (attempt - 1));
  }
}

// Public: enqueue an email. Returns immediately; sending happens in the background.
function enqueue(templateName, args) {
  if (!TEMPLATE_NAMES.includes(templateName)) {
    console.error(`[email-queue] unknown template "${templateName}"`);
    return;
  }
  // setImmediate yields to the event loop so the API response goes out first.
  setImmediate(() => dispatch(templateName, args));
}

// Build a wrapper API with the same shape as utils/email so existing callers
// can swap `require('./email')` for `require('./emailQueue')` and pick up
// retries + async dispatch with no other changes.
const wrapped = {};
for (const name of TEMPLATE_NAMES) {
  wrapped[name] = (args) => enqueue(name, args);
}

module.exports = { ...wrapped, enqueue };
