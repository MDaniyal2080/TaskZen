import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import * as cookieParser from "cookie-parser";
import * as bcrypt from "bcryptjs";

import { AppModule } from "../src/app.module";
import { validationConfig } from "../src/config/security.config";
import { PrismaService } from "../src/database/prisma.service";

// Helpers
const unique = () => Date.now() + "-" + Math.floor(Math.random() * 1e6);
const csrfToken = "csrf-test-token";

// Custom parser to collect binary bodies like PDF as Buffer
const parseBinary = (res: any, callback: (err: any, data?: Buffer) => void) => {
  const data: Buffer[] = [];
  res.on("data", (chunk: Buffer) => data.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(data)));
};

describe("Admin Analytics E2E", () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  const adminEmail = `admin+${unique()}@example.com`;
  const adminUsername = `admin_${unique()}`;
  const adminPassword = "AdminPassword1!";

  let adminToken: string;
  let userToken: string; // non-admin

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe(validationConfig));
    app.setGlobalPrefix("api/v1");

    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // Ensure no conflicting users exist (idempotent for re-runs)
    await prisma.user.deleteMany({ where: { OR: [{ email: adminEmail }, { username: adminUsername }] } });

    // Create admin user directly in DB with hashed password
    const hashed = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        username: adminUsername,
        password: hashed,
        role: "ADMIN",
        isActive: true,
      },
    });

    // Login as admin to get JWT
    const loginRes = await request(server)
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({ email: adminEmail, password: adminPassword })
      .expect(201);

    expect(loginRes.body).toHaveProperty("token");
    adminToken = loginRes.body.token;

    // Register a normal user for authZ tests
    const u = unique();
    const regRes = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `user+${u}@example.com`,
        username: `u${Date.now().toString(36)}`,
        password: "Password1!",
        firstName: "Test",
        lastName: "User",
      })
      .expect(201);

    expect(regRes.body).toHaveProperty("token");
    userToken = regRes.body.token;
  });

  afterAll(async () => {
    // Cleanup created users
    await prisma.user.deleteMany({ where: { OR: [{ email: adminEmail }, { username: adminUsername }] } });
    await prisma?.$disconnect();
    await app.close();
  });

  const expectAnalyticsShape = (body: any) => {
    expect(body).toHaveProperty("overview");
    expect(body).toHaveProperty("revenue");
    expect(body).toHaveProperty("growth");
    expect(body).toHaveProperty("taskMetrics");
    expect(body).toHaveProperty("boardMetrics");
    expect(body).toHaveProperty("userActivity");

    expect(body.overview).toEqual(
      expect.objectContaining({
        totalUsers: expect.any(Number),
        activeUsers: expect.any(Number),
        totalBoards: expect.any(Number),
        totalTasks: expect.any(Number),
        proUsers: expect.any(Number),
        completionRate: expect.any(Number),
        avgTasksPerUser: expect.any(Number),
      }),
    );

    expect(body.revenue).toEqual(
      expect.objectContaining({
        mrr: expect.any(Number),
        arr: expect.any(Number),
        monthly: expect.any(Array),
        byPlan: expect.any(Array),
        churnRate: expect.any(Number),
      }),
    );

    expect(body.growth).toEqual(
      expect.objectContaining({
        userGrowth: expect.any(Number),
        boardGrowth: expect.any(Number),
        taskGrowth: expect.any(Number),
        revenueGrowth: expect.any(Number),
      }),
    );

    expect(body.taskMetrics).toEqual(
      expect.objectContaining({
        byStatus: expect.any(Array),
        byPriority: expect.any(Array),
        avgCompletionTime: expect.any(Number),
        overdueTasks: expect.any(Number),
        overview: expect.any(Object),
      }),
    );

    expect(body.boardMetrics).toEqual(
      expect.objectContaining({
        avgListsPerBoard: expect.any(Number),
        avgCardsPerBoard: expect.any(Number),
        mostActiveBoards: expect.any(Array),
      }),
    );

    expect(body.userActivity).toEqual(
      expect.objectContaining({
        daily: expect.any(Array),
        weekly: expect.any(Array),
        monthly: expect.any(Array),
      }),
    );
  };

  it("enforces authN: 401 without JWT on analytics and export", async () => {
    await request(server).get("/api/v1/admin/analytics").expect(401);
    await request(server).get("/api/v1/admin/analytics/export?format=csv").expect(401);
  });

  it("enforces authZ: 403 for non-admin user", async () => {
    await request(server)
      .get("/api/v1/admin/analytics")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(403);

    await request(server)
      .get("/api/v1/admin/analytics/export?format=pdf")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(403);
  });

  it("returns analytics for admin across time ranges", async () => {
    const ranges = [undefined, "7d", "30d", "90d", "1y"] as const;
    for (const tr of ranges) {
      const url = tr
        ? `/api/v1/admin/analytics?timeRange=${encodeURIComponent(tr)}`
        : "/api/v1/admin/analytics";
      const res = await request(server)
        .get(url)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expectAnalyticsShape(res.body);
    }
  });

  it("exports analytics as CSV with correct headers and content", async () => {
    const res = await request(server)
      .get("/api/v1/admin/analytics/export?format=csv&timeRange=7d")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect("Content-Type", /text\/csv/)
      .expect(200);

    const disp = res.header["content-disposition"] || res.header["Content-Disposition"];
    expect(disp).toMatch(/attachment; filename=taskzen-analytics-.*\.csv/);

    // Verify CSV content basics
    expect(res.text).toContain("Metric,Value");
    expect(res.text).toContain("Total Users,");
    expect(res.text).toContain("Monthly Revenue,");
  });

  it("defaults to CSV when format is omitted", async () => {
    const res = await request(server)
      .get("/api/v1/admin/analytics/export?timeRange=30d")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect("Content-Type", /text\/csv/)
      .expect(200);

    expect(res.text.startsWith("Metric,Value")).toBe(true);
  });

  it("exports analytics as PDF with correct headers and binary body", async () => {
    const res = await request(server)
      .get("/api/v1/admin/analytics/export?format=pdf&timeRange=30d")
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse(parseBinary)
      .expect("Content-Type", /application\/pdf/)
      .expect(200);

    const disp = res.header["content-disposition"] || res.header["Content-Disposition"];
    expect(disp).toMatch(/attachment; filename=taskzen-analytics-.*\.pdf/);

    const lenHeader = res.header["content-length"] || res.header["Content-Length"];
    const len = lenHeader ? parseInt(lenHeader, 10) : (res.body ? (res.body as Buffer).length : 0);
    expect(len).toBeGreaterThan(0);

    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });
});
