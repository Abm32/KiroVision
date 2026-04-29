'use strict';

const fs = require('fs');
const { findInteractableElements, executeAction } = require('../strategies/heuristicStrategy');
const { prioritizeElements, createVisitTracker } = require('../strategies/priorityStrategy');
const { getNextAction } = require('../strategies/llmStrategy');

/** Key name mapping for .runsight guide */
const KEY_MAP = {
  'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
  'space': 'Space', 'enter': 'Enter', 'escape': 'Escape', 'tab': 'Tab',
  'w': 'w', 's': 's', 'a': 'a', 'd': 'd',
  'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown', 'arrowleft': 'ArrowLeft', 'arrowright': 'ArrowRight'
};

/**
 * Parse keyboard actions from .runsight guide.
 * Looks for lines like: - Press ArrowUp to jump
 * @param {string|null} guide
 * @returns {Array<{key: string, description: string, delay: number}>}
 */
function parseKeyboardActions(guide) {
  if (!guide) return [];
  const actions = [];
  const lines = guide.split('\n');
  for (const line of lines) {
    const match = line.match(/[-*]\s*(?:Press|Key|press|key)\s+(\S+)\s*(.*)/i);
    if (match) {
      const rawKey = match[1].replace(/[`"']/g, '');
      const key = KEY_MAP[rawKey.toLowerCase()] || rawKey;
      const description = match[2].replace(/^[-—–:]\s*/, '').trim();
      actions.push({ key, description, delay: 500 });
    }
  }
  return actions;
}

/**
 * Autonomously explore a web page using the 3-tier strategy.
 * @param {import('playwright').Page} page
 * @param {Object} options
 * @param {import('../utils/logger').Logger} logger
 * @param {import('./screenshotter').Screenshotter} screenshotter
 * @returns {Promise<{steps: Array, summary: string}>}
 */
async function explore(page, options, logger, screenshotter) {
  const maxSteps = options.maxSteps || 15;
  const tracker = createVisitTracker();
  const history = [];
  const steps = [];
  let consecutiveErrors = 0;

  // Dismiss dialogs automatically
  page.on('dialog', async (dialog) => {
    logger.info(`Dialog dismissed: ${dialog.message().slice(0, 100)}`);
    await dialog.dismiss().catch(() => {});
  });

  // Capture page errors
  page.on('pageerror', (err) => {
    logger.error(`Page error: ${err.message}`);
  });

  // Mark initial URL as visited
  tracker.markVisited(page.url());

  for (let step = 1; step <= maxSteps; step++) {
    let chosen = null;
    try {
      // 1. Capture screenshot
      const ssPath = await screenshotter.capture(page, step, step === 1 ? 'initial' : 'step');
      logger.addScreenshot(step, ssPath);

      // 2. Check for blank screen
      const isBlank = await screenshotter.detectBlankScreen(page);
      if (isBlank) {
        logger.info('Blank screen detected — stopping exploration');
        break;
      }

      // 3. Find interactable elements (heuristic tier)
      let allElements = await findInteractableElements(page);

      // Filter out already-clicked elements
      let fresh = allElements.filter(el => !tracker.hasClicked(tracker.elementKey(el)));

      // If no fresh elements, perform keyboard actions (games) and poll for new UI
      if (!fresh.length) {
        const keys = parseKeyboardActions(options.guide);
        if (keys.length) {
          logger.info('Performing keyboard actions while waiting for UI...');
          for (let round = 0; round < 3; round++) {
            for (const key of keys) {
              await page.keyboard.press(key.key);
              logger.step(step, `Pressed ${key.key}`, key.description || '');
              step++;
              if (step > maxSteps) break;
              await page.waitForTimeout(key.delay || 500);
              // Take screenshot during gameplay
              const gSS = await screenshotter.capture(page, step - 1, 'gameplay');
              logger.addScreenshot(step - 1, gSS);
            }
            // Check if new DOM elements appeared
            allElements = await findInteractableElements(page);
            fresh = allElements.filter(el => !tracker.hasClicked(tracker.elementKey(el)));
            if (fresh.length || step > maxSteps) break;
            await page.waitForTimeout(1000);
          }
        }

        // Still no elements — poll for dynamic content
        if (!fresh.length && step <= maxSteps) {
          logger.info('Waiting for new UI elements...');
          for (let wait = 0; wait < 15; wait++) {
            await page.waitForTimeout(2000);
            allElements = await findInteractableElements(page);
            fresh = allElements.filter(el => !tracker.hasClicked(tracker.elementKey(el)));
            if (fresh.length) {
              logger.info(`New elements found after ${(wait + 1) * 2}s`);
              break;
            }
          }
        }

        if (!fresh.length) {
          logger.info('No new elements — stopping');
          break;
        }
      }

      if (!allElements.length) {
        logger.info('No interactable elements found — stopping');
        break;
      }

      // 4. Prioritize elements (priority tier)
      const prioritized = prioritizeElements(fresh);

      // 5. Choose element — LLM tier or top priority
      chosen = null;
      let choiceReason = '';

      if (options.llmProvider) {
        const screenshotBuf = fs.readFileSync(ssPath);
        const llmResult = await getNextAction(screenshotBuf, prioritized, history, options.llmProvider, options.guide || null);
        if (llmResult && llmResult.elementIndex >= 0 && llmResult.elementIndex < prioritized.length) {
          chosen = prioritized[llmResult.elementIndex];
          choiceReason = `LLM: ${llmResult.reason}`;
        }
      }

      if (!chosen) {
        chosen = prioritized[0];
        choiceReason = `Priority score: ${chosen.score}`;
      }

      // 6. Execute action
      const prevUrl = page.url();
      const actionDesc = await executeAction(page, chosen);

      // 7. Wait for potential navigation
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);

      // 8. Detect navigation
      const newUrl = page.url();
      const navigated = newUrl !== prevUrl;
      if (navigated) {
        tracker.markVisited(newUrl);
      }

      // 9. Log step
      const detail = `${choiceReason}${navigated ? ' → navigated to ' + new URL(newUrl).pathname : ''}`;
      logger.step(step, actionDesc, detail);
      tracker.markClicked(tracker.elementKey(chosen));
      history.push(actionDesc);
      steps.push({ step, action: actionDesc, detail, screenshot: ssPath });

      consecutiveErrors = 0;
    } catch (err) {
      // Mark element as clicked even on failure so we don't retry it
      if (chosen) tracker.markClicked(tracker.elementKey(chosen));
      consecutiveErrors++;
      logger.error(`Step ${step} failed: ${err.message}`);
      if (consecutiveErrors >= 3) {
        logger.info('Too many consecutive errors — stopping');
        break;
      }
    }
  }

  // Generate summary
  const summary = history.length
    ? history.join(' → ')
    : 'No actions taken';

  return { steps, summary };
}

module.exports = { explore };
