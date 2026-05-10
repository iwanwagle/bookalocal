require('dotenv').config({ path: '../../.env' });
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const seed = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('🌱 Seeding database...');

    // Clear existing data (in order due to FK constraints)
    await client.query('TRUNCATE messages, conversations, wishlists, reviews, bookings, availability, listings, guide_profiles, transactions, users RESTART IDENTITY CASCADE');

    const salt = await bcrypt.genSalt(10);

    // ─── USERS ───
    const adminId = uuidv4();
    const guide1Id = uuidv4();
    const guide2Id = uuidv4();
    const guide3Id = uuidv4();
    const traveler1Id = uuidv4();
    const traveler2Id = uuidv4();

    await client.query(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role, is_verified, avatar_url) VALUES
      ($1, 'admin@bookalocal.com', $2, 'Admin', 'User', '+9779800000000', 'admin', true, 'https://ui-avatars.com/api/?name=Admin+User&background=2563eb&color=fff'),
      ($3, 'hari@guide.com', $4, 'Hari', 'Bahadur Thapa', '+9779801234567', 'guide', true, 'https://ui-avatars.com/api/?name=Hari+Thapa&background=16a34a&color=fff'),
      ($5, 'maya@guide.com', $6, 'Maya', 'Sherpa', '+9779807654321', 'guide', true, 'https://ui-avatars.com/api/?name=Maya+Sherpa&background=ea580c&color=fff'),
      ($7, 'ram@guide.com', $8, 'Ram', 'Prasad Poudel', '+9779812345678', 'guide', true, 'https://ui-avatars.com/api/?name=Ram+Poudel&background=7c3aed&color=fff'),
      ($9, 'sarah@traveler.com', $10, 'Sarah', 'Johnson', '+12025551234', 'traveler', true, 'https://ui-avatars.com/api/?name=Sarah+Johnson&background=db2777&color=fff'),
      ($11, 'mike@traveler.com', $12, 'Mike', 'Chen', '+14155559876', 'traveler', true, 'https://ui-avatars.com/api/?name=Mike+Chen&background=0891b2&color=fff')
    `, [
      adminId, await bcrypt.hash('Admin@123', salt),
      guide1Id, await bcrypt.hash('Guide@123', salt),
      guide2Id, await bcrypt.hash('Guide@123', salt),
      guide3Id, await bcrypt.hash('Guide@123', salt),
      traveler1Id, await bcrypt.hash('Travel@123', salt),
      traveler2Id, await bcrypt.hash('Travel@123', salt),
    ]);

    // ─── GUIDE PROFILES ───
    const gProfile1Id = uuidv4();
    const gProfile2Id = uuidv4();
    const gProfile3Id = uuidv4();

    await client.query(`
      INSERT INTO guide_profiles (id, user_id, bio, languages, specialties, years_experience, location, city, country, latitude, longitude, profile_status, avg_rating, total_reviews, total_bookings) VALUES
      ($1, $2, 
        'I am a certified trekking guide with over 10 years of experience leading groups through the majestic Himalayas. Born and raised in Kathmandu, I have deep knowledge of Nepal''s culture, history, and hidden gems. I specialize in Everest Base Camp, Annapurna Circuit, and cultural city tours.',
        ARRAY['Nepali','English','Hindi'], ARRAY['Trekking','Everest Region','Cultural Tours','Photography'], 10,
        'Thamel, Kathmandu', 'Kathmandu', 'Nepal', 27.7172, 85.3240, 'approved', 4.9, 87, 120),
      ($3, $4,
        'Adventure seeker and professional mountain guide from Solukhumbu district. I have summited multiple 6000m+ peaks and guided hundreds of trekkers safely through Nepal''s most challenging trails. Fluent in 4 languages, I make every journey educational and safe.',
        ARRAY['Nepali','English','Japanese','German'], ARRAY['Mountaineering','Trekking','Wildlife','Photography Tours'], 8,
        'Thamel, Kathmandu', 'Kathmandu', 'Nepal', 27.7089, 85.3153, 'approved', 4.8, 65, 95),
      ($5, $6,
        'Passionate about Nepal''s rich spiritual heritage and culinary traditions. I offer unique food tours, temple visits, and meditation retreats. As a yoga instructor and cultural enthusiast, I provide immersive experiences that go beyond typical tourist trails.',
        ARRAY['Nepali','English','French'], ARRAY['Cultural Tours','Food Tours','Spiritual Retreats','City Tours'], 6,
        'Patan, Lalitpur', 'Lalitpur', 'Nepal', 27.6644, 85.3188, 'approved', 4.7, 43, 68)
    `, [gProfile1Id, guide1Id, gProfile2Id, guide2Id, gProfile3Id, guide3Id]);

    // ─── LISTINGS ───
    const listing1Id = uuidv4();
    const listing2Id = uuidv4();
    const listing3Id = uuidv4();
    const listing4Id = uuidv4();
    const listing5Id = uuidv4();

    await client.query(`
      INSERT INTO listings (id, guide_id, title, slug, description, category, pricing_type, price_per_day, package_price, package_duration_days, min_persons, max_persons, location, city, country, latitude, longitude, languages, includes, excludes, meeting_point, images, cover_image, tags, status, is_featured, avg_rating, total_reviews, total_bookings) VALUES
      ($1, $2,
        'Everest Base Camp Trek — 14 Days',
        'everest-base-camp-trek-14-days',
        'Experience the adventure of a lifetime with our fully guided Everest Base Camp Trek. Walk in the footsteps of legends like Edmund Hillary and Tenzing Norgay. This 14-day journey takes you through breathtaking Sherpa villages, ancient monasteries, and dramatic glacial landscapes, culminating at 5,364m base camp with iconic views of the world''s highest peak.',
        'hiking', 'package', NULL, 1850.00, 14, 1, 8,
        'Lukla to Everest Base Camp', 'Namche Bazaar', 'Nepal', 27.8069, 86.7238,
        ARRAY['Nepali','English'], 
        ARRAY['Professional certified guide','All accommodation (teahouses)','3 meals per day','All permits (TIMS + Sagarmatha NP)','Emergency first aid kit','Duffel bag & sleeping bag','Airport transfers'],
        ARRAY['International flights','Travel insurance','Personal trekking gear','Tips for guide & porters','Alcoholic beverages'],
        'Tribhuvan International Airport, Kathmandu',
        ARRAY['''{}''],
        'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800',
        ARRAY['everest','trekking','himalayas','adventure','14-days'], 'approved', true, 4.9, 42, 68),
        
      ($3, $4,
        'Annapurna Circuit — 10 Day Trek',
        'annapurna-circuit-10-day-trek',
        'Circumnavigate the Annapurna massif on one of the world''s greatest trekking routes. This 10-day guided adventure crosses Thorong La Pass (5,416m), the world''s highest trekable mountain pass. Experience stunning diversity — lush subtropical forests to high-altitude deserts, Gurung villages to Tibetan-influenced settlements.',
        'hiking', 'package', NULL, 1250.00, 10, 1, 6,
        'Besisahar to Pokhara', 'Pokhara', 'Nepal', 28.2096, 83.9856,
        ARRAY['Nepali','English','Japanese'],
        ARRAY['Expert mountain guide','Accommodation in teahouses','All meals on trail','ACAP & TIMS permits','First aid and safety equipment','Acclimatization guidance'],
        ARRAY['Flights to/from Nepal','Travel insurance','Personal trekking equipment','Porter services (available at extra cost)'],
        'Kathmandu Bus Station or Pokhara',
        ARRAY['{}'],
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        ARRAY['annapurna','trekking','pass','adventure','10-days'], 'approved', false, 4.8, 31, 48),

      ($5, $6,
        'Kathmandu Cultural Heritage Day Tour',
        'kathmandu-cultural-heritage-day-tour',
        'Explore the spiritual heart of Nepal in a full-day UNESCO World Heritage tour. Visit Pashupatinath Temple, Boudhanath Stupa, Swayambhunath (Monkey Temple), and the medieval Durbar Squares. Your expert local guide brings history alive with stories of Hindu and Buddhist traditions, royal intrigue, and living cultural practices.',
        'cultural', 'daily', 85.00, NULL, NULL, 1, 10,
        'Kathmandu Valley', 'Kathmandu', 'Nepal', 27.7172, 85.3240,
        ARRAY['Nepali','English','French'],
        ARRAY['Professional guide (8 hours)','Private vehicle with driver','Entrance fees to all sites','Traditional Newari lunch','Bottled water','City map and guidebook'],
        ARRAY['Personal expenses','Tips','Accommodation'],
        'Thamel, Kathmandu (your hotel or designated meeting point)',
        ARRAY['{}'],
        'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=800',
        ARRAY['kathmandu','cultural','heritage','UNESCO','day-tour'], 'approved', true, 4.7, 28, 52),

      ($7, $2,
        'Sunrise Photography Tour — Nagarkot',
        'sunrise-photography-nagarkot',
        'Capture the most breathtaking sunrise views of the Himalayas from Nagarkot (2,175m). Our photography-focused sunrise tour takes you to the best vantage points before dawn, with professional guidance on composition, lighting, and camera settings. On clear days, you can see 8 Himalayan peaks including Everest and Manaslu.',
        'photography', 'daily', 65.00, NULL, NULL, 1, 6,
        'Nagarkot, Bhaktapur', 'Bhaktapur', 'Nepal', 27.7175, 85.5220,
        ARRAY['Nepali','English'],
        ARRAY['Photography guide','Sunrise viewpoint access','Transportation from Kathmandu','Hot tea/coffee at viewpoint','Post-processing tips session'],
        ARRAY['Camera equipment','Personal expenses','Accommodation in Nagarkot'],
        'Thamel, Kathmandu (4:00 AM departure)',
        ARRAY['{}'],
        'https://images.unsplash.com/photo-1609766418204-94aae0ecfdfc?w=800',
        ARRAY['photography','sunrise','nagarkot','himalayas','mountains'], 'approved', false, 4.9, 19, 35),
        
      ($8, $9,
        'Kathmandu Street Food Safari',
        'kathmandu-street-food-safari',
        'Embark on a mouthwatering journey through Kathmandu''s vibrant food scene. Sample momos, sel roti, chatamari (Newari crepe), kwati, and other local delicacies at the best street vendors and hidden local eateries. Learn about the cultural significance of Newari cuisine and the spices that make Nepali food unique.',
        'food_tour', 'hourly', 25.00, NULL, NULL, 1, 8,
        'Old Town Kathmandu', 'Kathmandu', 'Nepal', 27.7041, 85.3145,
        ARRAY['Nepali','English','French'],
        ARRAY['Experienced food guide (4 hours)','All food tastings (10+ items)','Recipes to take home','Local market visit','Traditional tea ceremony'],
        ARRAY['Transportation','Alcoholic beverages','Additional food purchases'],
        'Indra Chowk, Old Kathmandu',
        ARRAY['{}'],
        'https://images.unsplash.com/photo-1567529692333-de9fd6772897?w=800',
        ARRAY['food','street-food','kathmandu','culinary','culture'], 'approved', false, 4.6, 22, 40)
    `, [listing1Id, gProfile1Id, listing2Id, gProfile2Id, listing3Id, gProfile3Id, listing4Id, gProfile1Id, listing5Id, gProfile3Id]);

    // ─── BOOKINGS ───
    const booking1Id = uuidv4();
    const booking2Id = uuidv4();

    await client.query(`
      INSERT INTO bookings (id, booking_ref, listing_id, traveler_id, guide_id, booking_date, num_persons, pricing_type, base_price, platform_commission, guide_amount, total_amount, status, payment_status, special_requests) VALUES
      ($1, 'BL-2024-0001', $2, $3, $4, '2024-02-15', 2, 'package', 3700.00, 555.00, 3145.00, 3700.00, 'completed', 'paid', 'We are photography enthusiasts, please plan extra time at scenic spots'),
      ($5, 'BL-2024-0002', $6, $7, $8, '2024-03-01', 3, 'daily', 255.00, 38.25, 216.75, 255.00, 'confirmed', 'paid', NULL)
    `, [booking1Id, listing1Id, traveler1Id, gProfile1Id, booking2Id, listing3Id, traveler2Id, gProfile3Id]);

    // ─── REVIEWS ───
    await client.query(`
      INSERT INTO reviews (booking_id, listing_id, guide_id, traveler_id, rating, title, comment) VALUES
      ($1, $2, $3, $4, 5, 'Life-changing experience!', 'Hari is an exceptional guide. His deep knowledge of the Himalayas, combined with his warm personality, made this trek unforgettable. He kept us safe through challenging weather and always had the best stories about local culture. The 15% upfront payment system worked perfectly — easy to pay the rest directly.'),
      ($1, $2, $3, $4, 5, 'Best trekking guide in Nepal!', 'Simply outstanding. From logistics to altitude sickness management, Hari handled everything professionally. Highly recommend!')
    `, [booking1Id, listing1Id, gProfile1Id, traveler1Id]);

    await client.query('COMMIT');
    console.log('✅ Database seeded successfully!');
    console.log('\n📋 Test Accounts:');
    console.log('  Admin:    admin@bookalocal.com / Admin@123');
    console.log('  Guide:    hari@guide.com / Guide@123');
    console.log('  Traveler: sarah@traveler.com / Travel@123');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(console.error);
