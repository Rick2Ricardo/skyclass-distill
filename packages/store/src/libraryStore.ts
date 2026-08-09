import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Project, VideoAsset } from "../../contracts/src/index.js";
import { listJson, readJson, writeJson } from "./fileStore.js";

type ProjectCreate = Pick<Project, "name" | "subject" | "grade"> & { description?: string };

function id(bytes = 6): string { return randomBytes(bytes).toString("hex"); }
function now(): string { return new Date().toISOString(); }

export class LibraryStore {
  readonly projectsDir: string;
  readonly videosDir: string;
  readonly deletedSkillsPath: string;

  constructor(readonly dataDir: string) {
    this.projectsDir = join(dataDir, "library", "projects");
    this.videosDir = join(dataDir, "library", "videos");
    this.deletedSkillsPath = join(dataDir, "library", "deleted_skills.json");
  }

  async createProject(input: ProjectCreate): Promise<Project> {
    const timestamp = now();
    const project: Project = {
      id: id(5),
      name: input.name.trim(),
      subject: input.subject.trim(),
      grade: input.grade.trim(),
      description: input.description?.trim() ?? "",
      created_at: timestamp,
      updated_at: timestamp,
    };
    await writeJson(join(this.projectsDir, `${project.id}.json`), { ...project, deleted_at: null });
    return project;
  }

  async getProject(projectId: string, includeDeleted = false): Promise<Project> {
    const project = await readJson<Project & { deleted_at?: string | null }>(join(this.projectsDir, `${projectId}.json`));
    if (!includeDeleted && project.deleted_at) throw new Error("项目不存在");
    return project;
  }

  async listProjects(): Promise<Project[]> {
    const projects = await listJson<Project & { deleted_at?: string | null }>(this.projectsDir);
    return projects.filter((item) => !item.deleted_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  async saveProject(project: Project & { deleted_at?: string | null }): Promise<void> {
    project.updated_at = now();
    await writeJson(join(this.projectsDir, `${project.id}.json`), project);
  }

  async deleteProject(projectId: string): Promise<Project> {
    const project = await this.getProject(projectId, true) as Project & { deleted_at?: string | null };
    project.deleted_at = now();
    await this.saveProject(project);
    return project;
  }

  async purgeProjectCatalog(projectId: string): Promise<void> {
    await rm(join(this.projectsDir, `${projectId}.json`), { force: true });
    for (const video of await this.listVideos(projectId, true)) await rm(join(this.videosDir, `${video.id}.json`), { force: true });
  }

  async saveVideo(video: VideoAsset & { deleted_at?: string | null }): Promise<void> {
    video.updated_at = now();
    await writeJson(join(this.videosDir, `${video.id}.json`), video);
    const project = await this.getProject(video.project_id, true) as Project & { deleted_at?: string | null };
    await this.saveProject(project);
  }

  async addVideo(values: Omit<VideoAsset, "id" | "created_at" | "updated_at">): Promise<VideoAsset> {
    const timestamp = now();
    const video: VideoAsset = { ...values, id: id(), created_at: timestamp, updated_at: timestamp };
    await this.saveVideo({ ...video, deleted_at: null });
    return video;
  }

  async getVideo(videoId: string): Promise<VideoAsset> {
    const video = await readJson<VideoAsset & { deleted_at?: string | null }>(join(this.videosDir, `${videoId}.json`));
    if (video.deleted_at) throw new Error("视频不存在");
    return video;
  }

  async listVideos(projectId: string, includeDeleted = false): Promise<VideoAsset[]> {
    const videos = await listJson<VideoAsset & { deleted_at?: string | null }>(this.videosDir);
    return videos
      .filter((item) => item.project_id === projectId && (includeDeleted || !item.deleted_at))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  async deleteVideos(projectId: string, videoIds: string[]): Promise<string[]> {
    const deleted: string[] = [];
    for (const videoId of videoIds) {
      const video = await readJson<VideoAsset & { deleted_at?: string | null }>(join(this.videosDir, `${videoId}.json`));
      if (video.project_id !== projectId) throw new Error("视频不属于当前项目");
      video.deleted_at = now();
      await this.saveVideo(video);
      deleted.push(videoId);
    }
    return deleted;
  }

  static skillKey(jobId: string, skillName: string): string { return `${jobId}:${skillName}`; }

  async skillDeleted(jobId: string, skillName: string): Promise<boolean> {
    const values = await readJson<string[]>(this.deletedSkillsPath, []);
    return values.includes(LibraryStore.skillKey(jobId, skillName));
  }

  async deleteSkill(jobId: string, skillName: string): Promise<void> {
    const values = await readJson<string[]>(this.deletedSkillsPath, []);
    const key = LibraryStore.skillKey(jobId, skillName);
    if (!values.includes(key)) values.push(key);
    await writeJson(this.deletedSkillsPath, values.sort());
  }
}
