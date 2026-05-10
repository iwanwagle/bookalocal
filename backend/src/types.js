// Shared @typedef declarations for the codebase.
//
// We don't ship TypeScript, but adding `// @ts-check` at the top of any file
// and importing these types via `/** @typedef {import('./types').User} User */`
// gives editors and `tsc --noEmit` enough info to catch the most common bugs:
// typos in column names, misnamed fields between API and DB, undefined-vs-null
// confusion, etc.
//
// Keep these in sync with the migrations.

/**
 * @typedef {'traveler'|'guide'|'admin'} UserRole
 *
 * @typedef {Object} User
 * @property {string} id              UUID
 * @property {string} email
 * @property {string} first_name
 * @property {string} last_name
 * @property {string|null} phone
 * @property {string|null} avatar_url
 * @property {UserRole} role
 * @property {boolean} is_active
 * @property {boolean} is_verified
 * @property {string|null} google_id
 * @property {Date|string|null} last_login
 * @property {Date|string} created_at
 * @property {Date|string} updated_at
 */

/**
 * @typedef {'pending'|'approved'|'rejected'|'suspended'} GuideProfileStatus
 *
 * @typedef {Object} GuideProfile
 * @property {string} id
 * @property {string} user_id
 * @property {string|null} bio
 * @property {string[]} languages
 * @property {string[]} specialties
 * @property {number} years_experience
 * @property {string|null} city
 * @property {string|null} country
 * @property {GuideProfileStatus} profile_status
 * @property {boolean} id_verified
 * @property {Date|string|null} kyc_submitted_at
 * @property {number} total_earnings
 * @property {number} total_bookings
 * @property {number} avg_rating
 * @property {number} total_reviews
 */

/**
 * @typedef {'city_tour'|'hiking'|'cultural'|'photography'|'food_tour'|'adventure'|'wildlife'|'spiritual'|'other'} ListingCategory
 * @typedef {'hourly'|'daily'|'package'} PricingType
 * @typedef {'pending'|'approved'|'rejected'} ListingStatus
 *
 * @typedef {Object} Listing
 * @property {string} id
 * @property {string} guide_id              FK → guide_profiles.id
 * @property {string} title
 * @property {string|null} slug
 * @property {string} description
 * @property {ListingCategory} category
 * @property {PricingType} pricing_type
 * @property {number|null} price_per_hour
 * @property {number|null} price_per_day
 * @property {number|null} package_price
 * @property {number|null} package_duration_days
 * @property {number} min_persons
 * @property {number} max_persons
 * @property {string|null} city
 * @property {string|null} country
 * @property {string[]} languages
 * @property {string[]} includes
 * @property {string[]} excludes
 * @property {string|null} meeting_point
 * @property {string} cancellation_policy
 * @property {string[]} images
 * @property {string|null} cover_image
 * @property {string[]} tags
 * @property {boolean} is_active
 * @property {boolean} is_featured
 * @property {ListingStatus} status
 * @property {number} avg_rating
 * @property {number} total_reviews
 * @property {number} total_bookings
 * @property {number} view_count
 */

/**
 * @typedef {'pending'|'confirmed'|'rejected'|'cancelled'|'completed'|'no_show'} BookingStatus
 * @typedef {'pending'|'paid'|'refunded'|'failed'} PaymentStatus
 *
 * @typedef {Object} Booking
 * @property {string} id
 * @property {string} booking_ref            e.g. "BL-2026-K3M2X-A1B2"
 * @property {string} listing_id
 * @property {string} traveler_id            FK → users.id
 * @property {string} guide_id               FK → guide_profiles.id (NOT users.id)
 * @property {string} booking_date           ISO date (YYYY-MM-DD)
 * @property {string|null} start_time        TIME (HH:MM:SS)
 * @property {string|null} end_time
 * @property {number|null} duration_hours
 * @property {number} num_persons
 * @property {PricingType|null} pricing_type
 * @property {number} base_price             Total before commission split
 * @property {number} platform_commission    Charged via Stripe upfront
 * @property {number} guide_amount           Settled separately to the guide
 * @property {number} total_amount
 * @property {BookingStatus} status
 * @property {PaymentStatus} payment_status
 * @property {string|null} stripe_payment_intent_id
 * @property {string|null} stripe_charge_id
 * @property {string|null} special_requests
 * @property {string|null} meeting_point
 * @property {string|null} guide_notes
 * @property {string|null} cancellation_reason  (Note: there used to be a `cancel_reason` duplicate — removed.)
 * @property {string|null} cancelled_by         'traveler' | 'guide' | 'admin' | 'system'
 * @property {Date|string|null} cancelled_at
 * @property {Date|string|null} completed_at
 * @property {Date|string|null} reminder_sent_at
 */

/**
 * @typedef {Object} Review
 * @property {string} id
 * @property {string} booking_id        UNIQUE — one review per booking
 * @property {string} listing_id
 * @property {string} guide_id
 * @property {string} traveler_id
 * @property {1|2|3|4|5} rating
 * @property {string|null} title
 * @property {string|null} comment
 * @property {string|null} guide_response
 * @property {Date|string|null} guide_response_at
 * @property {boolean} is_visible
 */

/**
 * Auth response sent on login/register/refresh. Cookies are set in addition.
 * @typedef {Object} AuthResponse
 * @property {User} user
 * @property {string=} token              Only present for X-Client-Type: native
 * @property {string=} refresh_token      Only present for X-Client-Type: native
 * @property {string=} refresh_expires_at
 */

/**
 * Pagination envelope used by paginated admin/list endpoints.
 * @template T
 * @typedef {Object} Paginated
 * @property {T[]} data
 * @property {{ total: number, page: number, limit: number, pages: number }} pagination
 */

module.exports = {}; // empty — this file only exists for its JSDoc typedefs
