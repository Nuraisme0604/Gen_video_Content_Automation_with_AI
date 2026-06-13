const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '02_scene_generation.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

function nodeCode(name) {
  const node = workflow.nodes.find((entry) => entry.name === name);
  assert.ok(node, `Missing workflow node: ${name}`);
  return node.parameters.jsCode;
}

function runCode(code, inputItems, namedNodes) {
  const $input = {
    all: () => inputItems,
    first: () => inputItems[0],
  };
  const $ = (name) => {
    const items = namedNodes[name];
    assert.ok(items, `Missing named-node fixture: ${name}`);
    return {
      all: () => items,
      first: () => items[0],
    };
  };
  return new Function('$input', '$', code)($input, $);
}

function sceneItem(index) {
  return {
    json: {
      episode_id: 'episode-1',
      title: 'Contract test',
      narration_script: 'Full narration',
      thumbnail_text: 'Thumbnail',
      seo_keywords: [],
      style_bible: 'cinematic',
      character_bible: '',
      scene: {
        scene_id: index + 1,
        start_sec: index * 8,
        end_sec: (index + 1) * 8,
        narration_text: `Narration ${index + 1}`,
        image_prompt: `Image ${index + 1}`,
      },
    },
  };
}

const sceneItems = Array.from({ length: 4 }, (_, index) => sceneItem(index));
const googleImageItems = sceneItems.map((_, index) => ({
  json: {
    candidates: [{
      content: {
        parts: [{
          inlineData: {
            mimeType: 'image/png',
            data: `image-${index + 1}`,
          },
        }],
      },
    }],
  },
}));
const openAiImageItems = sceneItems.map((_, index) => ({
  json: {
    data: [{
      b64_json: `openai-image-${index + 1}`,
    }],
  },
}));

const normalized = runCode(
  nodeCode('Code - Normalize Image'),
  googleImageItems,
  {
    'Code - Split Scenes': sceneItems,
    'Code - Validate Input': [{
      json: { providers: { image: { provider: 'google' } } },
    }],
  },
);

assert.equal(normalized.length, 4);
assert.equal(normalized[0].json.image_url, 'data:image/png;base64,image-1');
assert.equal(normalized[2].json.image_url, 'data:image/png;base64,image-3');
assert.equal(normalized[3].json.scene.scene_id, 4);

const openAiNormalized = runCode(
  nodeCode('Code - Normalize Image'),
  openAiImageItems,
  {
    'Code - Split Scenes': sceneItems,
    'Code - Validate Input': [{
      json: { providers: { image: { provider: 'openai' } } },
    }],
  },
);

assert.equal(openAiNormalized.length, 4);
assert.equal(openAiNormalized[0].json.image_url, 'data:image/png;base64,openai-image-1');
assert.equal(openAiNormalized[3].json.image_url, 'data:image/png;base64,openai-image-4');

const validateInput = [{
  json: {
    projectId: 'project-1',
    aspect_ratio: '16:9',
    scene_count: 4,
    scene_seconds: 8,
    providers: {
      image: { provider: 'google' },
      video: { provider: 'gemini_session', model: 'gemini-veo' },
    },
  },
}];
const manifestOutput = runCode(
  nodeCode('Code - Build Manifest'),
  normalized,
  { 'Code - Validate Input': validateInput },
);
const manifest = manifestOutput[0].json;

assert.equal(manifest.scenes.length, 4);
assert.equal(manifest.scenes[0].narration_text, 'Narration 1');
assert.equal(manifest.scenes[2].image_url, 'data:image/png;base64,image-3');
assert.equal(manifest.video_provider, 'gemini_session');
assert.ok(!Object.hasOwn(manifest.scenes[0], 'narration_excerpt'));

const failedGoogleItems = [...googleImageItems];
failedGoogleItems[2] = { json: { error: { message: 'Google image quota exceeded' } } };
assert.throws(
  () => runCode(
    nodeCode('Code - Normalize Image'),
    failedGoogleItems,
    {
      'Code - Split Scenes': sceneItems,
      'Code - Validate Input': [{
        json: { providers: { image: { provider: 'google' } } },
      }],
    },
  ),
  /Google image quota exceeded/,
);

assert.throws(
  () => runCode(
    nodeCode('Code - Build Manifest'),
    normalized.slice(0, 1),
    { 'Code - Validate Input': validateInput },
  ),
  /Manifest scene count mismatch/,
);

const sceneImageNode = workflow.nodes.find((entry) => entry.name === 'HTTP - Generate Scene Image');
assert.equal(sceneImageNode.parameters.method, 'POST');
assert.equal(sceneImageNode.parameters.sendBody, true);
assert.match(sceneImageNode.parameters.jsonBody, /contents/);
assert.match(sceneImageNode.parameters.jsonBody, /openai_image/);
assert.match(sceneImageNode.parameters.jsonBody, /1536x1024/);
assert.match(sceneImageNode.parameters.url, /openai/);
assert.doesNotMatch(sceneImageNode.parameters.url, /pexels/);

const cooldownNode = workflow.nodes.find((entry) => entry.name === 'Wait - Image API Cooldown');
assert.ok(cooldownNode);
assert.equal(cooldownNode.parameters.amount, 2);

console.log('workflow 02 contract tests passed');
