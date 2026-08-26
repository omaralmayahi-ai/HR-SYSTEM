// src/db/users.ts
import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function seedAdminUser() {
  try {
    const [adminUser] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    if (!adminUser) {
      console.log('Seeding default admin user...');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.insert(users).values({
        username: 'admin',
        password: hashedPassword,
        name: 'مدير النظام',
        role: 'admin',
        email: 'admin@hr.gov.iq'
      });
      console.log('Default admin user seeded successfully.');
    }
  } catch (error) {
    console.warn('Database offline, skipping admin user seeding');
  }
}

