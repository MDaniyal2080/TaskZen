import { PrismaClient, TransactionStatus, Prisma, UserRole } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function ensureDemoUsers(minUsers = 10) {
  const count = await prisma.user.count()
  if (count >= minUsers) {
    return prisma.user.findMany({ select: { id: true }, take: minUsers })
  }

  const toCreate = Array.from({ length: minUsers - count }).map((_, i) => ({
    email: `demo${i + 1}@example.com`,
    username: `demo_user_${i + 1}`,
    password: '$2a$10$4Vt6b5kPnYJ0Zbqk0kT4Qe7C0yWk3kJH2q5Wg8p0b6zCq9zPpQ0dK', // bcrypt for 'password'
    isPro: Math.random() > 0.4,
    proExpiresAt: Math.random() > 0.5 ? new Date(Date.now() + Math.floor(Math.random() * 365) * 86400000) : null,
  }))

  // Create users individually to respect unique constraints
  for (const data of toCreate) {
    try {
      await prisma.user.create({ data })
    } catch (e) {
      // ignore duplicates if any race
    }
  }

  return prisma.user.findMany({ select: { id: true }, take: minUsers })
}

function randomStatus(): TransactionStatus {
  const pool = [
    TransactionStatus.SUCCEEDED,
    TransactionStatus.PENDING,
    TransactionStatus.REFUNDED,
    TransactionStatus.FAILED,
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

function randomPlan(): { plan: string; amount: Prisma.Decimal } {
  const monthly = Math.random() < 0.7
  const amount = monthly ? new Prisma.Decimal(9.99) : new Prisma.Decimal(9.99 * 12)
  return { plan: monthly ? 'Pro Monthly' : 'Pro Annual', amount }
}

async function seedTransactions(target = 120) {
  const existing = await prisma.transaction.count()
  if (existing >= target) {
    console.log(`Transactions already seeded (count=${existing}). Skipping.`)
    return
  }

  const users = await prisma.user.findMany({ select: { id: true }, take: 200 })
  if (users.length === 0) {
    await ensureDemoUsers(10)
  }
  const userIds = (await prisma.user.findMany({ select: { id: true } })).map(u => u.id)

  const now = Date.now()
  const data: Prisma.TransactionCreateManyInput[] = Array.from({ length: target - existing }).map((_, i) => {
    const { plan, amount } = randomPlan()
    const daysAgo = Math.floor(Math.random() * 90)
    const createdAt = new Date(now - daysAgo * 86400000)
    const userId = userIds[i % userIds.length]
    return {
      userId,
      plan,
      amount,
      currency: 'USD',
      status: randomStatus(),
      createdAt,
      metadata: {},
    }
  })

  await prisma.transaction.createMany({ data })
  console.log(`Seeded ${data.length} transactions.`)
}

// Ensure an admin user exists and has the specified password
async function ensureAdmin(email: string, rawPassword: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  const hashed = await bcrypt.hash(rawPassword, 12)

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed, role: UserRole.ADMIN, isActive: true },
    })
    return updated
  }

  let base = 'admin'
  let username = base
  let attempt = 0
  while (true) {
    try {
      const created = await prisma.user.create({
        data: {
          email,
          username,
          password: hashed,
          role: UserRole.ADMIN,
          isActive: true,
        },
      })
      return created
    } catch (e: any) {
      // Handle unique constraint on username
      if (e?.code === 'P2002') {
        attempt += 1
        username = `${base}${attempt}`
        continue
      }
      throw e
    }
  }
}

// Purge demo data and keep only the admin user
async function purgeData(adminId: string) {
  // Detach potential FK references to users to allow deletion
  try {
    await prisma.systemSettings.updateMany({ data: { updatedById: null } })
  } catch {}

  // Remove non-admin transactions and other potential seeded artifacts
  await prisma.transaction.deleteMany({ where: { userId: { not: adminId } } })

  // Remove activities by non-admin users to avoid FK issues
  try { await prisma.activity.deleteMany({ where: { userId: { not: adminId } } }) } catch {}

  // Null out assignee for cards assigned to non-admin users
  try {
    await prisma.card.updateMany({
      where: { AND: [{ assigneeId: { not: null } }, { assigneeId: { not: adminId } }] },
      data: { assigneeId: null },
    })
  } catch {}

  // Clean moderation and analytics data that could reference users
  try { await prisma.moderationAction.deleteMany({}) } catch {}
  try { await prisma.violation.deleteMany({}) } catch {}
  try { await prisma.contentReport.deleteMany({}) } catch {}
  try { await prisma.analyticsEvent.deleteMany({}) } catch {}
  try { await prisma.userSession.deleteMany({}) } catch {}

  // Optionally remove boards/templates not owned by admin (will cascade children)
  try { await prisma.board.deleteMany({ where: { ownerId: { not: adminId } } }) } catch {}
  try { await prisma.boardTemplate.deleteMany({ where: { ownerId: { not: adminId } } }) } catch {}

  // Finally, remove all users except the admin
  await prisma.user.deleteMany({ where: { id: { not: adminId } } })
}

// Ensure a default system settings row exists with safe defaults
async function ensureSystemSettingsDefault(updatedById?: string | null) {
  const defaults = {
    general: {
      siteName: 'TaskZen',
    },
    maintenance: {
      enabled: false,
      message: null as string | null,
      scheduledAt: null as string | null,
      estimatedDuration: null as string | number | null,
    },
    features: {
      enableRegistration: true,
      enableGoogleAuth: false,
      enableEmailNotifications: true,
      enableRealTimeUpdates: true,
      enableFileUploads: true,
      enableComments: true,
      enablePublicBoards: false,
      enableAnalytics: true,
    },
  }

  const existing = await prisma.systemSettings.findUnique({ where: { id: 'default' } })
  const current = (existing?.data as any) || {}
  const merged = {
    ...defaults,
    ...current,
    maintenance: { ...defaults.maintenance, ...(current.maintenance || {}) },
    features: { ...defaults.features, ...(current.features || {}) },
    general: { ...defaults.general, ...(current.general || {}) },
  }
  // Sanitize deprecated keys from general settings
  const mergedAny: any = merged
  const { siteUrl: _siteUrl, supportEmail: _supportEmail, ...cleanGeneral } = mergedAny.general || {}
  mergedAny.general = cleanGeneral

  await prisma.systemSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', data: merged as Prisma.InputJsonValue, updatedById: updatedById || null },
    update: { data: merged as Prisma.InputJsonValue, updatedById: updatedById || null },
  })
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin@gmail.com'
  const purge = String(process.env.SEED_PURGE || '').toLowerCase() === 'true'

  const admin = await ensureAdmin(adminEmail, adminPassword)

  if (purge) {
    await purgeData(admin.id)
  }

  await ensureSystemSettingsDefault(admin.id)
  console.log(`Seeding complete. Admin user: ${admin.email}${purge ? ' (purge applied)' : ''}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
