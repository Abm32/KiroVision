# Roadmap

## v0.1.0 — Pre-release (Current)

- [x] Project scaffolding and CLI
- [x] Project type detection (Node.js, Python, static)
- [x] Dependency installation and dev server management
- [x] Port detection from stdout + TCP polling
- [x] Playwright browser automation
- [x] 3-tier exploration: heuristic → priority → LLM
- [x] Full-page screenshot capture at each step
- [x] Session video recording via Playwright recordVideo
- [x] Dual output: logs.txt + report.json
- [x] OpenAI and Anthropic LLM vision integration
- [x] CLI with --no-video, --headless, --max-steps, --llm-provider flags
- [x] Blank screen detection
- [x] Action summary generation
- [x] Optional FFmpeg webm-to-mp4 conversion

## v1.0.0 — Production Ready

- [ ] Comprehensive test suite
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Error recovery and retry logic
- [ ] Configurable exploration depth per page
- [ ] Custom action scripts (user-defined exploration steps)
- [ ] HTML report with embedded screenshots

## v1.1.0+ — Future

- [ ] FFmpeg screen capture (outside-browser recording)
- [ ] Parallel multi-page exploration
- [ ] MCP server integration for agent tooling
- [ ] Accessibility audit during exploration
- [ ] Performance metrics collection (LCP, FID, CLS)
- [ ] PDF report generation
- [ ] Docker container for isolated execution
- [ ] Plugin system for custom strategies
