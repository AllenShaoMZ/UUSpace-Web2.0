import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../server/index.mjs";

describe("POST /api/command/send", () => {
  it("rejects missing target, port, or data", async () => {
    const res = await request(app).post("/api/command/send").send({ target: "", port: 0, data: "" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/必填/);
  });

  it("rejects invalid HEX", async () => {
    const res = await request(app)
      .post("/api/command/send")
      .send({ target: "127.0.0.1", port: 9, data: "ZZ" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/HEX/);
  });

  it("sends valid HEX to loopback", async () => {
    const res = await request(app)
      .post("/api/command/send")
      .send({ target: "127.0.0.1", port: 9, data: "AABB01" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sentTo).toBe("127.0.0.1:9");
    expect(res.body.bytes).toBe(3);
  });
});
