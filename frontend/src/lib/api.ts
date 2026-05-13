import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// ---- Projects ----
export const getProjects = () => api.get('/projects').then(r => r.data);
export const getProject = (id: string) => api.get(`/projects/${id}`).then(r => r.data);
export const createProject = (data: any) => api.post('/projects', data).then(r => r.data);
export const updateProject = (id: string, data: any) => api.patch(`/projects/${id}`, data).then(r => r.data);
export const deleteProject = (id: string) => api.delete(`/projects/${id}`).then(r => r.data);

// ---- Videos ----
export const getVideos = (projectId?: string) =>
  api.get('/videos', { params: { projectId } }).then(r => r.data);
export const getVideo = (id: string) => api.get(`/videos/${id}`).then(r => r.data);
export const getVideoPreviewUrl = (id: string) => api.get(`/videos/${id}/preview-url`).then(r => r.data);
export const getVideoClips = (id: string) => api.get(`/videos/${id}/clips`).then(r => r.data);
export const updateVideo = (id: string, data: { title?: string; status?: string }) =>
  api.patch(`/videos/${id}`, data).then(r => r.data);
export const deleteVideo = (id: string) => api.delete(`/videos/${id}`).then(r => r.data);

// ---- Scenes ----
export const getScenes = (videoId: string) =>
  api.get(`/videos/${videoId}/scenes`).then(r => r.data);
export const regenerateScene = (id: string) => api.post(`/scenes/${id}/regenerate`).then(r => r.data);
export const updateScene = (id: string, data: any) => api.patch(`/scenes/${id}`, data).then(r => r.data);

// ---- Sources ----
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type VideoConfig = {
  sceneCount?: number;
  targetDurationSec?: number;
  aspectRatio?: AspectRatio;
};
export const createYoutubeSource = (data: { projectId: string; url: string } & VideoConfig) =>
  api.post('/sources/youtube', data).then(r => r.data);
export const createManualSource = (
  data: { projectId: string; title: string; script: string; disclaimerAccepted?: boolean } & VideoConfig,
) => api.post('/sources/manual', data).then(r => r.data);
export const getSources = (projectId: string) =>
  api.get(`/sources/project/${projectId}`).then(r => r.data);

// ---- Jobs ----
export const getJobs = (params?: { videoId?: string; projectId?: string; queue?: string; status?: string }) =>
  api.get('/jobs', { params }).then(r => r.data);
export const getJob = (id: string) => api.get(`/jobs/${id}`).then(r => r.data);

// ---- Characters ----
export const getCharacters = (projectId: string) =>
  api.get('/characters', { params: { projectId } }).then(r => r.data);
export const createCharacter = (data: { projectId: string; name: string; description: string; imageKey?: string }) =>
  api.post('/characters', data).then(r => r.data);
export const updateCharacter = (id: string, data: any) => api.patch(`/characters/${id}`, data).then(r => r.data);
export const deleteCharacter = (id: string) => api.delete(`/characters/${id}`).then(r => r.data);

// ---- Frames ----
export const getFrames = (projectId: string) =>
  api.get('/frames', { params: { projectId } }).then(r => r.data);
export const getFrame = (id: string) => api.get(`/frames/${id}`).then(r => r.data);
export const createFrame = (data: { projectId: string; name: string; description?: string }) =>
  api.post('/frames', data).then(r => r.data);
export const updateFrame = (id: string, data: any) => api.patch(`/frames/${id}`, data).then(r => r.data);
export const deleteFrame = (id: string) => api.delete(`/frames/${id}`).then(r => r.data);
export const addFrameImage = (frameId: string, data: { imageKey: string; prompt?: string }) =>
  api.post(`/frames/${frameId}/images`, data).then(r => r.data);
export const removeFrameImage = (imageId: string) => api.delete(`/frames/images/${imageId}`).then(r => r.data);

// ---- API Keys ----
export const getApiKeys = (projectId?: string) =>
  api.get('/api-keys', { params: { projectId } }).then(r => r.data);
export const createApiKey = (data: {
  provider: string;
  type: string;
  key: string;
  label?: string;
  projectId?: string;
  quotaLimit?: number;
}) => api.post('/api-keys', data).then(r => r.data);
export const toggleApiKey = (id: string) => api.patch(`/api-keys/${id}/toggle`).then(r => r.data);
export const deleteApiKey = (id: string) => api.delete(`/api-keys/${id}`).then(r => r.data);
export const resetApiKeyQuota = (id: string) => api.patch(`/api-keys/${id}/reset-quota`).then(r => r.data);
export const testApiKey = (data: { key: string; provider: string }) =>
  api.post('/api-keys/test', data).then(r => r.data);
export const testStoredApiKey = (id: string) =>
  api.post(`/api-keys/${id}/test`).then(r => r.data);

// ---- Notifications ----
export const getNotifications = (projectId?: string) =>
  api.get('/notifications', { params: { projectId } }).then(r => r.data);
export const testTelegram = () => api.post('/notifications/test-telegram').then(r => r.data);
