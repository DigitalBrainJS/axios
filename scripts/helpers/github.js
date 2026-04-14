import axios from '../../index.js';

const {GITHUB_TOKEN} = process.env;

GITHUB_TOKEN ? console.log(`[GITHUB_TOKEN OK]`) : console.warn(`[GITHUB_TOKEN is not defined]`);

class GithubAPI {
  constructor(owner, repo) {
    if (!owner) {
      throw new Error('repo owner must be specified');
    }

    if (!repo) {
      throw new Error('repo must be specified');
    }

    this.repo = repo;
    this.owner = owner;
    this.axios = axios.create({
      baseURL: `https://api.github.com/repos/${this.owner}/${this.repo}/`,
      headers: {
        Authorization: GITHUB_TOKEN ? `token ${GITHUB_TOKEN}` : null
      }
    })
  }

  async getComments(issue, {desc = false, per_page= 100, page = 1} = {}) {
    return (await this.axios.get(`/issues/${issue}/comments`, {
      params: {direction: desc ? 'desc' : 'asc', per_page, page}
    })).data;
  }

  async addComment(issue, body) {
    return (await this.axios.post(`/issues/${issue}/comments`, {body})).data;
  }

  async updateComment(id, body) {
    return (await this.axios.patch(`/issues/comments/${id}`, {body})).data;
  }

  async findCommentAndUpdate(issue, body, find){
    const comments = await this.getComments(issue);

    const existing = find && comments.find(find);

    if (existing) {
      return this.updateComment(existing.id, body);
    }

    return this.addComment(issue, body);
  }

  async getComment(id) {
    return (await this.axios.get(`/issues/comments/${id}`)).data;
  }

  async appendLabels(issue, labels) {
    return (await this.axios.post(`/issues/${issue}/labels`, {labels})).data;
  }

  async deleteLabel(issue, label) {
    return (await this.axios.delete(`/issues/${issue}/labels/${label}`)).data;
  }
}

export default new GithubAPI('DigitalBrainJS', 'axios');
