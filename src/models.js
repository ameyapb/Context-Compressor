const ENCODING_CL100K = 'cl100k_base';
const ENCODING_O200K = 'o200k_base';

const DEFAULT_MODEL_ID = 'gpt-4o';

const SUPPORTED_MODELS = [
  {
    id: 'gpt-4o',
    label: 'GPT-4o / GPT-4o mini',
    description: 'Latest OpenAI models: o200k_base encoding',
    encoding: ENCODING_O200K,
    contextWindow: 128000,
    practicalTokenLimit: 25000,
  },
  {
    id: 'o1',
    label: 'o1 / o3',
    description: 'OpenAI reasoning models: o200k_base encoding',
    encoding: ENCODING_O200K,
    contextWindow: 200000,
    practicalTokenLimit: 30000,
  },
  {
    id: 'gpt-4',
    label: 'GPT-4 / GPT-4 Turbo',
    description: 'GPT-4 family: cl100k_base encoding',
    encoding: ENCODING_CL100K,
    contextWindow: 128000,
    practicalTokenLimit: 25000,
  },
  {
    id: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    description: 'GPT-3.5 family: cl100k_base encoding',
    encoding: ENCODING_CL100K,
    contextWindow: 16385,
    practicalTokenLimit: 12000,
  },
  {
    id: 'claude',
    label: 'Claude (approximation)',
    description: 'Claude models: approximated via cl100k_base; not exact',
    encoding: ENCODING_CL100K,
    contextWindow: 200000,
    practicalTokenLimit: 25000,
  },
];

function getEncoderForModel(modelId) {
  const model = SUPPORTED_MODELS.find((m) => m.id === modelId);
  const encoding = model ? model.encoding : ENCODING_CL100K;
  if (encoding === ENCODING_O200K) {
    return require('gpt-tokenizer/encoding/o200k_base').encode;
  }
  return require('gpt-tokenizer').encode;
}

function getModelById(modelId) {
  return SUPPORTED_MODELS.find((m) => m.id === modelId) ?? SUPPORTED_MODELS[0];
}

module.exports = { SUPPORTED_MODELS, DEFAULT_MODEL_ID, getEncoderForModel, getModelById };
