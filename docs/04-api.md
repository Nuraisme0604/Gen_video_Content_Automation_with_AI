# 04 — API Reference

> **Base URL** local dev: `http://localhost:3001/api/v1` · Swagger UI auto-generated tại `http://localhost:3001/api/docs`

## Tổng quan modules

11 controllers. Source: `backend/src/modules/*/`.

| Module | Prefix | File |
|---|---|---|
| Project | `/projects` | [project.controller.ts](../backend/src/modules/project/project.controller.ts) |
| Video | `/videos` | [video.controller.ts](../backend/src/modules/video/video.controller.ts) |
| Scene | (multiple) | [scene.controller.ts](../backend/src/modules/scene/scene.controller.ts) |
| Source | `/sources` | [source.controller.ts](../backend/src/modules/source/source.controller.ts) |
| Job | `/jobs` | [job.controller.ts](../backend/src/modules/job/job.controller.ts) |
| API Key | `/api-keys` | [api-key.controller.ts](../backend/src/modules/api-key/api-key.controller.ts) |
| Character | `/characters` | [character.controller.ts](../backend/src/modules/character/character.controller.ts) |
| Frame | `/frames` | [frame.controller.ts](../backend/src/modules/frame/frame.controller.ts) |
| Notification | `/notifications` | [notification.controller.ts](../backend/src/modules/notification/notification.controller.ts) |
| n8n webhooks | `/webhooks/n8n` | [n8n.controller.ts](../backend/src/webhooks/n8n.controller.ts) |
| Worker webhooks | `/webhooks/worker` | [worker.controller.ts](../backend/src/webhooks/worker.controller.ts) |

## Routes (chính)

### Projects
| Method | Path | Mô tả |
|---|---|---|
| GET    | `/projects`        | List tất cả projects |
| GET    | `/projects/:id`    | Detail 1 project |
| POST   | `/projects`        | Tạo project (DTO `CreateProjectDto`) |
| PATCH  | `/projects/:id`    | Update partial (vd: `scriptBasePrompt`, model config) |
| DELETE | `/projects/:id`    | Xoá (cascade scenes/videos/...) |

### Videos
| Method | Path | Mô tả |
|---|---|---|
| GET    | `/videos`                    | List `?projectId=X` |
| GET    | `/videos/:id`                | Detail |
| GET    | `/videos/:id/clips`          | List per-scene clips (cho download riêng) |
| GET    | `/videos/:id/preview-url`    | Presigned MinIO URL (TTL 1h) |
| PATCH  | `/videos/:id`                | Update title / status |
| DELETE | `/videos/:id`                | Xoá (cascade scenes) |

### Scenes
| Method | Path | Mô tả |
|---|---|---|
| GET    | `/videos/:videoId/scenes` | List scenes của 1 video |
| GET    | `/scenes/:id`             | Detail scene |
| PATCH  | `/scenes/:id`             | Update voiceover, prompt... |
| POST   | `/scenes/:id/regenerate`  | Re-render scene |

### Sources (input cho pipeline tạo video)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/sources/youtube`          | Tạo source từ URL YouTube (DTO có `sceneCount`, `targetDurationSec`, `aspectRatio`) |
| POST | `/sources/manual`           | Tạo source từ script tự nhập (cùng DTO config) |
| GET  | `/sources/project/:id`      | List sources của project (auto-mark stale > 15min) |

### Jobs
| Method | Path | Mô tả |
|---|---|---|
| GET | `/jobs` | List `?projectId=X&queue=X&status=X&videoId=X` (lookup video.projectId để filter) |
| GET | `/jobs/:id` | Detail job |

### API Keys
| Method | Path | Mô tả |
|---|---|---|
| GET   | `/api-keys`                            | List `?projectId=X` (không trả `keyEncrypted`) |
| POST  | `/api-keys`                            | Thêm key (encrypt AES-256-GCM trước khi lưu) |
| POST  | `/api-keys/test`                       | Test 1 key chưa lưu `{key, provider}` |
| POST  | `/api-keys/:id/test`                   | Test key đã lưu (decrypt → call provider → persist `lastTestStatus`) |
| PATCH | `/api-keys/:id/toggle`                 | Bật/tắt `isActive` |
| PATCH | `/api-keys/:id/reset-quota`            | Reset `quotaUsed = 0` |
| DELETE| `/api-keys/:id`                        | Xoá |
| GET   | `/api-keys/internal/active`            | **Internal** — lấy decrypted key theo `capability` (header `X-Internal-Secret`), dùng bởi n8n + worker |

### Characters
| Method | Path | Mô tả |
|---|---|---|
| GET    | `/characters`     | List `?projectId=X` |
| POST   | `/characters`     | Tạo |
| PATCH  | `/characters/:id` | Update |
| DELETE | `/characters/:id` | Xoá |

### Frames
| Method | Path | Mô tả |
|---|---|---|
| GET    | `/frames`                       | List `?projectId=X` |
| GET    | `/frames/:id`                   | Detail frame + images |
| POST   | `/frames`                       | Tạo |
| PATCH  | `/frames/:id`                   | Update |
| DELETE | `/frames/:id`                   | Xoá |
| POST   | `/frames/:id/images`            | Upload ảnh vào frame |
| DELETE | `/frames/images/:imageId`       | Xoá ảnh |
| POST   | `/frames/:id/reorder`           | Reorder ảnh |

### Notifications
| Method | Path | Mô tả |
|---|---|---|
| GET  | `/notifications`              | List |
| POST | `/notifications/test-telegram`| Gửi test message qua bot |
| (...settings endpoints)        | | Config Telegram token/chatId |

### Webhooks (internal — không public)

**n8n → BE**:
| Method | Path | Caller |
|---|---|---|
| POST | `/webhooks/n8n/render-request`   | n8n cuối workflow 02 |
| POST | `/webhooks/n8n/script-complete`  | n8n workflow 01 |
| POST | `/webhooks/n8n/pipeline-error`   | n8n trên error branch |

**Python worker → BE**:
| Method | Path | Caller |
|---|---|---|
| POST | `/webhooks/worker/scene-progress`  | Worker (mỗi scene render xong) |
| POST | `/webhooks/worker/render-complete` | Worker (toàn video xong) |
| POST | `/webhooks/worker/notify`          | Worker (gửi Telegram) |

## Realtime (Socket.IO)

Namespace `/jobs`. Room key: `video:${videoId}`.

| Event | Payload | Khi nào emit |
|---|---|---|
| `job:queued`     | `{ jobId, queue, videoId }`                          | BullMQ added |
| `job:progress`   | `{ jobId, videoId, progress, stage }`                | BullMQ progress event hoặc worker webhook |
| `scene:rendered` | `{ videoId, sceneIndex, previewUrl }`                | Worker `/scene-progress` |
| `job:complete`   | `{ masterVideoKey }`                                 | Worker `/render-complete` success |
| `job:failed`     | `{ error }`                                          | Worker `/render-complete` failure |

## Auth

V1 không có auth (single-user dev). Plan v2: NextAuth + JWT — xem [08-roadmap.md](08-roadmap.md).

Internal endpoints (`/api-keys/internal/*`) bảo vệ bằng `X-Internal-Secret` header so với env `INTERNAL_API_SECRET`.

## Liên quan

- [02-architecture.md](02-architecture.md) — webhook contracts
- [05-pipeline.md](05-pipeline.md) — luồng gọi các endpoint
