import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import * as cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { validationConfig } from "../src/config/security.config";
import { join, resolve } from "path";
import * as fs from "fs";

// Helpers
const unique = () => Date.now() + "-" + Math.floor(Math.random() * 1e6);
const csrfToken = "csrf-test-token";

describe("User Profile E2E", () => {
  let app: INestApplication;
  let server: any;

  let user1: any;
  let token1: string;
  let user2: any;
  let token2: string;

  const pngPath = resolve(__dirname, "../../Test assets/png.png");
  const pdfPath = resolve(__dirname, "../../Test assets/dummy.pdf");

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

    // Sanity check test assets exist
    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.existsSync(pdfPath)).toBe(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers user1 and returns token", async () => {
    const u = unique();
    const res = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `user1+${u}@example.com`,
        username: `user1_${u}`,
        password: "Password1!",
        firstName: "Test",
        lastName: "User1",
      })
      .expect(201);

    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("token");
    user1 = res.body.user;
    token1 = res.body.token;
    expect(user1).toHaveProperty("id");
  });

  it("registers user2 and returns token", async () => {
    const u = unique();
    const res = await request(server)
      .post("/api/v1/auth/register")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({
        email: `user2+${u}@example.com`,
        username: `user2_${u}`,
        password: "Password1!",
        firstName: "Test",
        lastName: "User2",
      })
      .expect(201);

    user2 = res.body.user;
    token2 = res.body.token;
    expect(user2).toHaveProperty("id");
  });

  it("fetches default notification preferences for user1", async () => {
    const res = await request(server)
      .get(`/api/v1/users/${user1.id}/notifications`)
      .set("Authorization", `Bearer ${token1}`)
      .expect(200);

    expect(res.body).toMatchObject({
      emailNotifications: expect.any(Boolean),
      boardInvites: expect.any(Boolean),
      taskAssignments: expect.any(Boolean),
      taskDeadlines: expect.any(Boolean),
      comments: expect.any(Boolean),
      weeklyReport: expect.any(Boolean),
    });
  });

  it("updates notification preferences for user1", async () => {
    const update = { emailNotifications: false, weeklyReport: true };
    const res = await request(server)
      .put(`/api/v1/users/${user1.id}/notifications`)
      .set("Authorization", `Bearer ${token1}`)
      .send(update)
      .expect(200);

    expect(res.body.emailNotifications).toBe(false);
    expect(res.body.weeklyReport).toBe(true);
  });

  it("updates profile for user1 via PUT /users/:id", async () => {
    const u = unique();
    const payload = {
      firstName: "UpdatedFirst",
      lastName: "UpdatedLast",
      email: `user1.updated+${u}@example.com`,
      username: `user1_updated_${u}`,
    };
    const res = await request(server)
      .put(`/api/v1/users/${user1.id}`)
      .set("Authorization", `Bearer ${token1}`)
      .send(payload)
      .expect(200);

    expect(res.body).toMatchObject({
      id: user1.id,
      firstName: "UpdatedFirst",
      lastName: "UpdatedLast",
      email: payload.email,
      username: payload.username,
    });

    // Update local state
    user1 = res.body;
  });

  it("rejects invalid update payload for user1", async () => {
    await request(server)
      .put(`/api/v1/users/${user1.id}`)
      .set("Authorization", `Bearer ${token1}`)
      .send({ email: "not-an-email", password: "123" })
      .expect(400);
  });

  it("enforces authZ: user2 cannot update user1 profile", async () => {
    await request(server)
      .put(`/api/v1/users/${user1.id}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ firstName: "Hacker" })
      .expect(403);
  });

  it("enforces authZ: user2 cannot view or update user1 notifications", async () => {
    await request(server)
      .get(`/api/v1/users/${user1.id}/notifications`)
      .set("Authorization", `Bearer ${token2}`)
      .expect(403);

    await request(server)
      .put(`/api/v1/users/${user1.id}/notifications`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ emailNotifications: true })
      .expect(403);
  });

  it("changes password for user1 and logs in with new password", async () => {
    await request(server)
      .post("/api/v1/users/change-password")
      .set("Authorization", `Bearer ${token1}`)
      .send({ currentPassword: "Password1!", newPassword: "NewPassword1!" })
      .expect(201);

    // Login with new password
    const res = await request(server)
      .post("/api/v1/auth/login")
      .set("x-csrf-token", csrfToken)
      .set("Cookie", [`csrf-token=${csrfToken}`])
      .send({ email: user1.email, password: "NewPassword1!" })
      .expect(201);

    expect(res.body).toHaveProperty("token");
    token1 = res.body.token;
  });

  it("uploads a valid avatar image for user1", async () => {
    const res = await request(server)
      .post(`/api/v1/users/${user1.id}/avatar`)
      .set("Authorization", `Bearer ${token1}`)
      .attach("file", pngPath)
      .expect(201);

    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("avatar");
    expect(res.body.user.avatar).toMatch(/^\/uploads\//);

    // Verify file exists on disk
    const filename = res.body.user.avatar.split("/").pop();
    const exists = fs.existsSync(join(process.cwd(), "uploads", filename));
    expect(exists).toBe(true);
  });

  it("rejects non-image avatar upload", async () => {
    await request(server)
      .post(`/api/v1/users/${user1.id}/avatar`)
      .set("Authorization", `Bearer ${token1}`)
      .attach("file", pdfPath)
      .expect(400);
  });

  it("enforces delete: user2 cannot delete user1", async () => {
    await request(server)
      .delete(`/api/v1/users/${user1.id}`)
      .set("Authorization", `Bearer ${token2}`)
      .expect(403);
  });
});
