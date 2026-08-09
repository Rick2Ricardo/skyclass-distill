# Contributing

感谢你改进 AnyTeacher。

## 本地开发

```bash
npm install
cp .env.example .env
npm run dev
```

后端运行在 `:3000`，Vite 开发前端运行在 `:5173` 并代理 `/api`。

## 提交要求

- 不要提交 `.env`、API Key、Cookie、模型文件、课堂媒体、逐字稿或真实学生数据。
- 生产代码只进入 `apps/anyteacher/` 与 `packages/`；不要向 `legacy/` 增加新功能。
- 修改 API 或数据结构时同步更新 `packages/contracts`、前端调用和 README。
- 修改 Skill Schema 时同步更新蒸馏 Prompt、Skill builder、Pi runtime 和回归测试。
- 新功能必须补充 Vitest，并确保 `npm run check` 通过。
- 媒体采集不得绕过登录、付费、DRM 或访问控制。

## Pull Request

PR 应说明问题、实现方案、验证方法、兼容性影响和数据迁移方式。涉及 Skill 或实验结构变化时，请附去敏后的示例。
