const nodemailer = require('nodemailer');

// ─── Transport ────────────────────────────────────────────────────────────────
const createTransport = () => {
  if (process.env.NODE_ENV === 'production') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  // Dev: log emails to console instead of sending
  return nodemailer.createTransport({ jsonTransport: true });
};

const transporter = createTransport();

const FROM = process.env.EMAIL_FROM || 'Bookalocal <noreply@bookalocal.com>';
const BASE_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// ─── Shared layout ────────────────────────────────────────────────────────────
const wrap = (content) => `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a2e}
  .shell{max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:#E85A1E;padding:28px 32px;text-align:center}
  .header a{color:#fff;font-size:22px;font-weight:700;text-decoration:none;letter-spacing:-0.5px}
  .body{padding:32px}
  h1{font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e}
  p{font-size:15px;line-height:1.6;color:#555;margin:0 0 16px}
  .btn{display:inline-block;background:#E85A1E;color:#fff!important;font-weight:600;font-size:15px;padding:13px 28px;border-radius:10px;text-decoration:none;margin:8px 0 20px}
  .box{background:#f8f8f8;border-radius:10px;padding:20px;margin:20px 0}
  .box-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px}
  .box-row:last-child{border-bottom:none;padding-top:10px;font-weight:700;font-size:15px}
  .label{color:#888}
  .footer{text-align:center;padding:20px 32px;font-size:12px;color:#aaa;border-top:1px solid #f0f0f0}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600}
  .badge-success{background:#e8f5e9;color:#2e7d32}
  .badge-warning{background:#fff8e1;color:#f57f17}
  .badge-info{background:#e3f2fd;color:#1565c0}
  .badge-danger{background:#ffebee;color:#c62828}
</style></head><body>
<div class="shell">
  <div class="header"><a href="${BASE_URL}">bookalocal</a></div>
  <div class="body">${content}</div>
  <div class="footer">© ${new Date().getFullYear()} Bookalocal · <a href="${BASE_URL}/about" style="color:#aaa">Contact us</a></div>
</div></body></html>`;

// ─── Send helper ──────────────────────────────────────────────────────────────
const send = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [EMAIL DEV] To: ${to} | Subject: ${subject}`);
    }
    return info;
  } catch (err) {
    console.error('Email send error:', err.message);
    // Never throw — email failure should never break the API response
  }
};

// ─── Templates ────────────────────────────────────────────────────────────────

/**
 * 1. Welcome email after registration
 */
const sendWelcome = ({ to, firstName, role }) => send({
  to,
  subject: `Welcome to Bookalocal, ${firstName}! 🏔️`,
  html: wrap(`
    <h1>Welcome, ${firstName}!</h1>
    <p>You're now part of Nepal's leading local guide marketplace.</p>
    ${role === 'guide' ? `
      <p>As a guide, your next steps are:</p>
      <div class="box">
        <div class="box-row"><span>1. Complete your profile</span><span>→</span></div>
        <div class="box-row"><span>2. Create your first listing</span><span>→</span></div>
        <div class="box-row"><span>3. Start accepting bookings</span><span>→</span></div>
      </div>
      <a href="${BASE_URL}/guide/onboarding" class="btn">Complete your profile →</a>
    ` : `
      <p>Start discovering amazing local guides and experiences across Nepal.</p>
      <a href="${BASE_URL}/search" class="btn">Explore experiences →</a>
    `}
    <p style="font-size:13px;color:#aaa;margin-top:24px">Questions? Reply to this email — we read every one.</p>
  `),
});

/**
 * 2. Booking confirmation to traveler (after payment)
 */
const sendBookingConfirmed = ({ to, travelerName, bookingRef, listingTitle, guideName, bookingDate, persons, platformFee, guideAmount, totalAmount }) => send({
  to,
  subject: `Booking confirmed: ${listingTitle} 🎉`,
  html: wrap(`
    <h1>You're booked! 🎉</h1>
    <p>Hi ${travelerName}, your booking is confirmed. Here's a summary:</p>
    <div class="box">
      <div class="box-row"><span class="label">Booking ref</span><span><strong>${bookingRef}</strong></span></div>
      <div class="box-row"><span class="label">Experience</span><span>${listingTitle}</span></div>
      <div class="box-row"><span class="label">Guide</span><span>${guideName}</span></div>
      <div class="box-row"><span class="label">Date</span><span>${bookingDate}</span></div>
      <div class="box-row"><span class="label">Persons</span><span>${persons}</span></div>
      <div class="box-row"><span class="label">Paid online (15%)</span><span>NPR ${platformFee?.toLocaleString()}</span></div>
      <div class="box-row"><span class="label">Pay guide on the day (85%)</span><span>NPR ${guideAmount?.toLocaleString()}</span></div>
      <div class="box-row"><span class="label">Total value</span><span>NPR ${totalAmount?.toLocaleString()}</span></div>
    </div>
    <p>Your guide will confirm the booking shortly. You'll receive another email when they do.</p>
    <a href="${BASE_URL}/dashboard" class="btn">View booking →</a>
    <p style="font-size:13px;color:#aaa">Remember: pay the remaining <strong>NPR ${guideAmount?.toLocaleString()}</strong> directly to your guide on the day of the experience.</p>
  `),
});

/**
 * 3. New booking notification to guide
 */
const sendNewBookingToGuide = ({ to, guideName, travelerName, listingTitle, bookingRef, bookingDate, persons, totalAmount }) => send({
  to,
  subject: `New booking request: ${listingTitle}`,
  html: wrap(`
    <h1>New booking request 📋</h1>
    <p>Hi ${guideName}, you have a new booking request!</p>
    <div class="box">
      <div class="box-row"><span class="label">From</span><span>${travelerName}</span></div>
      <div class="box-row"><span class="label">Experience</span><span>${listingTitle}</span></div>
      <div class="box-row"><span class="label">Ref</span><span>${bookingRef}</span></div>
      <div class="box-row"><span class="label">Date</span><span>${bookingDate}</span></div>
      <div class="box-row"><span class="label">Persons</span><span>${persons}</span></div>
      <div class="box-row"><span class="label">Your earnings (85%)</span><span>NPR ${Math.round(totalAmount * 0.85).toLocaleString()}</span></div>
    </div>
    <p>Please accept or decline within 24 hours. Unanswered requests may affect your response rate.</p>
    <a href="${BASE_URL}/guide/dashboard" class="btn">Accept or decline →</a>
  `),
});

/**
 * 4. Booking accepted by guide → traveler
 */
const sendBookingAccepted = ({ to, travelerName, guideName, listingTitle, bookingDate, guidePhone }) => send({
  to,
  subject: `✅ ${guideName} accepted your booking!`,
  html: wrap(`
    <h1>Your guide confirmed! ✅</h1>
    <p>Great news, ${travelerName}! <strong>${guideName}</strong> has accepted your booking for <strong>${listingTitle}</strong> on <strong>${bookingDate}</strong>.</p>
    ${guidePhone ? `<div class="box"><div class="box-row"><span class="label">Guide's phone</span><span>${guidePhone}</span></div></div><p>You can contact your guide directly to confirm meeting point and any details.</p>` : ''}
    <p>Remember to bring <strong>cash</strong> for the remaining 85% of the experience cost to pay your guide on the day.</p>
    <a href="${BASE_URL}/dashboard" class="btn">View booking details →</a>
  `),
});

/**
 * 5. Booking rejected by guide → traveler
 */
const sendBookingRejected = ({ to, travelerName, guideName, listingTitle, reason }) => send({
  to,
  subject: `Booking update: ${listingTitle}`,
  html: wrap(`
    <h1>Booking not confirmed</h1>
    <p>Hi ${travelerName}, unfortunately <strong>${guideName}</strong> is unable to accept your booking for <strong>${listingTitle}</strong>.</p>
    ${reason ? `<div class="box"><p style="margin:0;font-size:14px;color:#666">"${reason}"</p></div>` : ''}
    <p>Don't worry — there are many other great guides available for this experience.</p>
    <a href="${BASE_URL}/search" class="btn">Find another guide →</a>
    <p style="font-size:13px;color:#aaa;margin-top:16px">Your 15% platform fee will be automatically refunded within 5-7 business days.</p>
  `),
});

/**
 * 6. Experience completed → traveler prompt to review
 */
const sendReviewPrompt = ({ to, travelerName, guideName, listingTitle, listingId }) => send({
  to,
  subject: `How was your experience with ${guideName}?`,
  html: wrap(`
    <h1>How was your experience? ⭐</h1>
    <p>Hi ${travelerName}, your experience <strong>${listingTitle}</strong> with <strong>${guideName}</strong> is now complete.</p>
    <p>Your review helps other travelers discover great guides and helps guides grow their business. It only takes 30 seconds!</p>
    <a href="${BASE_URL}/listings/${listingId}#review" class="btn">Leave a review →</a>
    <p style="font-size:13px;color:#aaa;margin-top:16px">Reviews can be submitted within 30 days of the experience.</p>
  `),
});

/**
 * 7. Password reset
 */
const sendPasswordReset = ({ to, firstName, resetToken }) => send({
  to,
  subject: 'Reset your Bookalocal password',
  html: wrap(`
    <h1>Password reset</h1>
    <p>Hi ${firstName}, we received a request to reset your password.</p>
    <a href="${BASE_URL}/reset-password?token=${resetToken}" class="btn">Reset password →</a>
    <p style="font-size:13px;color:#aaa">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `),
});

/**
 * 8. Listing approved by admin → guide
 */
const sendListingApproved = ({ to, guideName, listingTitle, listingId }) => send({
  to,
  subject: `✅ Your listing is live: ${listingTitle}`,
  html: wrap(`
    <h1>Your listing is live! 🚀</h1>
    <p>Hi ${guideName}, great news — your listing <strong>${listingTitle}</strong> has been approved and is now visible to travelers.</p>
    <a href="${BASE_URL}/listings/${listingId}" class="btn">View your listing →</a>
    <p>Share the link with your friends and on social media to get your first bookings!</p>
  `),
});

/**
 * 9. Listing rejected by admin → guide
 */
const sendListingRejected = ({ to, guideName, listingTitle, reason }) => send({
  to,
  subject: `Action needed: ${listingTitle}`,
  html: wrap(`
    <h1>Listing needs updates</h1>
    <p>Hi ${guideName}, your listing <strong>${listingTitle}</strong> requires some changes before it can go live.</p>
    ${reason ? `<div class="box"><p style="margin:0;font-size:14px;color:#666"><strong>Feedback:</strong> ${reason}</p></div>` : ''}
    <p>Please update your listing and resubmit for review.</p>
    <a href="${BASE_URL}/guide/dashboard" class="btn">Edit listing →</a>
  `),
});

/**
 * 10. 24-hour reminder before the experience
 */
const sendBookingReminder = ({ to, travelerName, guideName, guidePhone, listingTitle, bookingRef, bookingDate, startTime, city, meetingPoint, guideAmount, numPersons }) => send({
  to,
  subject: `Tomorrow: ${listingTitle} with ${guideName}`,
  html: wrap(`
    <h1>Your experience is tomorrow! 🎒</h1>
    <p>Hi ${travelerName}, just a friendly reminder that your booking is tomorrow.</p>
    <div class="box">
      <div class="box-row"><span class="label">Experience</span><span>${listingTitle}</span></div>
      <div class="box-row"><span class="label">Guide</span><span>${guideName}</span></div>
      ${guidePhone ? `<div class="box-row"><span class="label">Guide phone</span><span>${guidePhone}</span></div>` : ''}
      <div class="box-row"><span class="label">Date</span><span>${new Date(bookingDate).toLocaleDateString('en-NP', { dateStyle: 'long' })}</span></div>
      ${startTime ? `<div class="box-row"><span class="label">Start time</span><span>${startTime}</span></div>` : ''}
      <div class="box-row"><span class="label">Persons</span><span>${numPersons}</span></div>
      ${meetingPoint ? `<div class="box-row"><span class="label">Meeting point</span><span>${meetingPoint}</span></div>` : `<div class="box-row"><span class="label">City</span><span>${city}</span></div>`}
      <div class="box-row"><span class="label">Booking ref</span><span><strong>${bookingRef}</strong></span></div>
    </div>
    <div class="box" style="background:#fff8e1;border-left:3px solid #f57f17">
      <p style="margin:0;font-size:14px"><strong>💵 Don't forget:</strong> bring NPR ${guideAmount?.toLocaleString()} cash to pay your guide on the day.</p>
    </div>
    <p style="font-size:13px;color:#888">Need to cancel? Some refunds may apply depending on the listing's cancellation policy. Contact your guide as soon as possible if plans change.</p>
    <a href="${BASE_URL}/dashboard" class="btn">View booking</a>
  `),
});

/**
 * 11. Email verification — sent on registration
 */
const sendEmailVerification = ({ to, firstName, verifyToken }) => send({
  to,
  subject: 'Verify your email — Bookalocal',
  html: wrap(`
    <h1>Welcome, ${firstName}! ✉️</h1>
    <p>Thanks for signing up for Bookalocal. To finish creating your account, please verify your email address.</p>
    <a href="${BASE_URL}/verify-email?token=${verifyToken}" class="btn">Verify my email →</a>
    <p style="font-size:13px;color:#aaa">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
  `),
});

module.exports = {
  sendWelcome,
  sendBookingConfirmed,
  sendNewBookingToGuide,
  sendBookingAccepted,
  sendBookingRejected,
  sendReviewPrompt,
  sendPasswordReset,
  sendListingApproved,
  sendListingRejected,
  sendBookingReminder,
  sendEmailVerification,
};
