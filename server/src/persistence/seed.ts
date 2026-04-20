/**
 * Seed the DB with:
 *  - 38 cart slots (Cart 01..Cart 38, no IMEI — bound on first tracker connect)
 *  - A default perimeter fence (course center + 300m)
 *  - A default admin user: admin@caddy.local / caddy1234
 *  - A handful of sample drivers
 *
 * Idempotent: re-running never duplicates.
 */

import bcrypt from 'bcrypt';
import { getDb } from './db.js';
import { cartsRepo, cartStateRepo } from './repositories/carts.js';
import { fencesRepo } from './repositories/fences.js';
import { usersRepo } from './repositories/users.js';
import { driversRepo } from './repositories/drivers.js';
import { logger } from '../util/logger.js';
import { config } from '../util/config.js';

const DEFAULT_COURSE = { lat: 33.444406, lng: 72.862765 };
const DEFAULT_FENCE_RADIUS_M = 300;

const SAMPLE_DRIVERS = [
  { name: 'Ayesha Khan', role: 'Senior Caddy' },
  { name: 'Bilal Ahmed', role: 'Caddy' },
  { name: 'Fatima Zaidi', role: 'Marshal' },
  { name: 'Hamza Malik', role: 'Caddy' },
  { name: 'Imran Shah', role: 'Groundskeeper' },
  { name: 'Mariam Tariq', role: 'Caddy' },
  { name: 'Omar Farooq', role: 'Caddy' },
  { name: 'Saad Hussain', role: 'Senior Caddy' },
  { name: 'Zainab Abbas', role: 'Marshal' },
];

export async function seed(): Promise<void> {
  getDb(); // init

  // 1. Default admin
  const existing = usersRepo.getByEmail('admin@caddy.local');
  if (!existing) {
    const hash = await bcrypt.hash('caddy1234', 10);
    usersRepo.create({
      email: 'admin@caddy.local',
      name: 'System Admin',
      pwd_hash: hash,
      role: 'admin',
    });
    logger.info('Seeded default admin: admin@caddy.local / caddy1234');
  }

  // 2. Default operator
  const op = usersRepo.getByEmail('operator@caddy.local');
  if (!op) {
    const hash = await bcrypt.hash('operator1234', 10);
    usersRepo.create({
      email: 'operator@caddy.local',
      name: 'Marshal Operator',
      pwd_hash: hash,
      role: 'operator',
    });
  }

  // 3. Viewer
  const viewer = usersRepo.getByEmail('viewer@caddy.local');
  if (!viewer) {
    const hash = await bcrypt.hash('viewer1234', 10);
    usersRepo.create({
      email: 'viewer@caddy.local',
      name: 'Club Viewer',
      pwd_hash: hash,
      role: 'viewer',
    });
  }

  // 4. Sample drivers (only if empty)
  if (driversRepo.list().length === 0) {
    for (const d of SAMPLE_DRIVERS) {
      driversRepo.create({
        name: d.name,
        avatar_url: null,
        role: d.role,
        phone: null,
        notes: null,
      });
    }
    logger.info('Seeded sample drivers');
  }

  // 5. 38 cart slots
  const drivers = driversRepo.list();
  for (let i = 1; i <= config.fleetSize; i++) {
    const cartId = String(i).padStart(2, '0');
    const existingCart = cartsRepo.get(cartId);
    if (!existingCart) {
      const driverId = drivers[(i - 1) % drivers.length]?.id ?? null;
      cartsRepo.upsert({
        cart_id: cartId,
        name: `Cart ${cartId}`,
        imei: null,
        driver_id: driverId,
        vehicle_tag: `CC-${cartId}`,
        notes: null,
      });
      cartStateRepo.upsert({
        cart_id: cartId,
        ts: Date.now(),
        lat: null,
        lng: null,
        speed_kph: 0,
        course: 0,
        battery_pct: null,
        ext_v: null,
        bat_v: null,
        sat: 0,
        hdop: 0,
        odometer_m: 0,
        in_sta: 0,
        out_sta: 0,
        system_sta: 0,
        fix_flag: 'V',
        status: 'OFFLINE',
        bypass_active: 0,
        bypass_ends_at: null,
        last_alm_code: null,
        connected: 0,
      });
    }
  }

  // 6. Default perimeter fence
  if (fencesRepo.list().length === 0) {
    fencesRepo.upsert({
      idx: 1,
      name: 'Course Perimeter',
      lat: DEFAULT_COURSE.lat,
      lng: DEFAULT_COURSE.lng,
      radius_m: DEFAULT_FENCE_RADIUS_M,
      flag: 2, // alarm on entry = kill event
      enabled: 1,
    });
    logger.info('Seeded default perimeter fence (300m around course center)');
  }

  logger.info('Seed complete');
}

// Allow running directly.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  seed().catch((e) => {
    logger.error(e, 'seed failed');
    process.exit(1);
  });
}
