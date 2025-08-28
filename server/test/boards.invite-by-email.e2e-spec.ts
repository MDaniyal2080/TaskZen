import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { validationConfig } from "../src/config/security.config";
import { PrismaService } from "../src/database/prisma.service";

// Helpers
const unique = () =>
  Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 6);
const csrfToken = "csrf-test-token";

describe("Boards: invite by email E2E", () => {
  let app: INestApplication;
  let server: any;
  let prisma: PrismaService;

  let owner: any;
  let ownerToken: string;
  let invitee: any;
  let outsider: any;
  let outsiderToken: string;
  let extraUser: any;
  let boardId: string;

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

  it("registers owner and invitee users", async () => {
    const u1 = unique();
    const res1 = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `owner+${u1}@example.com`,
        username: `owner_${u1}`,
        password: "Password1!",
        firstName: "Board",
        lastName: "Owner",
      })
      .expect(201);
    owner = res1.body.user;
    ownerToken = res1.body.token;

    const u2 = unique();
    const res2 = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `invitee+${u2}@example.com`,
        username: `invitee_${u2}`,
        password: "Password1!",
        firstName: "Invited",
        lastName: "User",
      })
      .expect(201);
    invitee = res2.body.user;
  });

  it("owner creates a board", async () => {
    const res = await request(server)
      .post("/api/v1/boards")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ title: `Test Board ${unique()}` })
      .expect(201);
    expect(res.body).toHaveProperty("id");
    boardId = res.body.id;
  });

  it("owner invites a member by email successfully", async () => {
    const res = await request(server)
      .post(`/api/v1/boards/${boardId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: invitee.email, role: "MEMBER" })
      .expect(201);

    expect(res.body).toHaveProperty("userId", invitee.id);
    expect(res.body).toHaveProperty("boardId", boardId);
    expect(res.body).toHaveProperty("role", "MEMBER");
  });

  it("rejects adding the same user again (already a member)", async () => {
    const res = await request(server)
      .post(`/api/v1/boards/${boardId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: invitee.email, role: "MEMBER" })
      .expect(403);
    expect(res.body?.message || res.text).toMatch(/already a member/i);
  });

  it("outsider cannot invite members (403)", async () => {
    // Create an outsider and another user to try to invite
    const u3 = unique();
    const outsiderReg = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `outsider+${u3}@example.com`,
        username: `outsider_${u3}`,
        password: "Password1!",
        firstName: "Out",
        lastName: "Sider",
      })
      .expect(201);
    outsider = outsiderReg.body.user;
    outsiderToken = outsiderReg.body.token;

    const u4 = unique();
    const thirdReg = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `third+${u4}@example.com`,
        username: `third_${u4}`,
        password: "Password1!",
        firstName: "Third",
        lastName: "User",
      })
      .expect(201);
    extraUser = thirdReg.body.user;

    const res = await request(server)
      .post(`/api/v1/boards/${boardId}/members`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ email: extraUser.email, role: "MEMBER" })
      .expect(403);
    expect(res.body?.message || res.text).toMatch(/insufficient permissions|access denied/i);
  });

  it("owner invites with non-existent email -> 404", async () => {
    await request(server)
      .post(`/api/v1/boards/${boardId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: `missing+${unique()}@example.com`, role: "MEMBER" })
      .expect(404);
  });
});
