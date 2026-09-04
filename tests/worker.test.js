import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { handleRequest } from "../src/index.js";

const repoRoot = resolve(process.cwd());

function createEnv() {
  return {
    ADAPTER_TOKEN: "dev-secret",
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        const localPath = resolve(repoRoot, "assets", `.${url.pathname}`);
        try {
          const content = await readFile(localPath, "utf8");
          return new Response(content, {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        } catch {
          return new Response(JSON.stringify({ detail: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
      },
    },
  };
}

async function readJson(res) {
  return JSON.parse(await res.text());
}

async function run() {
  const env = createEnv();

  {
    const req = new Request("https://api.barakzai.cloud/v1/health");
    const res = await handleRequest(req, env);
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.deepEqual(body, { ok: true, service: "smartflow-tutor-api" });
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/topics", {
      headers: { "X-Adapter-Token": "dev-secret", Origin: "https://evil.example" },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 403);
    const body = await readJson(res);
    assert.equal(body.detail, "Forbidden origin");
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/topics", {
      headers: { Origin: "https://barakzai.cloud" },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 401);
    const body = await readJson(res);
    assert.equal(body.detail, "Unauthorized");
  }

  // ORIGIN-01: the new SmartFlow origins and local dev pass the origin gate
  // (401 = origin accepted, token still enforced); https-localhost stays out.
  for (const origin of [
    "https://smartaryan.com",
    "https://www.smartaryan.com",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://192.168.178.42:8080",
    "http://10.0.0.7:8080",
    "http://172.16.5.9:8080",
  ]) {
    const req = new Request("https://api.barakzai.cloud/v1/topics", {
      headers: { Origin: origin },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 401, `origin gate should accept ${origin}`);
    assert.equal(res.headers.get("access-control-allow-origin"), origin);
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/topics", {
      headers: { Origin: "https://localhost:8080", "X-Adapter-Token": "dev-secret" },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 403);
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/topics", {
      headers: {
        Origin: "https://barakzai.cloud",
        "X-Adapter-Token": "dev-secret",
      },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.ok(Array.isArray(body.topics));
    assert.ok(body.topics.length >= 5);
    assert.ok(body.topics.includes("binarysearch"));
    assert.equal(body.source, "generated-from-assets");
    assert.ok(body.availability && typeof body.availability === "object");
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/topics?mode=pseudocode&lang=de", {
      headers: {
        Origin: "https://barakzai.cloud",
        "X-Adapter-Token": "dev-secret",
      },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.ok(Array.isArray(body.topics));
    assert.ok(body.topics.includes("bubblesort"));
    assert.ok(!body.topics.includes("exam_bank_ap2"));
  }

  {
    const expectedRaw = await readFile(
      resolve(repoRoot, "assets", "tutor-data", "run", "bubblesort.de.pseudocode.json"),
      "utf8",
    );
    const expected = JSON.parse(expectedRaw);

    const req = new Request("https://api.barakzai.cloud/v1/run", {
      method: "POST",
      headers: {
        Origin: "https://barakzai.cloud",
        "Content-Type": "application/json",
        "X-Adapter-Token": "dev-secret",
      },
      body: JSON.stringify({
        api_version: "v1",
        request_id: "11111111-1111-1111-1111-111111111111",
        topic: "bubblesort",
        lang: "de",
        mode: "pseudocode",
      }),
    });

    const res = await handleRequest(req, env);
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.deepEqual(body, expected);
    assert.equal(body.schema_name, "tutor_asset.pseudocode.v1");
    assert.equal(body.topic, "bubblesort");
    assert.equal(body.lang, "de");
    assert.equal(body.mode, "pseudocode");
    assert.equal(typeof body.pseudocode, "string");
    assert.ok(body.pseudocode.length > 0);
  }

  {
    const expectedRaw = await readFile(
      resolve(repoRoot, "assets", "tutor-data", "run", "linearsearch.fa.pseudocode.json"),
      "utf8",
    );
    const expected = JSON.parse(expectedRaw);

    const req = new Request("https://api.barakzai.cloud/v1/run", {
      method: "POST",
      headers: {
        Origin: "https://barakzai.cloud",
        "Content-Type": "application/json",
        "X-Adapter-Token": "dev-secret",
      },
      body: JSON.stringify({
        api_version: "v1",
        request_id: "11111111-1111-1111-1111-111111111111",
        topic: "linearsearch",
        lang: "fa",
        mode: "pseudocode",
      }),
    });

    const res = await handleRequest(req, env);
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.deepEqual(body, expected);
    assert.equal(body.lang, "fa");
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/run", {
      method: "POST",
      headers: {
        Origin: "https://barakzai.cloud",
        "Content-Type": "application/json",
        "X-Adapter-Token": "dev-secret",
      },
      body: JSON.stringify({
        api_version: "v1",
        request_id: "11111111-1111-1111-1111-111111111111",
        topic: "mergesort",
        lang: "de",
        mode: "pseudocode",
      }),
    });

    const res = await handleRequest(req, env);
    assert.equal(res.status, 404);
    const body = await readJson(res);
    assert.equal(body.detail, "Not found");
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/run", {
      method: "POST",
      headers: {
        Origin: "https://barakzai.cloud",
        "Content-Type": "application/json",
        "X-Adapter-Token": "dev-secret",
      },
      body: JSON.stringify({ topic: "bubblesort", lang: "de", mode: "pseudocode" }),
    });

    const res = await handleRequest(req, env);
    assert.equal(res.status, 400);
    const body = await readJson(res);
    assert.match(body.detail, /Missing required fields:/);
  }

  {
    const req = new Request("https://api.barakzai.cloud/v1/run", {
      method: "OPTIONS",
      headers: {
        Origin: "https://barakzai.cloud",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "X-Adapter-Token, Content-Type",
      },
    });
    const res = await handleRequest(req, env);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://barakzai.cloud");
    assert.equal(res.headers.get("vary"), "Origin");
    assert.equal(res.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
    assert.match(res.headers.get("access-control-allow-headers") || "", /X-Adapter-Token/i);
    assert.equal(res.headers.get("access-control-max-age"), "86400");
  }

  console.log("All tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
