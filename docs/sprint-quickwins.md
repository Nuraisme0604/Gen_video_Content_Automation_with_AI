# Sprint — Quick Wins (kế hoạch chi tiết)

> **Mục tiêu:** clear 5 items effort `S` từ [11-feature-checklists.md § Quick wins](11-feature-checklists.md#-quick-wins--pick-từ-đây-nếu-chưa-biết-làm-gì) trong **1 work day** (~4-5 giờ thuần code).
>
> **Time-boxed:** xong sprint này → archive file. Đây không phải tài liệu thiết kế lâu dài.

---

## ⚠️ Cập nhật trước khi bắt đầu

Khi rà code lại, **bulk-upload ảnh frame đã hoàn thành rồi** ([frames/page.tsx:58 `handleFiles`](../frontend/src/app/projects/[id]/frames/page.tsx) loop `Array.from(files)`, `<input multiple>` ở line 156, 234). → đổi sang quickwin thay thế: **Telegram alert khi API key fail**.

## Danh sách 5 quickwins (thứ tự thực hiện)

| # | Task | File chính | Effort | Risk |
|---|---|---|---|---|
| 1 | Auto-test API key sau khi add | `api-key.service.ts` | 30min | thấp |
| 2 | Telegram alert khi key fail | `api-key.service.ts` + `notification.service.ts` | 30min | thấp |
| 3 | Cancel job button | `job.controller.ts` + `jobs/page.tsx` | 45min | trung |
| 4 | Pagination jobs | `job.controller.ts` + `service.ts` + `jobs/page.tsx` | 45min | thấp |
| 5 | Drag-drop reorder ảnh frame | `frames/page.tsx` + install `@dnd-kit/core` | 90min | trung |

**Tổng: ~4 giờ** (cộng buffer build/restart ~30min).

## Pre-flight checklist

Trước khi gõ phím:

- [ ] Tạo branch riêng: `git checkout -b sprint/quickwins-may-2026`
- [ ] Đảm bảo `docker compose ps` tất cả services healthy
- [ ] Có ít nhất 1 API key trong DB (để test #1, #2): `curl /api/v1/api-keys | jq length`
- [ ] Có ít nhất 1 project + 1 video render xong (để test #3, #4): vào `/projects` xem
- [ ] Có 1 project + 1 frame có 3+ ảnh (để test #5)

---

## 1. Auto-test API key sau khi add (30min)

### Context
[api-key.service.ts](../backend/src/modules/api-key/api-key.service.ts) `create()` (line ~67) hiện chỉ insert + return. User thêm key xong phải tự bấm "Test" → khó UX.

### Acceptance criteria
Sau khi POST `/api-keys` thành công, key trả về có `lastTestStatus = 'ok'` hoặc `'error'` (không null) trong vòng < 5s.

### Steps
1. Mở [backend/src/modules/api-key/api-key.service.ts](../backend/src/modules/api-key/api-key.service.ts)
2. Sửa `create()`:
   ```ts
   async create(dto: CreateApiKeyDto) {
     const keyHash = createHash('sha256').update(dto.key).digest('hex');
     const keyMasked = dto.key.length > 4 ? `...${dto.key.slice(-4)}` : '****';
     const created = await this.prisma.apiKey.create({
       data: { /* ... unchanged ... */ },
       select: { /* ... unchanged ... */ },
     });
     // Fire-and-forget test ngay sau insert — không await để response không bị block
     this.testStoredKey(created.id).catch(() => {});
     return created;
   }
   ```
3. Frontend không cần đổi — `list()` đã trả `lastTestStatus`, sau khi user thêm key thì TanStack Query auto refetch hiện badge.

### Verify
```bash
# Add 1 key dummy (sẽ fail test, OK — chỉ xem field có set không)
curl -X POST http://localhost:3001/api/v1/api-keys \
  -H 'Content-Type: application/json' \
  -d '{"provider":"google","type":"SCRIPT","key":"AIza-fake-key-for-testing"}'

# Chờ 5s rồi list ra
sleep 5
curl -s http://localhost:3001/api/v1/api-keys | jq '.[] | select(.keyMasked | endswith("ting")) | {id, lastTestStatus, lastTestError}'
# Expected: lastTestStatus = "error", lastTestError = "Key không hợp lệ..." (không phải null)
```

### Gotcha
- `testStoredKey` decrypt nên cần `ENCRYPTION_SECRET` env phải có
- Fire-and-forget: nếu test fail cũng không throw — đảm bảo `.catch(() => {})` ở cuối

---

## 2. Telegram alert khi API key fail (30min) — thay cho bulk-upload

### Context
Hiện key chết âm thầm, user chỉ biết khi pipeline lỗi. Mỗi lần `testStoredKey` cho ra `invalid` hoặc `error` → push Telegram message để user biết ngay.

### Acceptance criteria
Khi gọi `POST /api-keys/:id/test` cho 1 key đã chết → có 1 message Telegram dạng `❌ API key {provider} (...{masked}) đã ngừng hoạt động: {error}`.

### Steps
1. Mở [api-key.service.ts](../backend/src/modules/api-key/api-key.service.ts) — đảm bảo có inject `NotificationService` trong constructor (kiểm tra `api-key.module.ts` — chưa có thì add imports `NotificationModule`)
2. Trong `testStoredKey()`, sau khi update DB:
   ```ts
   if (status !== 'ok' && key.isActive) {
     this.notification.enqueue({
       event: 'api_key_dead',
       projectId: key.projectId ?? undefined,
       message: `❌ <b>API key ${key.provider}</b> (${key.keyMasked}) ngừng hoạt động\n<code>${result.error}</code>`,
     }).catch(() => {});
   }
   ```
3. Verify Telegram bot token có sẵn ở DB hoặc env (vào `/notifications/settings` xem)

### Verify
```bash
# 1. Pick key đã chết (test trước, status=error)
KEY_ID=$(curl -s http://localhost:3001/api/v1/api-keys | jq -r '.[] | select(.lastTestStatus == "error") | .id' | head -1)

# 2. Re-test
curl -X POST http://localhost:3001/api/v1/api-keys/$KEY_ID/test

# 3. Kiểm tra notification log
curl -s http://localhost:3001/api/v1/notifications | jq '.[] | select(.message | contains("ngừng hoạt động"))' | head -5
# Expected: có entry mới với event=api_key_dead

# 4. Kiểm tra Telegram (manual) — mở app Telegram, có message mới chưa?
```

### Gotcha
- Module dependency: cần `NotificationModule` được export và import vào `ApiKeyModule`
- Nếu Telegram chưa cấu hình → `notification.enqueue` không throw, chỉ log warning → OK
- Tránh spam: cron auto-test sau này phải có dedup (rule: chỉ alert nếu trạng thái CHUYỂN từ `ok` → `error`, không alert nếu vẫn đang `error`). V1 quickwin chưa cần dedup.

---

## 3. Cancel job button (45min)

### Context
Job đang `active` hoặc `queued` không có cách dừng từ UI. Khi user submit nhầm hoặc Veo3 treo, phải vào CLI `bull-board` hoặc đợi timeout.

### Acceptance criteria
- Backend: `DELETE /api/v1/jobs/:id` → BullMQ `job.remove()` → DB row update `status=failed`, `error="cancelled by user"`
- Frontend: row job `active`/`queued` có button ✕ → confirm → call DELETE → row update status

### Steps

**Backend:**
1. Mở [backend/src/modules/job/job.service.ts](../backend/src/modules/job/job.service.ts) thêm method:
   ```ts
   async cancel(id: string) {
     const row = await this.prisma.job.findUnique({ where: { id } });
     if (!row) throw new NotFoundException('Job not found');
     if (row.status === 'completed' || row.status === 'failed') {
       throw new BadRequestException('Job đã kết thúc, không thể cancel');
     }
     // Remove từ BullMQ
     if (row.bullJobId && row.queue) {
       const queue = this.queues[row.queue]; // need inject queues
       if (queue) {
         const bullJob = await queue.getJob(row.bullJobId);
         await bullJob?.remove();
       }
     }
     return this.prisma.job.update({
       where: { id },
       data: { status: 'failed', error: 'cancelled by user', finishedAt: new Date() },
     });
   }
   ```
2. Inject queues vào constructor (xem pattern trong [source.service.ts](../backend/src/modules/source/source.service.ts)):
   ```ts
   constructor(
     private prisma: PrismaService,
     @InjectQueue('render') private renderQueue: Queue,
     @InjectQueue('transcript-fetch') private transcriptQueue: Queue,
     @InjectQueue('notify') private notifyQueue: Queue,
   ) {}
   private get queues(): Record<string, Queue> {
     return { render: this.renderQueue, 'transcript-fetch': this.transcriptQueue, notify: this.notifyQueue };
   }
   ```
3. Mở [backend/src/modules/job/job.controller.ts](../backend/src/modules/job/job.controller.ts) thêm:
   ```ts
   @Delete(':id')
   cancel(@Param('id') id: string) { return this.svc.cancel(id); }
   ```
   (import `Delete` từ `@nestjs/common`)

**Frontend:**
1. Mở [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) thêm:
   ```ts
   export const cancelJob = (id: string) => api.delete(`/jobs/${id}`).then(r => r.data);
   ```
2. Mở [frontend/src/app/jobs/page.tsx](../frontend/src/app/jobs/page.tsx):
   - Import `cancelJob`, `useMutation`, `useQueryClient`, icon `X`
   - Thêm mutation + button trong row (cả desktop table và mobile card):
   ```tsx
   const qc = useQueryClient();
   const cancel = useMutation({
     mutationFn: cancelJob,
     onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Đã huỷ job'); },
     onError: (e: any) => toast.error('Huỷ thất bại', { description: e?.response?.data?.message }),
   });
   // ...
   {(j.status === 'active' || j.status === 'queued') && (
     <button onClick={() => { if (confirm('Huỷ job này?')) cancel.mutate(j.id); }}
       className="p-1.5 text-rose-300 hover:text-rose-200 hover:bg-rose-500/15 rounded">
       <X size={14} />
     </button>
   )}
   ```

### Verify
```bash
# 1. Tạo 1 job mới (submit 1 video)
# 2. Lấy job id
JOB_ID=$(curl -s "http://localhost:3001/api/v1/jobs?status=active" | jq -r '.[0].id')

# 3. Cancel
curl -X DELETE http://localhost:3001/api/v1/jobs/$JOB_ID

# 4. Verify status
curl -s http://localhost:3001/api/v1/jobs/$JOB_ID | jq '{status, error}'
# Expected: status="failed", error="cancelled by user"

# 5. FE: vào /jobs, bấm X trên 1 active job → confirm → row biến mất khỏi list active
```

### Gotcha
- BullMQ `job.remove()` trên job đang RUN (status `active`) chỉ remove khỏi queue, không kill process. Worker vẫn finish task đang chạy. Để thực sự kill cần signal sang Python worker — quá scope quickwin.
- `queues[row.queue]` có thể null nếu queue name không match (vd có queue cũ chưa cleanup) — coverage bằng `?.remove()`.
- `BadRequestException` import từ `@nestjs/common`.

---

## 4. Pagination jobs (45min)

### Context
[job.service.ts](../backend/src/modules/job/job.service.ts) hard-code `take: 100`. User có 500 job sẽ chỉ thấy 100, không scroll xa hơn. UX hiện không có nút "Load more" hoặc "Next page".

### Acceptance criteria
- Backend: `GET /jobs?limit=20&offset=40` trả 20 items skip 40 đầu
- Frontend: footer hiện "Trang X / Y" + 2 button "« Trước" "Sau »"

### Steps

**Backend:**
1. Mở [job.service.ts](../backend/src/modules/job/job.service.ts), thêm params:
   ```ts
   async list(filter: { ..., limit?: number; offset?: number }) {
     const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);
     const skip = Math.max(filter.offset ?? 0, 0);
     // ... existing logic ...
     const [items, total] = await Promise.all([
       this.prisma.job.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
       this.prisma.job.count({ where }),
     ]);
     return { items, total, limit: take, offset: skip };
   }
   ```
2. Sửa [job.controller.ts](../backend/src/modules/job/job.controller.ts):
   ```ts
   @ApiQuery({ name: 'limit',  required: false })
   @ApiQuery({ name: 'offset', required: false })
   list(
     // ... existing params ...
     @Query('limit')  limit?:  string,
     @Query('offset') offset?: string,
   ) {
     return this.svc.list({
       /* ... */
       limit:  limit  ? parseInt(limit)  : undefined,
       offset: offset ? parseInt(offset) : undefined,
     });
   }
   ```

**Frontend:**
1. Mở [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) update signature:
   ```ts
   export const getJobs = (params?: { /* ... */ limit?: number; offset?: number }) =>
     api.get('/jobs', { params }).then(r => r.data); // returns {items, total, limit, offset}
   ```
2. Sửa [frontend/src/app/jobs/page.tsx](../frontend/src/app/jobs/page.tsx):
   - State `const [page, setPage] = useState(0);` + `const limit = 20;`
   - Query: `getJobs({ ..., limit, offset: page * limit })` — receives `{ items, total, ... }`, đổi mọi `jobs` thành `items`
   - Footer:
   ```tsx
   <div className="flex items-center justify-between px-4 py-3 border-t border-[--border] text-xs text-zinc-400">
     <span>Trang {page + 1} / {Math.max(1, Math.ceil(total / limit))} · Tổng {total}</span>
     <div className="flex gap-1">
       <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
         className="px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40">« Trước</button>
       <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total}
         className="px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40">Sau »</button>
     </div>
   </div>
   ```

### Verify
```bash
# Backend
curl -s "http://localhost:3001/api/v1/jobs?limit=5&offset=0" | jq '{count: (.items|length), total, limit, offset}'
# Expected: count=5, total=N (số job thực tế), limit=5, offset=0

curl -s "http://localhost:3001/api/v1/jobs?limit=5&offset=5" | jq '{count: (.items|length), offset}'
# Expected: count=5, offset=5 (5 items khác)

# FE: vào /jobs, footer hiện "Trang 1 / X", bấm "Sau »" → page 2 hiện items khác
```

### Gotcha
- **Breaking change response shape**: từ `[Job]` → `{items, total, ...}`. Bất kỳ caller cũ nào của `getJobs` đều phải sửa. Hiện chỉ `jobs/page.tsx` dùng — search nhanh `grep -rn "getJobs" frontend/src` để confirm.
- `total` count chạy `WHERE` clause y hệt → có thể chậm với DB lớn. Hiện < 1000 row, OK.

---

## 5. Drag-drop reorder ảnh frame (90min)

### Context
[frames/page.tsx:126](../frontend/src/app/projects/[id]/frames/page.tsx) render `frame.images.map(...)` theo `sortOrder` BE trả. Backend đã có `POST /frames/:id/reorder { newOrder: [imageId,...] }` — chỉ thiếu drag-drop UI.

### Acceptance criteria
- User vào frame có ≥ 3 ảnh → drag 1 ảnh sang vị trí khác → thả → thứ tự đổi ngay (optimistic) → reload page → thứ tự giữ nguyên (đã persist BE)

### Steps

**Install lib:**
```bash
docker exec gen_video_content_automation_with_ai-frontend-1 npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
# Hoặc local: cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Frontend:**
1. Mở [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) — verify đã có `reorderFrameImages(id, body)`; nếu không, thêm:
   ```ts
   export const reorderFrameImages = (id: string, data: { newOrder: string[] }) =>
     api.post(`/frames/${id}/reorder`, data).then(r => r.data);
   ```
2. Mở [frames/page.tsx](../frontend/src/app/projects/[id]/frames/page.tsx):
   - Wrap ảnh grid bằng `<DndContext><SortableContext>`:
   ```tsx
   import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
   import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
   import { CSS } from '@dnd-kit/utilities';
   ```
   - Component item:
   ```tsx
   function SortableImage({ id, img, onDelete }: { id: string; img: any; onDelete: () => void }) {
     const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
     return (
       <div ref={setNodeRef}
         style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
         {...attributes} {...listeners}
         className="relative cursor-grab active:cursor-grabbing">
         {/* existing img + delete button */}
       </div>
     );
   }
   ```
   - Mutation reorder:
   ```tsx
   const reorder = useMutation({
     mutationFn: ({ frameId, newOrder }: { frameId: string; newOrder: string[] }) =>
       reorderFrameImages(frameId, { newOrder }),
     onError: (e: any) => { qc.invalidateQueries({ queryKey: ['frames', projectId] }); toast.error('Reorder fail'); },
   });
   const onDragEnd = (frameId: string, images: any[]) => (event: DragEndEvent) => {
     const { active, over } = event;
     if (!over || active.id === over.id) return;
     const oldIndex = images.findIndex(i => i.id === active.id);
     const newIndex = images.findIndex(i => i.id === over.id);
     const newOrder = arrayMove(images, oldIndex, newIndex).map(i => i.id);
     // Optimistic: update local cache trước, sync sau
     qc.setQueryData(['frames', projectId], (old: any) =>
       old?.map((f: any) => f.id === frameId ? { ...f, images: arrayMove(f.images, oldIndex, newIndex) } : f)
     );
     reorder.mutate({ frameId, newOrder });
   };
   ```
   - Wrap grid:
   ```tsx
   <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd(frame.id, frame.images)}>
     <SortableContext items={frame.images.map((i: any) => i.id)} strategy={rectSortingStrategy}>
       <div className="grid grid-cols-... gap-...">
         {frame.images.map((img: any) => (
           <SortableImage key={img.id} id={img.id} img={img} onDelete={() => delImg.mutate(img.id)} />
         ))}
       </div>
     </SortableContext>
   </DndContext>
   ```

### Verify
```bash
# 1. Build FE
docker compose build frontend && docker compose up -d frontend

# 2. Vào /projects/[id]/frames, mở 1 frame có 3+ ảnh
# 3. Drag ảnh thứ 3 lên vị trí đầu → thả
# 4. Refresh page → thứ tự vẫn đúng (ảnh vừa kéo vẫn ở vị trí đầu)

# 5. BE verify thứ tự đã save
curl -s "http://localhost:3001/api/v1/frames/[frameId]" | jq '.images | map({id, sortOrder})'
# Expected: sortOrder tăng theo thứ tự hiện tại trên UI
```

### Gotcha
- **Optimistic update**: nếu BE fail, cần invalidate để rollback. Code mẫu đã handle ở `onError`.
- **Image render flicker**: nếu wrap toàn bộ img tag trong `<SortableImage>` mà không memoize → mỗi drag re-render hết. Dùng `React.memo` cho component item nếu thấy lag.
- **Click vs drag conflict**: button delete bên trong sortable → cần stopPropagation:
  ```tsx
  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} ...>
  ```
- **Touch trên mobile**: `@dnd-kit/core` cần `<PointerSensor activationConstraint={{ distance: 5 }}>` để tránh trigger drag khi user chỉ tap. Optional cho v1.

---

## Sau khi xong sprint

- [ ] Update [11-feature-checklists.md](11-feature-checklists.md) — tick `[x]` cho 5 items:
  - F4 Drag-drop reorder UI
  - F4 Bulk-upload (đã có sẵn — tick `[x]` ngay, ghi chú "đã có sẵn từ trước")
  - F5 Auto-test on add
  - F5 Telegram alert when key fail
  - F6 Cancel job
  - F6 Pagination
- [ ] `git add -A && git commit -m "feat: 5 quickwins (auto-test key, telegram alert, cancel job, pagination, drag-drop frames)"`
- [ ] Push branch + tạo PR
- [ ] **Delete file này** (`docs/sprint-quickwins.md`) — sprint done, doc đã archive trong git history

## Liên quan
- [11-feature-checklists.md](11-feature-checklists.md) — checklist tổng (source of truth)
- [02-architecture.md](02-architecture.md) — kiến trúc tổng
- [05-pipeline.md](05-pipeline.md) — luồng pipeline để context khi làm cancel job
