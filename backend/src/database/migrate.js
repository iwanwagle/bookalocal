const { pool } = require('../config/database');

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`); // for geo queries (optional)

    // ─────────────────────────────────────────
    // USERS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        avatar_url TEXT,
        role VARCHAR(20) NOT NULL DEFAULT 'traveler' CHECK (role IN ('traveler', 'guide', 'admin')),
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        google_id VARCHAR(255) UNIQUE,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMPTZ,
        email_verify_token VARCHAR(255),
        email_verify_expires TIMESTAMPTZ,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // GUIDE PROFILES TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS guide_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        bio TEXT,
        languages TEXT[] DEFAULT '{}',
        specialties TEXT[] DEFAULT '{}',
        years_experience INTEGER DEFAULT 0,
        location VARCHAR(255),
        city VARCHAR(100),
        country VARCHAR(100) DEFAULT 'Nepal',
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        id_type VARCHAR(50),
        id_number VARCHAR(100),
        id_verified BOOLEAN DEFAULT FALSE,
        kyc_front_url TEXT,
        kyc_back_url TEXT,
        kyc_submitted_at TIMESTAMPTZ,
        profile_status VARCHAR(20) DEFAULT 'pending' CHECK (profile_status IN ('pending', 'approved', 'rejected', 'suspended')),
        bank_account_name VARCHAR(255),
        bank_account_number VARCHAR(100),
        bank_name VARCHAR(100),
        stripe_account_id VARCHAR(255),
        total_earnings DECIMAL(10, 2) DEFAULT 0,
        response_rate DECIMAL(5, 2) DEFAULT 100,
        avg_rating DECIMAL(3, 2) DEFAULT 0,
        total_reviews INTEGER DEFAULT 0,
        total_bookings INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // LISTINGS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guide_id UUID REFERENCES guide_profiles(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(300) UNIQUE,
        description TEXT NOT NULL,
        category VARCHAR(50) NOT NULL CHECK (category IN ('city_tour', 'hiking', 'cultural', 'photography', 'food_tour', 'adventure', 'wildlife', 'spiritual', 'other')),
        pricing_type VARCHAR(20) NOT NULL CHECK (pricing_type IN ('hourly', 'daily', 'package')),
        price_per_hour DECIMAL(10, 2),
        price_per_day DECIMAL(10, 2),
        package_price DECIMAL(10, 2),
        package_duration_days INTEGER,
        min_persons INTEGER DEFAULT 1,
        max_persons INTEGER DEFAULT 10,
        duration_hours INTEGER,
        location VARCHAR(255),
        city VARCHAR(100),
        country VARCHAR(100) DEFAULT 'Nepal',
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        languages TEXT[] DEFAULT '{}',
        includes TEXT[] DEFAULT '{}',
        excludes TEXT[] DEFAULT '{}',
        meeting_point TEXT,
        cancellation_policy TEXT DEFAULT 'Free cancellation up to 24 hours before the tour.',
        images TEXT[] DEFAULT '{}',
        cover_image TEXT,
        tags TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT TRUE,
        is_featured BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        admin_notes TEXT,
        avg_rating DECIMAL(3, 2) DEFAULT 0,
        total_reviews INTEGER DEFAULT 0,
        total_bookings INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        search_vector TSVECTOR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // AVAILABILITY TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS availability (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        is_available BOOLEAN DEFAULT TRUE,
        max_bookings INTEGER DEFAULT 1,
        current_bookings INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(listing_id, date, start_time)
      )
    `);

    // ─────────────────────────────────────────
    // BOOKINGS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_ref VARCHAR(20) UNIQUE NOT NULL,
        listing_id UUID REFERENCES listings(id) ON DELETE RESTRICT,
        traveler_id UUID REFERENCES users(id) ON DELETE SET NULL,
        guide_id UUID REFERENCES guide_profiles(id) ON DELETE SET NULL,
        booking_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        duration_hours INTEGER,
        num_persons INTEGER DEFAULT 1,
        pricing_type VARCHAR(20),
        base_price DECIMAL(10, 2) NOT NULL,
        platform_commission DECIMAL(10, 2) NOT NULL,
        guide_amount DECIMAL(10, 2) NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show')),
        payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
        stripe_payment_intent_id VARCHAR(255),
        stripe_charge_id VARCHAR(255),
        special_requests TEXT,
        meeting_point TEXT,
        guide_notes TEXT,
        cancellation_reason TEXT,
        cancelled_by VARCHAR(20),
        cancelled_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        reminder_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // REVIEWS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
        listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
        guide_id UUID REFERENCES guide_profiles(id) ON DELETE SET NULL,
        traveler_id UUID REFERENCES users(id) ON DELETE SET NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title VARCHAR(255),
        comment TEXT,
        guide_response TEXT,
        guide_response_at TIMESTAMPTZ,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // WISHLISTS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, listing_id)
      )
    `);

    // ─────────────────────────────────────────
    // CHAT CONVERSATIONS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        traveler_id UUID REFERENCES users(id) ON DELETE CASCADE,
        guide_id UUID REFERENCES users(id) ON DELETE CASCADE,
        listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(traveler_id, guide_id, listing_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // TRANSACTIONS TABLE
    // ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
        type VARCHAR(20) CHECK (type IN ('charge', 'refund', 'payout')),
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        stripe_id VARCHAR(255) UNIQUE,
        status VARCHAR(20) DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Refresh tokens — used for short-lived access JWT + long-lived refresh JWT pattern.
    // Each row is a single refresh token. When a token is used we mark consumed_at and
    // issue a new one (rotation). If a consumed token is presented again, we treat it as
    // a stolen token and revoke the entire chain.
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL UNIQUE,  -- SHA-256 of the raw token
        family_id UUID NOT NULL,                  -- groups all tokens issued from one login
        replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
        consumed_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        ip VARCHAR(64),
        user_agent VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // OAuth one-time codes for the redirect → exchange flow.
    // The Google callback issues a short-lived code in the URL; the frontend POSTs it
    // to /auth/oauth/exchange to swap for the real JWT. This keeps tokens out of
    // server logs and Referer headers.
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_codes (
        code VARCHAR(64) PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ─────────────────────────────────────────
    // INDEXES
    // ─────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_guide ON listings(guide_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_traveler ON bookings(traveler_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_guide ON bookings(guide_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`);

    // Hot-path composite indexes:
    // - capacity check on bookings(listing_id, booking_date, status)
    // - common filters: city + status + active
    // - reminder cron: status + payment_status + booking_date
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_listing_date_status ON bookings(listing_id, booking_date, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_city_status_active ON listings(city, status, is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_date_reminder ON bookings(booking_date, status, payment_status) WHERE status = 'confirmed' AND payment_status = 'paid' AND reminder_sent_at IS NULL`);

    // For admin pending-listings sort
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_pending_created ON listings(created_at) WHERE status = 'pending'`);

    // Full-text search GIN index on listings
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_search ON listings USING GIN(search_vector)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_rating ON listings(avg_rating DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(status, is_active)`);

    // Existing audit indexes:
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent ON bookings(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_stripe_charge ON bookings(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_availability_listing_date ON availability(listing_id, date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_traveler ON conversations(traveler_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_guide ON conversations(guide_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conv_read ON messages(conversation_id, sender_id, is_read)`);

    // Drop the legacy cancel_reason column on existing deployments.
    // The column was renamed to cancellation_reason — both used to be written
    // in different places. Run-once cleanup.
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'bookings' AND column_name = 'cancel_reason'
        ) THEN
          UPDATE bookings
             SET cancellation_reason = COALESCE(cancellation_reason, cancel_reason)
           WHERE cancel_reason IS NOT NULL;
          ALTER TABLE bookings DROP COLUMN cancel_reason;
        END IF;
      END $$;
    `);

    // Populate existing rows' search_vector
    await client.query(`
      UPDATE listings SET search_vector =
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(city, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(location, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'D')
    `);

    // Auto-update search_vector on insert/update.
    // Now also includes `category` — searchers can find "hiking" / "cultural" etc.
    await client.query(`
      CREATE OR REPLACE FUNCTION update_listing_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(NEW.city, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(NEW.location, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'D');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_listings_search_vector ON listings;
      CREATE TRIGGER trigger_listings_search_vector
        BEFORE INSERT OR UPDATE OF title, description, city, location, category, tags ON listings
        FOR EACH ROW EXECUTE FUNCTION update_listing_search_vector();
    `);

    // ─────────────────────────────────────────
    // UPDATED_AT TRIGGER
    // ─────────────────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const tablesWithUpdatedAt = ['users', 'guide_profiles', 'listings', 'bookings', 'reviews'];
    for (const table of tablesWithUpdatedAt) {
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_${table}_updated_at ON ${table};
        CREATE TRIGGER trigger_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      `);
    }

    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

createTables().catch(console.error);
