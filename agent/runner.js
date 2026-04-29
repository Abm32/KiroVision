'use strict';

const { spawn } = require('child_process');
const { parsePortFromOutput, waitForPort } = require('../utils/portDetector');

/**
 * Install dependencies and start dev servers for detected projects.
 * @param {Array} projects - From detectProjects()
 * @param {import('../utils/logger').Logger} logger
 * @returns {Promise<Array<{process: ChildProcess, url: string, type: string, framework: string}>>}
 */
async function runProjects(projects, logger) {
  const running = [];

  for (const project of projects) {
    logger.info(`Setting up ${project.name} (${project.framework})`);

    // Install dependencies
    if (project.installCmd) {
      logger.info(`Installing: ${project.installCmd}`);
      await runCommand(project.installCmd, project.path, 120000);
    }

    // Start dev server
    logger.info(`Starting: ${project.runCmd}`);
    const { proc, port } = await startServer(project);
    const url = `http://localhost:${port}`;
    logger.info(`${project.name} ready at ${url}`);

    running.push({
      process: proc,
      url,
      type: project.type,
      framework: project.framework,
      name: project.name
    });
  }

  return running;
}

/**
 * Run a command and wait for it to complete.
 */
function runCommand(cmd, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = cmd.split(' ');
    const proc = spawn(bin, args, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms: ${cmd}`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}: ${cmd}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Start a dev server and detect its port.
 */
function startServer(project) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = project.runCmd.split(' ');
    const proc = spawn(bin, args, { cwd: project.path, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Fall back to expected port
        waitForPort(project.expectedPort, { timeout: 10000 })
          .then(() => resolve({ proc, port: project.expectedPort }))
          .catch(() => {
            proc.kill('SIGTERM');
            reject(new Error(`Server did not start: ${project.runCmd}`));
          });
      }
    }, 15000);

    function checkOutput(data) {
      if (resolved) return;
      const text = data.toString();
      const port = parsePortFromOutput(text);
      if (port) {
        resolved = true;
        clearTimeout(timeout);
        waitForPort(port, { timeout: 10000 })
          .then(() => resolve({ proc, port }))
          .catch(() => reject(new Error(`Port ${port} detected but not connectable`)));
      }
    }

    proc.stdout.on('data', checkOutput);
    proc.stderr.on('data', checkOutput);

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}: ${project.runCmd}`));
      }
    });
  });
}

/**
 * Kill all running server processes.
 * @param {Array<{process: ChildProcess}>} running
 */
function killAll(running) {
  for (const r of running) {
    if (r.process && !r.process.killed) {
      r.process.kill('SIGTERM');
      // Force kill after 5s
      setTimeout(() => {
        if (!r.process.killed) r.process.kill('SIGKILL');
      }, 5000);
    }
  }
}

/**
 * Identify the frontend service from running services.
 * Prefers static > nodejs > python.
 */
function identifyFrontend(running) {
  return running.find(r => r.type === 'static')
    || running.find(r => r.type === 'nodejs')
    || running[0]
    || null;
}

module.exports = { runProjects, killAll, identifyFrontend };
