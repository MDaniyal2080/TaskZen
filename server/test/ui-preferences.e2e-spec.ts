import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";
import { validationConfig } from "../src/config/security.config";

// Helpers
const unique = () =>
  Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 6);
const csrfToken = "csrf-test-token";

describe("UI Preferences E2E - labelDisplay + legacy fallback", () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  let userA: any;
  let tokenA: string;
  let userB: any;
  let tokenB: string;
  let userC: any;
  let tokenC: string;

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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app.close();
  });

  it("registers userA and returns token", async () => {
    const u = unique();
    const res = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `userA+${u}@example.com`,
        username: `userA_${u}`,
        password: "Password1!",
        firstName: "Test",
        lastName: "UserA",
      })
      .expect(201);

    userA = res.body.user;
    tokenA = res.body.token;
    expect(userA).toHaveProperty("id");
  });

  it("GET defaults returns labelDisplay 'chips' (fallback to alwaysShowLabels=true)", async () => {
    const res = await request(server)
      .get(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body).toHaveProperty("board");
    expect(res.body.board).toMatchObject({
      labelDisplay: "chips",
    });
    // Legacy key may be present in defaults
    expect(res.body.board.alwaysShowLabels).toBe(true);
  });

  it("PUT with explicit labelDisplay persists and reads back", async () => {
    const update = { board: { labelDisplay: "blocks" as const } };
    const put = await request(server)
      .put(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(update)
      .expect(200);

    expect(put.body.board.labelDisplay).toBe("blocks");

    const get = await request(server)
      .get(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(get.body.board.labelDisplay).toBe("blocks");
  });

  it("registers userC for legacy fallback tests", async () => {
    const u = unique();
    const res = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `userC+${u}@example.com`,
        username: `userC_${u}`,
        password: "Password1!",
        firstName: "Test",
        lastName: "UserC",
      })
      .expect(201);

    userC = res.body.user;
    tokenC = res.body.token;
    expect(userC).toHaveProperty("id");
  });

  it("legacy fallback: only alwaysShowLabels=true -> labelDisplay='chips' (userC)", async () => {
    const update = { board: { alwaysShowLabels: true } };
    const res = await request(server)
      .put(`/api/v1/users/${userC.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenC}`)
      .send(update)
      .expect(200);

    expect(res.body.board).toMatchObject({
      alwaysShowLabels: true,
      labelDisplay: "chips",
    });
  });

  it("legacy fallback: only alwaysShowLabels=false -> labelDisplay='blocks' (userC)", async () => {
    const update = { board: { alwaysShowLabels: false } };
    const res = await request(server)
      .put(`/api/v1/users/${userC.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenC}`)
      .send(update)
      .expect(200);

    expect(res.body.board).toMatchObject({
      alwaysShowLabels: false,
      labelDisplay: "blocks",
    });
  });

  it("supports 'hover' mode explicitly", async () => {
    const update = { board: { labelDisplay: "hover" as const } };
    const res = await request(server)
      .put(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(update)
      .expect(200);

    expect(res.body.board.labelDisplay).toBe("hover");
  });

  it("rejects invalid labelDisplay value", async () => {
    await request(server)
      .put(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ board: { labelDisplay: "invalid" } })
      .expect(400);
  });

  it("merges board prefs: preserves other keys while updating labelDisplay", async () => {
    // First set a non-label flag
    const preset = { board: { enableAnimations: false } };
    const presetRes = await request(server)
      .put(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(preset)
      .expect(200);
    expect(presetRes.body.board.enableAnimations).toBe(false);

    // Now update labelDisplay only and ensure enableAnimations remains false
    const update = { board: { labelDisplay: "chips" as const } };
    const res = await request(server)
      .put(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send(update)
      .expect(200);

    expect(res.body.board.labelDisplay).toBe("chips");
    expect(res.body.board.enableAnimations).toBe(false);
  });

  it("GET /users/preferences (me) reflects computed labelDisplay", async () => {
    const res = await request(server)
      .get(`/api/v1/users/preferences`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.board.labelDisplay).toMatch(/^(chips|blocks|hover)$/);
  });

  it("registers userB and tests authZ on updating userA prefs", async () => {
    const u = unique();
    const reg = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `userB+${u}@example.com`,
        username: `userB_${u}`,
        password: "Password1!",
        firstName: "Test",
        lastName: "UserB",
      })
      .expect(201);
    userB = reg.body.user;
    tokenB = reg.body.token;

    await request(server)
      .put(`/api/v1/users/${userA.id}/ui-preferences`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ board: { labelDisplay: "blocks" } })
      .expect(403);
  });
});
