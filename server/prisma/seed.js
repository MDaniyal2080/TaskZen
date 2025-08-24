"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new client_1.PrismaClient();
async function ensureDemoUsers(minUsers = 10) {
    const count = await prisma.user.count();
    if (count >= minUsers) {
        return prisma.user.findMany({ select: { id: true }, take: minUsers });
    }
    const toCreate = Array.from({ length: minUsers - count }).map((_, i) => ({
        email: `demo${i + 1}@example.com`,
        username: `demo_user_${i + 1}`,
        password: '$2a$10$4Vt6b5kPnYJ0Zbqk0kT4Qe7C0yWk3kJH2q5Wg8p0b6zCq9zPpQ0dK',
        isPro: Math.random() > 0.4,
        proExpiresAt: Math.random() > 0.5 ? new Date(Date.now() + Math.floor(Math.random() * 365) * 86400000) : null,
    }));
    for (const data of toCreate) {
        try {
            await prisma.user.create({ data });
        }
        catch (e) {
        }
    }
    return prisma.user.findMany({ select: { id: true }, take: minUsers });
}
function randomStatus() {
    const pool = [
        client_1.TransactionStatus.SUCCEEDED,
        client_1.TransactionStatus.PENDING,
        client_1.TransactionStatus.REFUNDED,
        client_1.TransactionStatus.FAILED,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}
function randomPlan() {
    const monthly = Math.random() < 0.7;
    const amount = monthly ? new client_1.Prisma.Decimal(9.99) : new client_1.Prisma.Decimal(9.99 * 12);
    return { plan: monthly ? 'Pro Monthly' : 'Pro Annual', amount };
}
async function seedTransactions(target = 120) {
    const existing = await prisma.transaction.count();
    if (existing >= target) {
        console.log(`Transactions already seeded (count=${existing}). Skipping.`);
        return;
    }
    const users = await prisma.user.findMany({ select: { id: true }, take: 200 });
    if (users.length === 0) {
        await ensureDemoUsers(10);
    }
    const userIds = (await prisma.user.findMany({ select: { id: true } })).map(u => u.id);
    const now = Date.now();
    const data = Array.from({ length: target - existing }).map((_, i) => {
        const { plan, amount } = randomPlan();
        const daysAgo = Math.floor(Math.random() * 90);
        const createdAt = new Date(now - daysAgo * 86400000);
        const userId = userIds[i % userIds.length];
        return {
            userId,
            plan,
            amount,
            currency: 'USD',
            status: randomStatus(),
            createdAt,
            metadata: {},
        };
    });
    await prisma.transaction.createMany({ data });
    console.log(`Seeded ${data.length} transactions.`);
}
async function ensureAdmin(email, rawPassword) {
    const existing = await prisma.user.findUnique({ where: { email } });
    const hashed = await bcrypt.hash(rawPassword, 12);
    if (existing) {
        const updated = await prisma.user.update({
            where: { id: existing.id },
            data: { password: hashed, role: client_1.UserRole.ADMIN, isActive: true },
        });
        return updated;
    }
    let base = 'admin';
    let username = base;
    let attempt = 0;
    while (true) {
        try {
            const created = await prisma.user.create({
                data: {
                    email,
                    username,
                    password: hashed,
                    role: client_1.UserRole.ADMIN,
                    isActive: true,
                },
            });
            return created;
        }
        catch (e) {
            if (e?.code === 'P2002') {
                attempt += 1;
                username = `${base}${attempt}`;
                continue;
            }
            throw e;
        }
    }
}
async function purgeData(adminId) {
    try {
        await prisma.systemSettings.updateMany({ data: { updatedById: null } });
    }
    catch { }
    await prisma.transaction.deleteMany({ where: { userId: { not: adminId } } });
    try {
        await prisma.activity.deleteMany({ where: { userId: { not: adminId } } });
    }
    catch { }
    try {
        await prisma.card.updateMany({
            where: { AND: [{ assigneeId: { not: null } }, { assigneeId: { not: adminId } }] },
            data: { assigneeId: null },
        });
    }
    catch { }
    try {
        await prisma.moderationAction.deleteMany({});
    }
    catch { }
    try {
        await prisma.violation.deleteMany({});
    }
    catch { }
    try {
        await prisma.contentReport.deleteMany({});
    }
    catch { }
    try {
        await prisma.analyticsEvent.deleteMany({});
    }
    catch { }
    try {
        await prisma.userSession.deleteMany({});
    }
    catch { }
    try {
        await prisma.board.deleteMany({ where: { ownerId: { not: adminId } } });
    }
    catch { }
    try {
        await prisma.boardTemplate.deleteMany({ where: { ownerId: { not: adminId } } });
    }
    catch { }
    await prisma.user.deleteMany({ where: { id: { not: adminId } } });
}
async function main() {
    const adminEmail = 'admin@gmail.com';
    const adminPassword = 'admin@gmail.com';
    const admin = await ensureAdmin(adminEmail, adminPassword);
    await purgeData(admin.id);
    console.log(`Seeding complete. Admin user: ${admin.email}`);
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=seed.js.map