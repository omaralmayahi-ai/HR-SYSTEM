// src/db/users.ts
import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function seedAdminUser() {
  try {
    const [adminUser] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    if (!adminUser) {
      console.log('Seeding default admin user...');
      await db.insert(users).values({
        username: 'admin',
        password: 'admin123', // stored simple/plain as requested or basic secure
        name: 'مدير النظام',
        role: 'admin',
        email: 'admin@hr.gov.iq'
      });
      console.log('Default admin user seeded successfully.');
    }
  } catch (error) {
    console.error('Failed to seed admin user:', error);
  }
}
