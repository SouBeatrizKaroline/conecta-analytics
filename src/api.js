export class Api {
  constructor(baseUrl, token = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }
  async get(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message ?? 'Falha na API.');
    }
    return response;
  }
  async json(path, options) {
    return (await this.get(path, options)).json();
  }
}
