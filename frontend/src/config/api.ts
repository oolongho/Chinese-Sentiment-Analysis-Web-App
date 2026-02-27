export const API_BASE_URL = 'http://frp-cup.com:62207';

export const API_ENDPOINTS = {
  text: `${API_BASE_URL}/api/text`,
  audio: `${API_BASE_URL}/api/audio`,
  training: `${API_BASE_URL}/api/training`,
  performance: `${API_BASE_URL}/api/performance`,
  evaluation: `${API_BASE_URL}/api/evaluation`,
  api: `${API_BASE_URL}/api`,
};

export const EVALUATION_ENDPOINTS = {
  upload: `${API_BASE_URL}/api/evaluation/upload`,
  run: `${API_BASE_URL}/api/evaluation/run`,
  status: `${API_BASE_URL}/api/evaluation/status`,
  results: `${API_BASE_URL}/api/evaluation/results`,
};
