<div align="center">

# smartflow-tutor-api-worker
**Cloudflare Worker — static content API for SmartFlow Tutor**

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-All_Rights_Reserved-red?style=for-the-badge)]()

</div>

---

## Overview

This Cloudflare Worker serves static learning content (pseudocode, explanations, exam questions) for the [SmartFlow](https://barakzai.cloud) tutor feature. It exposes a versioned REST API that the frontend uses to load algorithm training data — available in German and Persian.

It also proxies YouTube search results via the Innertube API for in-app video recommendations.

**Live app:** https://barakzai.cloud · **Main repo:** [aryanbarak/smartflow](https://github.com/aryanbarak/smartflow)

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/health` | Public | Health check |
| `GET` | `/v1/topics` | Token + Origin | List available topics |
| `POST` | `/v1/run` | Token + Origin | Return content JSON for a topic/language/mode |
| `GET` | `/search?q=` | Origin only | YouTube search proxy |

---

## Content Structure
