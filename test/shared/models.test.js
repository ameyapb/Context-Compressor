'use strict';

const assert = require('node:assert/strict');
const { SUPPORTED_MODELS, DEFAULT_MODEL_ID, getEncoderForModel, getModelById } = require('../../src/shared/models');

describe('SUPPORTED_MODELS', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(SUPPORTED_MODELS));
    assert.ok(SUPPORTED_MODELS.length > 0);
  });

  it('each model has required fields with correct types', () => {
    for (const model of SUPPORTED_MODELS) {
      assert.equal(typeof model.id, 'string', `model.id should be string: ${JSON.stringify(model)}`);
      assert.ok(model.id.length > 0, 'model.id should be non-empty');
      assert.equal(typeof model.label, 'string');
      assert.ok(model.label.length > 0);
      assert.equal(typeof model.encoding, 'string');
      assert.ok(model.encoding.length > 0);
      assert.equal(typeof model.contextWindow, 'number');
      assert.ok(model.contextWindow > 0, 'contextWindow should be positive');
      assert.equal(typeof model.practicalTokenLimit, 'number');
      assert.ok(model.practicalTokenLimit > 0, 'practicalTokenLimit should be positive');
      assert.ok(
        model.practicalTokenLimit < model.contextWindow,
        `practicalTokenLimit must be below contextWindow for model ${model.id}`
      );
    }
  });

  it('all model ids are unique', () => {
    const ids = SUPPORTED_MODELS.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, 'all model ids should be unique');
  });

  it('all context windows are realistic token counts', () => {
    for (const model of SUPPORTED_MODELS) {
      assert.ok(model.contextWindow >= 1000, `contextWindow too small for model ${model.id}`);
    }
  });

  it('all practical token limits are within the research-backed quality range', () => {
    const PRACTICAL_LIMIT_MIN = 10000;
    const PRACTICAL_LIMIT_MAX = 35000;
    for (const model of SUPPORTED_MODELS) {
      assert.ok(
        model.practicalTokenLimit >= PRACTICAL_LIMIT_MIN,
        `practicalTokenLimit too small for model ${model.id}`
      );
      assert.ok(
        model.practicalTokenLimit <= PRACTICAL_LIMIT_MAX,
        `practicalTokenLimit too large for model ${model.id}`
      );
    }
  });
});

describe('DEFAULT_MODEL_ID', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof DEFAULT_MODEL_ID, 'string');
    assert.ok(DEFAULT_MODEL_ID.length > 0);
  });

  it('refers to a model present in SUPPORTED_MODELS', () => {
    const found = SUPPORTED_MODELS.some((m) => m.id === DEFAULT_MODEL_ID);
    assert.ok(found, `DEFAULT_MODEL_ID "${DEFAULT_MODEL_ID}" not found in SUPPORTED_MODELS`);
  });
});

describe('getModelById', () => {
  it('returns the correct model object for each known id', () => {
    for (const model of SUPPORTED_MODELS) {
      const result = getModelById(model.id);
      assert.equal(result.id, model.id);
      assert.equal(result.label, model.label);
      assert.equal(result.encoding, model.encoding);
      assert.equal(result.contextWindow, model.contextWindow);
    }
  });

  it('falls back to the first supported model for an unknown id', () => {
    const result = getModelById('__does_not_exist__');
    assert.equal(result.id, SUPPORTED_MODELS[0].id);
  });
});

describe('getEncoderForModel', () => {
  it('returns a function for every supported model id', () => {
    for (const model of SUPPORTED_MODELS) {
      const encoder = getEncoderForModel(model.id);
      assert.equal(typeof encoder, 'function', `encoder for model "${model.id}" should be a function`);
    }
  });

  it('returns a function even for an unknown model id', () => {
    const encoder = getEncoderForModel('__unknown__');
    assert.equal(typeof encoder, 'function');
  });

  it('the returned encoder tokenizes text into a non-empty array of numbers', () => {
    const encoder = getEncoderForModel(DEFAULT_MODEL_ID);
    const tokens = encoder('hello world');
    assert.ok(Array.isArray(tokens), 'encoder output should be an array');
    assert.ok(tokens.length > 0, 'encoder should produce at least one token');
    assert.ok(
      tokens.every((t) => typeof t === 'number'),
      'every token should be a number'
    );
  });

  it('different models with different encodings produce encoder functions', () => {
    const encoders = SUPPORTED_MODELS.map((m) => getEncoderForModel(m.id));
    for (const encoder of encoders) {
      const tokens = encoder('test');
      assert.ok(tokens.length > 0);
    }
  });
});
