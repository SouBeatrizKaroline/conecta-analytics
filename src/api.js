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
      throw new Error(data.message ?? data.error?.message ?? 'Falha na API.');
    }
    return response;
  }
  async json(path, options) {
    const data = await (await this.get(path, options)).json();
    return data?.success === true && 'data' in data ? data.data : data;
  }
  async login(email, password) {
    const data = await this.json('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.token = data.token;
    return data;
  }
}
