# Changelog

All notable changes to RunSight will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added
- Project scaffolding and directory structure
- CLI entry point with yargs (`runsight [path] [options]`)
- Programmatic API stub (`runSight(options)`)
- Logger with dual output (logs.txt + report.json)
- Project detector (Node.js, Python, static, monorepo)
- Port detector (stdout regex parsing + TCP polling)
- Project runner (install, start, port detect, process cleanup)
- Screenshotter (full-page PNG, blank screen detection)
- Video recorder (Playwright recordVideo, optional FFmpeg mp4 conversion)
- Heuristic exploration strategy (DOM element discovery + action execution)
- Priority-based exploration strategy (scored element ordering + visit tracker)
- LLM-guided exploration strategy (OpenAI GPT-4o + Anthropic Claude vision)
- Browser explorer (3-tier strategy orchestration, stop conditions, summary)
- Main orchestrator pipeline (detect → run → explore → capture → report)
